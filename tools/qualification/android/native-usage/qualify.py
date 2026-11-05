#!/usr/bin/env python3
"""Fresh offline-installed GestureHandler debug Build/Run on the caller-owned AVD."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import existing_avd


def run(argv, **kwargs):
    return subprocess.run([str(arg) for arg in argv], check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, help='new task-owned project-cache directory')
    parser.add_argument('--port', type=int, default=5582)
    args = parser.parse_args()
    if args.port % 2 or not 5554 <= args.port <= 5584:
        parser.error('port must be even in the ADB discovery range 5554..5584')
    sdk = Path(os.environ['ANDROID_HOME'])
    existing_avd.existing_avd_home(Path.home(), sdk)
    source = Path(__file__).resolve().parent
    repo = source.parents[3]
    work = args.output.resolve()
    if not work.is_relative_to(repo / '.cache'):
        parser.error('output must be inside this checkout’s .cache')
    work.mkdir(parents=True, exist_ok=False)
    # This is an existing debug key check, never permission to generate a key.
    key = Path.home() / '.android/debug.keystore'
    if not key.is_file():
        raise RuntimeError('existing caller debug keystore required')
    def key_identity():
        stat = key.stat()
        return stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns
    existing_key = key_identity()
    app = work / 'app'
    run([sys.executable, repo / 'tools/qualification/vite-config/stage.py', app])
    run(['bun', 'add', '--offline', '--ignore-scripts', '@nativescript-community/gesturehandler@2.1.0'], cwd=app)
    nonce = uuid.uuid4().hex
    (app / 'nonce').write_text(nonce)
    (app / 'app/app.ts').write_text((source / 'app.ts').read_text().replace('NATIVE_USAGE_NONCE', nonce))
    (app / 'nativescript.config.ts').write_text("export default {id:'org.example.nativeusage',appPath:'app',appResourcesPath:'App_Resources',cli:{packageManager:'bun'},bundler:'vite',bundlerConfigPath:'vite.config.mts'};\n")
    run(['go', 'build', '-o', work / 'consumer-bin', './tools/qualification/android/consumer'], cwd=repo)
    run(['go', 'build', '-o', work / 'device-bin', './tools/qualification/android/native-usage/device'], cwd=repo)
    broker = shutil.which('goddard-agent')
    with (work / 'build.json').open('w') as result, (work / 'build.log').open('w') as log:
        request = {'resources': {'native_builds': 1}, 'purpose': 'GestureHandler fresh public Android debug Build'}
        run([broker, 'resource', 'run', '--json', json.dumps(request), '--', work / 'consumer-bin', app, app / 'state'], stdout=result, stderr=log)
    if key_identity() != existing_key:
        raise RuntimeError('existing caller debug keystore changed')
    built = json.loads((work / 'build.json').read_text())
    artifact = built['Artifacts'][0]
    evidence = {'productRevision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip(),
                'boundary': 'fresh installed SDK debug APK and actual class heartbeat only; no original graph/release/HMR/OTA claim',
                'apkSHA256': hashlib.sha256(Path(artifact['Path']).read_bytes()).hexdigest(),
                'lockSHA256': hashlib.sha256((app / 'bun.lock').read_bytes()).hexdigest(),
                'avd': existing_avd.AVD,
                'avdOwnership': 'caller-owned; never created, registered, rewritten or deleted'}
    for port in (args.port, args.port + 1):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', port))
    try:
        request = {'resources': {'resident_devices': 1, 'exclusive': ['android:' + existing_avd.AVD]},
                   'purpose': 'GestureHandler owned Android SDK class/heartbeat/cleanup'}
        # Reuse the existing identity-checked boot/process-retirement harness;
        # the new device consumer owns its distinct nonce/health assertions.
        with (work / 'device.log').open('w') as log:
            run([broker, 'resource', 'run', '--json', json.dumps(request), '--', sys.executable,
                 source.parent / 'qualify.py', '--device-phase', work, str(args.port)], stdout=log, stderr=log)
        runtime = json.loads((work / 'build.json.runtime.json').read_text())
        if not runtime.get('passed'):
            raise RuntimeError('native usage consumer did not pass')
        evidence['runtime'] = runtime
        phase = json.loads((work / 'device-phase.json').read_text())
        evidence['ownedInstallationRetired'] = phase['ownedInstallationRetired']
    finally:
        (work / 'evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
    print('PASS: native usage public Build, native class/nonce/heartbeat and owned cleanup:', work)


if __name__ == '__main__':
    main()
