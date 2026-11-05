#!/usr/bin/env python3
"""Build and run the task-owned native probe with broker and guest cleanup."""
import argparse
import json
from pathlib import Path
import subprocess
import uuid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('app', type=Path)
parser.add_argument('new_evidence_prefix', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
app, prefix = args.app.resolve(), args.new_evidence_prefix.resolve()
if not (app / 'runtime-probe.json').is_file() or list(prefix.parent.glob(prefix.name + '.*')):
    raise RuntimeError('requires staged probe and unused evidence prefix')
tools = root / '.cache' / ('preset-runtime-tools-' + uuid.uuid4().hex)
tools.mkdir()
for package, binary in [('consumer', 'build'), ('runtime-consumer', 'runtime')]:
    subprocess.run(['go', 'build', '-o', str(tools / binary), './tools/qualification/vite-config/' + package], cwd=root, check=True)

record = {'app': str(app), 'prefix': str(prefix), 'resources': []}
reservation, guest, installed, booted = None, None, None, False

def command(argv, **kwargs):
    return subprocess.run(argv, check=True, text=True, **kwargs)

def acquire(resources, purpose):
    result = command(['goddard-agent', 'resource', 'acquire', '--json', json.dumps({'resources': resources, 'purpose': purpose, 'wait_seconds': 1800}), '--output', 'json'], capture_output=True)
    identity = json.loads(result.stdout)['id']
    record['resources'].append({'action': 'acquire', 'id': identity, 'resources': resources})
    return identity

def release(identity):
    command(['goddard-agent', 'resource', 'release', identity, '--output', 'json'], capture_output=True)
    record['resources'].append({'action': 'release', 'id': identity})

try:
    reservation = acquire({'native_builds': 1}, 'patched pinned preset actual iOS probe compilation')
    with Path(str(prefix) + '.build.log').open('x') as log:
        command([str(tools / 'build'), str(app), str(prefix) + '.build', 'debug', 'pinned'], stdout=log, stderr=subprocess.STDOUT)
    build = json.loads(Path(str(prefix) + '.build.json').read_text())
    installed = build['build']['Artifacts'][0]['ApplicationID']
    guest = command(['xcrun', 'simctl', 'create', 'go-preset-' + uuid.uuid4().hex, 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro', 'com.apple.CoreSimulator.SimRuntime.iOS-27-0'], capture_output=True).stdout.strip()
    record['guest'] = guest
    release(reservation)
    reservation = None
    reservation = acquire({'resident_devices': 1, 'exclusive': ['ios:' + guest]}, 'patched preset native style and renderer lifecycle')
    command(['xcrun', 'simctl', 'boot', guest], capture_output=True)
    booted = True
    command(['xcrun', 'simctl', 'bootstatus', guest, '-b'], capture_output=True)
    with Path(str(prefix) + '.runtime.log').open('x') as log:
        command([str(tools / 'runtime'), str(app), str(prefix) + '.build.json', guest, str(prefix) + '.runtime.json'], stdout=log, stderr=subprocess.STDOUT)
    record['runtimePassed'] = True
finally:
    try:
        if guest:
            if booted:
                # The guest is newly created by this invocation. An absent app
                # is normal if startup failed before installation.
                present = subprocess.run(['xcrun', 'simctl', 'get_app_container', guest, installed, 'app'], capture_output=True)
                if present.returncode == 0:
                    command(['xcrun', 'simctl', 'uninstall', guest, installed], capture_output=True)
                    record['ownedInstallationRemoved'] = True
                command(['xcrun', 'simctl', 'shutdown', guest], capture_output=True)
                record['ownedBootRetired'] = True
            command(['xcrun', 'simctl', 'delete', guest], capture_output=True)
            record['ownedGuestDeleted'] = True
    finally:
        try:
            if reservation:
                release(reservation)
        finally:
            record['passed'] = bool(record.get('runtimePassed') and record.get('ownedGuestDeleted') and
                                    record.get('ownedInstallationRemoved') and record.get('ownedBootRetired') and
                                    sum(r['action'] == 'acquire' for r in record['resources']) ==
                                    sum(r['action'] == 'release' for r in record['resources']))
            Path(str(prefix) + '.ownership.json').write_text(json.dumps(record, indent=2) + '\n')
if not record['passed']:
    raise RuntimeError('native probe or owned-resource retirement incomplete')
print('PASS native probe; owned simulator, installation and broker reservations retired')
