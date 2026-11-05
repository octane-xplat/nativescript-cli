#!/usr/bin/env python3
"""Opt-in G3 clean distribution/build/device proof; no upstream CLI or native tree."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import uuid
import zipfile

import existing_avd


def run(argv, **kwargs):
    return subprocess.run([str(x) for x in argv], check=True, **kwargs)


def fixture_package(work):
    """ApplicationID of the single fixture artifact in a public Build result."""
    built = json.loads((work / 'build.json').read_text())
    artifacts = built.get('Artifacts')
    package = artifacts[0].get('ApplicationID') if artifacts else built.get('ApplicationID')
    if not package:
        raise RuntimeError('fixture build result carries no ApplicationID')
    return package


def device_phase(work, port):
    serial = f'emulator-{port}'
    sdk = Path(os.environ['ANDROID_HOME'])
    adb_bin = sdk / 'platform-tools/adb'
    emulator = sdk / 'emulator/emulator'
    avd_home = existing_avd.existing_avd_home(Path.home(), sdk)
    existing_avd.ensure_no_android_emulator(sdk)

    def adb(*args):
        return subprocess.check_output([str(adb_bin), '-s', serial, *args], text=True, timeout=30)

    for occupied in (port, port + 1):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', occupied))
    # The caller owns the AVD; this phase owns only the boot and, once proven
    # absent, the fixture installation it is about to create.
    package = fixture_package(work)
    installation_owned = False
    # This AVD belongs to the caller; never touch another serial.
    with (work / 'emulator.log').open('w') as log:
        process = subprocess.Popen([str(emulator), '-avd', existing_avd.AVD, '-port', str(port),
                                    '-no-window', '-no-audio', '-no-snapshot', '-no-boot-anim'],
                                   stdout=log, stderr=log, env=existing_avd.emulator_env(avd_home))
        try:
            deadline = time.monotonic() + 180
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError('owned emulator exited before boot')
                boot = subprocess.run([str(adb_bin), '-s', serial, 'shell', 'getprop', 'sys.boot_completed'],
                                      capture_output=True, text=True, timeout=10)
                if boot.returncode == 0 and boot.stdout.strip() == '1':
                    break
                time.sleep(1)
            else:
                raise RuntimeError('owned emulator boot timed out')
            name = subprocess.check_output([str(adb_bin), '-s', serial, 'emu', 'avd', 'name'], text=True, timeout=10)
            if name.splitlines()[0] != existing_avd.AVD:
                raise RuntimeError('serial belongs to another AVD')
            if existing_avd.package_present(adb('shell', 'pm', 'list', 'packages', package), package):
                raise RuntimeError('refusing an existing fixture installation')
            installation_owned = True
            run([work / 'device-bin', work / 'build.json', serial, (work / 'app/nonce').read_text()])
            existing_avd.retire_owned_package(adb, package)
            installation_owned = False
        finally:
            try:
                if installation_owned:
                    existing_avd.retire_owned_package(adb, package)
                    installation_owned = False
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
    (work / 'device-phase.json').write_text(json.dumps({'avd': existing_avd.AVD, 'serial': serial,
                                                      'package': package, 'ownedInstallationRetired': True}) + '\n')


def main():
    if len(sys.argv) == 4 and sys.argv[1] == '--device-phase':
        device_phase(Path(sys.argv[2]), int(sys.argv[3]))
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence-dir', required=True, type=Path, help='new directory for artifact and provenance')
    parser.add_argument('--port', type=int, default=5582, help='unused even emulator port')
    args = parser.parse_args()
    if args.port % 2 or not 5554 <= args.port <= 5682:
        parser.error('port must be even and between 5554 and 5682')
    sdk = Path(os.environ['ANDROID_HOME'])
    existing_avd.existing_avd_home(Path.home(), sdk)
    evidence = args.evidence_dir.resolve()
    evidence.mkdir(parents=True, exist_ok=False)
    source = Path(__file__).resolve().parent
    repo = source.parents[2]
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
            run([shutil.which('goddard-agent'), 'resource', 'run', '--json', json.dumps({'resources': {'exclusive': ['android:' + existing_avd.AVD], 'resident_devices': 1}, 'purpose': 'G3 owned runtime health and cancellation'}), '--', sys.executable, source / 'qualify.py', '--device-phase', work, str(args.port)], env=runtime_env)
            phase = json.loads((work / 'device-phase.json').read_text())
            provenance = {'sourceRevision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip(), 'nonce': nonce, 'systemImage': existing_avd.IMAGE, 'avd': existing_avd.AVD, 'avdOwnership': 'caller-owned; never created, registered, rewritten or deleted', 'serial': f'emulator-{args.port}', 'apkSHA256': hashlib.sha256((evidence / 'app.apk').read_bytes()).hexdigest(), 'target': artifact, 'runtime': '9.0.0', 'vite': '7.3.1', 'qualification': 'debug bundled emulator only', 'ownedInstallationRetired': phase['ownedInstallationRetired']}
            (evidence / 'provenance.json').write_text(json.dumps(provenance, indent=2))
            print(json.dumps(provenance), flush=True)
            print('G3 PASS: fresh R1/V1/P2/B2/D2/W1 native metadata/binding/advancing health and cancellation', flush=True)
        finally:
            if (work / 'emulator.log').exists():
                shutil.copy(work / 'emulator.log', evidence)


if __name__ == '__main__':
    main()
