#!/usr/bin/env python3
"""Run a byte-verified probe on an existing shutdown guest, without deleting it."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('app', type=Path)
parser.add_argument('build_json', type=Path)
parser.add_argument('runtime_consumer', type=Path)
parser.add_argument('guest')
parser.add_argument('new_evidence_prefix', type=Path)
parser.add_argument('--prior-owned-run', type=Path,
                    help='Recover only an exact-byte installation identified by an earlier ownership receipt')
args = parser.parse_args()
app, build_file, consumer, prefix = (p.resolve() for p in
    (args.app, args.build_json, args.runtime_consumer, args.new_evidence_prefix))
if list(prefix.parent.glob(prefix.name + '.*')):
    raise RuntimeError('Requires unused evidence prefix')
if shutil.disk_usage(tempfile.gettempdir()).free < 1536 * 1024**2:
    raise RuntimeError('At least 1.5 GiB system-disk headroom required before booting a guest')
build = json.loads(build_file.read_text())
artifact = build['build']['Artifacts'][0]
binary = Path(artifact['Path'])
if artifact['Identity']['ProjectDir'] != str(app):
    raise RuntimeError('Build project differs')
expected = {binary / 'NativeScriptApp': build['executableSHA256']}
expected.update({binary / 'app' / name: digest for name, digest in build['bundledModules'].items()})
for path, digest in expected.items():
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise RuntimeError('Retained native bytes differ')
application = artifact['ApplicationID']
record = {'guest': args.guest, 'guestOwnership': 'existing; never created or deleted',
          'build': str(build_file), 'verifiedFiles': len(expected), 'resources': []}
reservation, booted, installation_owned = None, False, False


def command(argv, **kwargs):
    return subprocess.run(argv, check=True, text=True, **kwargs)


def simctl(*argv, **kwargs):
    return command(['xcrun', 'simctl', *argv], **kwargs)


def installed_applications():
    # simctl emits an OpenStep plist, which Python's plistlib cannot parse.
    listing = simctl('listapps', args.guest, capture_output=True).stdout
    return json.loads(command(['plutil', '-convert', 'json', '-o', '-', '-'],
                              input=listing, capture_output=True).stdout)


def verify_previous_installation():
    if args.prior_owned_run is None:
        raise RuntimeError('Caller-owned application already installed; refusing replacement')
    previous = json.loads(args.prior_owned_run.read_text())
    if (previous.get('guest') != args.guest or previous.get('build') != str(build_file) or
            previous.get('applicationAbsentBeforeRun') is not True or 'runtimeExitCode' not in previous):
        raise RuntimeError('Previous receipt does not identify this owned installation')
    location = Path(simctl('get_app_container', args.guest, application, 'app', capture_output=True).stdout.strip())
    for path, digest in expected.items():
        if hashlib.sha256((location / path.relative_to(binary)).read_bytes()).hexdigest() != digest:
            raise RuntimeError('Existing installation bytes differ; refusing replacement')
    record['priorOwnedInstallationVerified'] = str(args.prior_owned_run.resolve())


try:
    resources = {'resident_devices': 1, 'exclusive': ['ios:' + args.guest]}
    result = command(['goddard-agent', 'resource', 'acquire', '--json', json.dumps({
        'resources': resources, 'purpose': 'retained Mason numeric trace on existing shutdown guest',
        'wait_seconds': 0}), '--output', 'json'], capture_output=True)
    reservation = json.loads(result.stdout)['id']
    record['resources'].append({'action': 'acquire', 'id': reservation, 'resources': resources})
    devices = json.loads(simctl('list', 'devices', 'available', '--json', capture_output=True).stdout)
    selected = [d for guests in devices['devices'].values() for d in guests if d['udid'] == args.guest]
    if len(selected) != 1 or selected[0]['state'] != 'Shutdown':
        raise RuntimeError('Exact existing guest must be available and shutdown')
    simctl('boot', args.guest, capture_output=True)
    booted = True
    simctl('bootstatus', args.guest, '-b', capture_output=True)
    applications = installed_applications()
    if application in applications:
        verify_previous_installation()
    else:
        record['applicationAbsentBeforeRun'] = True
    installation_owned = True
    with Path(str(prefix) + '.runtime.log').open('x') as log:
        result = subprocess.run([str(consumer), str(app), str(build_file), args.guest,
                                 str(prefix) + '.runtime.json'], stdout=log, stderr=subprocess.STDOUT)
    record['runtimeExitCode'] = result.returncode
finally:
    try:
        if booted:
            try:
                if installation_owned:
                    if application in installed_applications():
                        simctl('uninstall', args.guest, application, capture_output=True)
                    # Wait for stable absence before retiring our boot. Simulator
                    # application registration can lag a successful uninstall.
                    for _ in range(5):
                        time.sleep(1)
                        if application in installed_applications():
                            raise RuntimeError('Owned application survived uninstall')
                    record['ownedInstallationRetired'] = True
            finally:
                simctl('shutdown', args.guest, capture_output=True)
                record['ownedBootRetired'] = True
    finally:
        try:
            if reservation:
                command(['goddard-agent', 'resource', 'release', reservation, '--output', 'json'], capture_output=True)
                record['resources'].append({'action': 'release', 'id': reservation})
        finally:
            record['cleanupPassed'] = bool((not installation_owned or record.get('ownedInstallationRetired')) and record.get('ownedBootRetired') and
                len(record['resources']) == 2)
            Path(str(prefix) + '.ownership.json').write_text(json.dumps(record, indent=2) + '\n')
if record.get('runtimeExitCode') != 0 or not record['cleanupPassed']:
    raise RuntimeError('Native probe failed or owned-resource retirement incomplete; see separate evidence')
print('PASS retained probe; existing guest preserved and owned resources retired')
