#!/usr/bin/env python3
"""Actual Android debug guard/health qualification, not release OTA acceptance.
Run under android:nativescript-p91-ready-hoodoo/resident_devices:1 admission.
Creates, boots, shuts down and deletes only that task-owned AVD.
"""
import argparse, json, os, pathlib, subprocess, time
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('app', type=pathlib.Path)
p.add_argument('artifact', type=pathlib.Path)
p.add_argument('consumer', type=pathlib.Path)
p.add_argument('evidence', type=pathlib.Path)
p.add_argument('--port', type=int, default=5588)
p.add_argument('--sdk-baseline', action='store_true', help='qualify public createUpdates/core debug rejection, not release installation')
a = p.parse_args()
a.app = a.app.resolve()
a.artifact = a.artifact.resolve()
a.consumer = a.consumer.resolve()
a.evidence.mkdir(parents=True, exist_ok=True)
sdk = pathlib.Path(os.environ['ANDROID_HOME'])
adb = sdk / 'platform-tools/adb'
manager = sdk / 'cmdline-tools/latest/bin/avdmanager'
emulator = sdk / 'emulator/emulator'
avd = 'nativescript-p91-ready-hoodoo'
serial = 'emulator-' + str(a.port)
if a.port % 2 or not 5554 <= a.port <= 5682:
    raise RuntimeError('invalid emulator port')
artifact = json.loads(a.artifact.read_text())
pkg = artifact['ApplicationID']
nonce = (a.app / 'nonce').read_text() if (a.app / 'nonce').exists() else 'P91_ANDROID_NONCE'
if pkg != 'org.nativescript.p91guard' or artifact['Identity']['Target']['Configuration'] != 'debug':
    raise RuntimeError('expected genuine debug artifact')
if pathlib.Path.home().joinpath('.android/avd', avd + '.ini').exists():
    raise RuntimeError('refusing preexisting AVD')

def run(args, **kw):
    return subprocess.run([str(x) for x in args], check=True, capture_output=True, text=True, timeout=90, **kw)

def device(*args, check=True):
    return subprocess.run([str(adb), '-s', serial, *args], check=check, capture_output=True, text=True, timeout=30)
if serial in run([adb, 'devices']).stdout:
    raise RuntimeError('serial already in use')
record = {'boundary': 'real Android9.1 debug runtime + canonical debug-mode rejection; release OTA and public core SDK not qualified', 'serial': serial, 'avd': avd, 'artifact': artifact, 'phases': []}
if a.sdk_baseline:
    record['boundary'] = 'public createUpdates/core9.1.3 debug rejection with native storage; no release installer claim'
created = False
process = None
child = None

def save():
    (a.evidence / 'result.json').write_text(json.dumps(record, indent=2) + '\n')

def close_app():
    global child
    if child:
        if child.poll() is None:
            child.stdin.write('close\n')
            child.stdin.flush()
        child.wait(timeout=60)
        if child.returncode:
            raise RuntimeError('public Run cleanup failed')
        child = None
    if device('shell', 'pidof', pkg, check=False).stdout.strip():
        raise RuntimeError('app survived cancellation')

def launch(label):
    global child
    device('shell', 'run-as', pkg, 'rm', '-f', 'files/p91-health.json', check=False)
    log = (a.evidence / (label + '.log')).open('w')
    child = subprocess.Popen([str(a.consumer), 'hold', str(a.app), str(a.artifact), serial], stdin=subprocess.PIPE, stdout=log, stderr=subprocess.STDOUT, text=True)
    first = None
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if child.poll() is not None:
            raise RuntimeError('app exited: ' + label)
        result = device('shell', 'run-as', pkg, 'cat', 'files/p91-health.json', check=False)
        try:
            h = json.loads(result.stdout)
        except ValueError:
            h = {}
        if h.get('nonce') == nonce and h.get('mode') == 'debug' and h.get('rejected') and (h.get('native') == 'p91-real-native-health'):
            if first is None:
                first = h
            if h['ticks'] >= first['ticks'] + 5:
                if device('shell', 'pidof', pkg).stdout.strip() != str(h['pid']):
                    raise RuntimeError('health PID mismatch')
                record['phases'].append({'name': label, 'first': first, 'last': h})
                close_app()
                log.close()
                save()
                return
        time.sleep(0.2)
    raise RuntimeError('health timeout: ' + label)
try:
    run([manager, 'create', 'avd', '--name', avd, '--package', 'system-images;android-35;google_apis;arm64-v8a', '--device', 'pixel_6'], input='no\n')
    created = True
    with (a.evidence / 'emulator.log').open('w') as log:
        process = subprocess.Popen([str(emulator), '-avd', avd, '-port', str(a.port), '-no-window', '-no-audio', '-no-snapshot', '-no-boot-anim'], stdout=log, stderr=log)
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError('owned emulator exited')
            if device('shell', 'getprop', 'sys.boot_completed', check=False).stdout.strip() == '1':
                break
            time.sleep(1)
        else:
            raise RuntimeError('emulator boot timeout')
        if device('emu', 'avd', 'name').stdout.splitlines()[0] != avd:
            raise RuntimeError('serial belongs to another AVD')
        device('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable')
        device('shell', 'svc', 'wifi', 'disable')
        device('shell', 'svc', 'data', 'disable')
        record['airplaneMode'] = device('shell', 'settings', 'get', 'global', 'airplane_mode_on').stdout.strip()
        assert record['airplaneMode'] == '1'
        record['routes'] = device('shell', 'ip', 'route').stdout
        launch('debug-network-radios-disabled')
        stamp = device('shell', 'run-as', pkg, 'cat', 'files/xplat-ota/fingerprint.txt').stdout.strip()
        assert len(stamp) == 64 and record['phases'][0]['last']['hash'] == stamp
        device('shell', 'run-as', pkg, 'mkdir', '-p', 'files/xplat-ota/next/app')
        device('shell', 'run-as', pkg, 'touch', 'files/xplat-ota/next/release.json')
        launch('debug-ignores-staged-ota')
        assert device('shell', 'run-as', pkg, 'cat', 'files/xplat-ota/next/release.json').stdout == ''
        record['passed'] = True
finally:
    if child:
        try:
            close_app()
        except Exception:
            if child and child.poll() is None:
                child.kill()
                child.wait()
    if process:
        if process.poll() is None:
            process.terminate()
        try:
            process.wait(timeout=45)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=15)
        record['emulatorExited'] = process.poll() is not None
    if created:
        run([manager, 'delete', 'avd', '--name', avd])
        record['ownedAvdDeleted'] = True
    save()
print(json.dumps(record, indent=2))
