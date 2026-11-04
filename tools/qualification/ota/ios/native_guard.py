#!/usr/bin/env python3
"""Actual iOS canonical native-guard component qualification, not OTA installer qualification.
Run inside the exact ios:UDID/resident_devices:1 reservation after a separate build.
No network server, core SDK adapter, screenshots, signing or device creation.
"""
import argparse, hashlib, io, json, os, pathlib, subprocess, time, zipfile
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('app', type=pathlib.Path)
p.add_argument('artifact', type=pathlib.Path)
p.add_argument('consumer', type=pathlib.Path)
p.add_argument('device')
p.add_argument('evidence', type=pathlib.Path)
p.add_argument('--sdk-baseline',action='store_true',help='public SDK/core release startup only; no staged payload lifecycle')
p.add_argument('--installation-owner',type=pathlib.Path,help='existing task-owned installation marker')
a = p.parse_args()
a.app = a.app.resolve()
a.artifact = a.artifact.resolve()
a.consumer = a.consumer.resolve()
a.evidence.mkdir(parents=True, exist_ok=True)
artifact = json.loads(a.artifact.read_text())
bundle = pathlib.Path(artifact['Path']) / 'app'
app_id = artifact['ApplicationID']
id = a.device
if app_id != 'org.nativescript.p91guard':
    raise RuntimeError('unexpected application identity')

def sim(*args, check=True):
    return subprocess.run(['xcrun', 'simctl', *args], check=check, capture_output=True, text=True, timeout=120)
devices = json.loads(sim('list', 'devices', 'available', '--json').stdout)
selected = [d for ds in devices['devices'].values() for d in ds if d['udid'] == id]
if len(selected) != 1 or selected[0]['state'] != 'Shutdown':
    raise RuntimeError('exact shutdown simulator required')
owner = a.installation_owner or a.evidence / 'installation-owned'
old = sim('get_app_container', id, app_id, 'data', check=False)
if old.returncode == 0 and (not owner.exists()):
    raise RuntimeError('refusing existing unowned installation')
record = {'boundary': 'real canonical native guard + canonical state methods with native storage; host staging; no public core SDK or installer/network claim', 'device': id, 'artifact': artifact, 'phases': []}
if a.sdk_baseline:
    record['boundary']='public createUpdates/core9.1.3 release baseline with native storage; no network installer or staged payload claim'
root = None
documents = None
child = None

def save():
    (a.evidence / 'result.json').write_text(json.dumps(record, indent=2) + '\n')

def launch(label, marker=None, crash=False):
    global child, root, documents
    if documents and (not crash):
        (documents / 'p91-health.json').unlink(missing_ok=True)
    log = (a.evidence / (label + '.log')).open('w')
    child = subprocess.Popen([str(a.consumer), 'hold', str(a.app), str(a.artifact), id], stdin=subprocess.PIPE, stdout=log, stderr=subprocess.STDOUT, text=True)
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        data = sim('get_app_container', id, app_id, 'data', check=False)
        if data.returncode == 0:
            owner.touch()
            record['container'] = data.stdout.strip()
            container = pathlib.Path(data.stdout.strip())
            documents = container / 'Documents'
            root = container / 'Library/Application Support/xplat-ota'
        if crash:
            if root and (root / 'pending.txt').exists() and (child.poll() is not None):
                record['phases'].append({'name': label, 'exit': child.returncode, 'pending': (root / 'pending.txt').read_text()})
                log.close()
                child = None
                save()
                return
        elif documents:
            try:
                h = json.loads((documents / 'p91-health.json').read_text())
            except (FileNotFoundError, ValueError):
                h = {}
            if h.get('nonce') == marker and h.get('ticks', 0) >= 4:
                os.kill(h['pid'], 0)
                record['phases'].append({'name': label, 'health': h, 'mode': (root / 'mode.txt').read_text(), 'current': json.loads((root / 'current.json').read_text()) if (root / 'current.json').exists() else None, 'pending': (root / 'pending.txt').exists()})
                child.stdin.write('close\n')
                child.stdin.flush()
                child.wait(timeout=60)
                if child.returncode != 0:
                    raise RuntimeError('public session cleanup failed: ' + label)
                try:
                    os.kill(h['pid'], 0)
                except ProcessLookupError:
                    pass
                else:
                    raise RuntimeError('app PID survived cleanup')
                log.close()
                child = None
                save()
                return
        if child.poll() is not None and (not crash):
            raise RuntimeError('app exited: ' + label)
        time.sleep(0.2)
    raise RuntimeError('runtime evidence timed out: ' + label)

