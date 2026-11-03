#!/usr/bin/env python3
"""Opt-in G3 clean distribution/build/device proof; no upstream CLI or native tree."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
import zipfile


def run(argv, **kwargs):
    return subprocess.run([str(x) for x in argv], check=True, **kwargs)


def device_phase(work, avd, port):
    serial = f'emulator-{port}'
    adb = Path(os.environ['ANDROID_HOME']) / 'platform-tools/adb'
    emulator = Path(os.environ['ANDROID_HOME']) / 'emulator/emulator'
    # This AVD was created solely for this invocation; never touch another serial.
    with (work / 'emulator.log').open('w') as log:
        process = subprocess.Popen([str(emulator), '-avd', avd, '-port', port,
                                    '-no-window', '-no-audio', '-no-snapshot', '-no-boot-anim'],
                                   stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 180
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError('owned emulator exited before boot')
                boot = subprocess.run([str(adb), '-s', serial, 'shell', 'getprop', 'sys.boot_completed'],
                                      capture_output=True, text=True, timeout=10)
                if boot.returncode == 0 and boot.stdout.strip() == '1':
                    break
                time.sleep(1)
            else:
                raise RuntimeError('owned emulator boot timed out')
            name = subprocess.check_output([str(adb), '-s', serial, 'emu', 'avd', 'name'], text=True, timeout=10)
            if name.splitlines()[0] != avd:
                raise RuntimeError('serial belongs to another AVD')
            run([work / 'device-bin', work / 'build.json', serial, (work / 'app/nonce').read_text()])
        finally:
            # Terminate our exact process, even if boot failed or the port collided.
            if process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=30)
        print('G3 owned emulator exited before reservation release', flush=True)


def main():
    if len(sys.argv) == 5 and sys.argv[1] == '--device-phase':
        device_phase(Path(sys.argv[2]), sys.argv[3], sys.argv[4])
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence-dir', required=True, type=Path, help='new directory for artifact and provenance')
    parser.add_argument('--system-image', default='system-images;android-35;google_apis;arm64-v8a')
    parser.add_argument('--port', type=int, default=5582, help='unused even emulator port')
    args = parser.parse_args()
    if args.port % 2 or not 5554 <= args.port <= 5682:
        parser.error('port must be even and between 5554 and 5682')
    evidence = args.evidence_dir.resolve()
    evidence.mkdir(parents=True, exist_ok=False)
    source = Path(__file__).resolve().parent
    repo = source.parents[2]
    sdk = Path(os.environ['ANDROID_HOME'])
    avdmanager = sdk / 'cmdline-tools/latest/bin/avdmanager'
    avd = 'nativescript-g3-' + uuid.uuid4().hex[:12]
    module = 'github.com/octane-xplat/nativescript-cli'
    version = 'v' + json.loads((repo / 'package.json').read_text())['version']
    with tempfile.TemporaryDirectory(prefix='g3 isolated ') as tmp:
        work = Path(tmp)
        try:
            app = work / 'app'
            shutil.copytree(source / 'app', app)
            nonce = str(uuid.uuid4())
            entry = app / 'app/app.js'
            entry.write_text(entry.read_text().replace('G3_NONCE', nonce))
            (app / 'nonce').write_text(nonce)
            run(['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], cwd=app)
            for manifest in (app / 'node_modules').rglob('package.json'):
                if json.loads(manifest.read_text()).get('name') in ('nativescript', '@nativescript/cli'):
                    raise RuntimeError('upstream CLI installed')
            if (app / 'platforms').exists() or (app / 'state').exists():
                raise RuntimeError('generated tree exists before public Build')
            proxy = work / 'proxy' / module / '@v'
            proxy.mkdir(parents=True)
            (proxy / (version + '.mod')).write_bytes((repo / 'go.mod').read_bytes())
            (proxy / (version + '.info')).write_text(json.dumps({'Version': version, 'Time': '2026-11-03T00:00:00Z'}))
            (proxy / 'list').write_text(version + '\n')
            files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=repo).decode().split('\0')
            with zipfile.ZipFile(proxy / (version + '.zip'), 'w') as archive:
                for file in files:
                    if file and (repo / file).is_file():
                        archive.write(repo / file, module + '@' + version + '/' + file)
            env = dict(os.environ, GOPROXY=(work / 'proxy').as_uri() + ',https://proxy.golang.org', GOSUMDB='off', GOMODCACHE=str(work / 'modcache'), GOWORK='off')
            for name in ('consumer', 'device'):
                dest = work / name
                dest.mkdir()
                shutil.copy(source / name / 'main.go', dest)
                (dest / 'go.mod').write_text(f'module example.invalid/g3{name}\n\ngo 1.26.0\n\nrequire {module} {version}\n')
                run(['go', 'mod', 'tidy'], cwd=dest, env=env)
                run(['go', 'build', '-o', work / (name + '-bin'), '.'], cwd=dest, env=env)
            tools = work / 'tools'
            tools.mkdir()
            for name in ('node', 'java', 'adb', 'aapt2'):
                path = shutil.which(name)
                if path:
                    (tools / name).symlink_to(path)
            runtime_env = dict(os.environ, PATH=str(tools) + ':/usr/bin:/bin:/usr/sbin:/sbin')
            runtime_env.pop('NODE_OPTIONS', None)
            runtime_env.pop('NODE_PATH', None)
            print('G3 clean app; no upstream CLI/tree; isolated module proxy; restricted runtime PATH', flush=True)
            with (work / 'build.json').open('w') as result:
                run([shutil.which('goddard-agent'), 'resource', 'run', '--json', json.dumps({'resources': {'native_builds': 1}, 'purpose': 'G3 fresh isolated Android public Build'}), '--', '/usr/bin/env', 'PATH=' + runtime_env['PATH'], work / 'consumer-bin', app, app / 'state'], cwd=work, env=dict(runtime_env, PATH=os.environ['PATH']), stdout=result)
            built = json.loads((work / 'build.json').read_text())
            artifact = built['Artifacts'][0]
            shutil.copy(artifact['Path'], evidence / 'app.apk')
            shutil.copy(work / 'build.json', evidence)
            run([avdmanager, 'create', 'avd', '--name', avd, '--package', args.system_image, '--device', 'pixel_6'], input='no\n', text=True)
            run([shutil.which('goddard-agent'), 'resource', 'run', '--json', json.dumps({'resources': {'exclusive': ['android:' + avd], 'resident_devices': 1}, 'purpose': 'G3 owned runtime health and cancellation'}), '--', sys.executable, source / 'qualify.py', '--device-phase', work, avd, str(args.port)], env=runtime_env)
            provenance = {'sourceRevision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip(), 'nonce': nonce, 'systemImage': args.system_image, 'avd': avd, 'serial': f'emulator-{args.port}', 'apkSHA256': hashlib.sha256((evidence / 'app.apk').read_bytes()).hexdigest(), 'target': artifact, 'runtime': '9.0.0', 'vite': '7.3.1', 'qualification': 'debug bundled emulator only'}
            (evidence / 'provenance.json').write_text(json.dumps(provenance, indent=2))
            print(json.dumps(provenance), flush=True)
            print('G3 PASS: fresh R1/V1/P2/B2/D2/W1 native metadata/binding/advancing health and cancellation', flush=True)
        finally:
            if (work / 'emulator.log').exists():
                shutil.copy(work / 'emulator.log', evidence)
            subprocess.run([str(avdmanager), 'delete', 'avd', '--name', avd], capture_output=True)


if __name__ == '__main__':
    main()