def stage(version, marker, incompatible=False, broken=False):
    assert root
    next_dir = root / 'next'
    if next_dir.exists():
        raise RuntimeError('previous next state survived')
    stamp = json.loads((bundle / 'xplat-native.json').read_text())
    if incompatible:
        stamp['hash'] = '0' * 64
    source = (bundle / 'bundle.js').read_text().replace('P91_EMBEDDED', marker)
    if broken:
        source = 'throw new Error("P91 deliberate unconfirmed boot failure");\n'
    if incompatible:
        source = 'P91WriteState("executed-incompatible","1");\n' + source
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr('package.json', '{"main":"main.mjs"}')
        z.writestr('main.mjs', source)
        z.writestr('xplat-native.json', json.dumps(stamp))
    sha = hashlib.sha256(stream.getvalue()).hexdigest()
    release = {'version': version, 'sha256': sha, 'size': len(stream.getvalue()), 'nativeFingerprint': json.loads((bundle / 'xplat-native.json').read_text())['hash'], 'url': 'https://not-running.invalid/bundles/' + sha}
    (next_dir / 'app').mkdir(parents=True)
    with zipfile.ZipFile(stream) as z:
        z.extractall(next_dir / 'app')
    (next_dir / 'release.json').write_text(json.dumps(release))
    return sha
try:
    sim('boot', id)
    sim('bootstatus', id, '-b')
    if a.sdk_baseline:
        launch('public-sdk-release-baseline','P91_PUBLIC_SDK')
        status=json.loads((root/'sdk-status').read_text())
        assert status['supported'] is True and status['status']['currentVersion']=='1.0.0' and not status['status']['needsConfirmation']
        record['publicSDK']=status
    else:
        launch('embedded-offline', 'P91_EMBEDDED')
        assert (root / 'mode.txt').read_text() == 'release'
        assert (root / 'fingerprint.txt').read_text() == json.loads((bundle / 'xplat-native.json').read_text())['hash']
        good = stage('2.0.0', 'P91_V2')
        launch('activate-confirm-v2', 'P91_V2')
        assert not (root / 'pending.txt').exists() and json.loads((root / 'current.json').read_text())['sha256'] == good
        (documents / 'p91-health.json').unlink()
        bad = stage('3.0.0', 'P91_BAD', broken=True)
        launch('unconfirmed-failure', crash=True)
        launch('native-recovery-v2', 'P91_V2')
        assert (root / 'rejected.txt').read_text() == bad
        mismatch = stage('4.0.0', 'P91_CHANGED', incompatible=True)
        launch('changed-native-rejected', 'P91_V2')
        assert (root / 'rejected.txt').read_text() == mismatch and (not (root / 'executed-incompatible').exists())
        (documents / 'p91-rollback').write_text('1')
        launch('rollback-request', 'P91_V2')
        assert (root / 'rollback.txt').exists()
        launch('embedded-restored-offline', 'P91_EMBEDDED')
        assert not (root / 'current.json').exists()
    record['passed'] = True
finally:
    if child:
        if child.poll() is None:
            try:
                child.stdin.write('close\n')
                child.stdin.flush()
                child.wait(timeout=20)
            except (BrokenPipeError, subprocess.TimeoutExpired):
                child.kill()
                child.wait()
    sim('terminate', id, app_id, check=False)
    sim('shutdown', id)
    record['shutdown'] = True
    if root and (root / 'fixture-error').exists():
        record['fixtureError'] = (root / 'fixture-error').read_text()
    save()
print(json.dumps(record, indent=2))
