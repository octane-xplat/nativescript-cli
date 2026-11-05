#!/usr/bin/env python3
"""Run retained plugin-selector cases on only the prescribed existing guest."""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time

GUEST = '91D40099-A056-497D-A572-ADDDFD6A8F23'


def command(argv, **kwargs):
    return subprocess.run([str(arg) for arg in argv], check=True, capture_output=True, text=True, timeout=120, **kwargs)


def sim(*args):
    return command(['xcrun', 'simctl', *args])


def applications():
    text = sim('listapps', GUEST).stdout
    return json.loads(command(['plutil', '-convert', 'json', '-o', '-', '-'], input=text).stdout)


def app_pid(application):
    rows = sim('spawn', GUEST, 'launchctl', 'list').stdout.splitlines()
    matches = [line.split() for line in rows if len(line.split()) == 3 and
               line.split()[2].startswith('UIKitApplication:' + application + '[')]
    active = [int(row[0]) for row in matches if row[0].isdigit()]
    if len(active) > 1:
        raise RuntimeError('Multiple owned application processes')
    return active[0] if active else None


def sha(data):
    return hashlib.sha256(data).hexdigest()


def restage(retained, bundle, destination):
    """Clone one retained app and replace only app/bundle.mjs; never a Build."""
    source = Path(retained['path'])
    clone = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True).clonefile
    clone.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int]
    clone.restype = ctypes.c_int
    destination.mkdir()
    for relative in retained['filesSHA256']:
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if clone(os.fsencode(source / relative), os.fsencode(target), 0):
            raise OSError(ctypes.get_errno(), 'clonefile failed; no deep-copy fallback')
    staged = destination / 'app/bundle.mjs'
    staged.unlink()
    staged.write_bytes(bundle)
    after = {relative: sha((destination / relative).read_bytes()) for relative in retained['filesSHA256']}
    changed = sorted(name for name, digest in retained['filesSHA256'].items() if after[name] != digest)
    if changed != ['app/bundle.mjs'] or set(after) != set(retained['filesSHA256']):
        raise RuntimeError('Unexpected restaged app delta: ' + repr(changed))
    for relative, digest in retained['filesSHA256'].items():
        if sha((source / relative).read_bytes()) != digest:
            raise RuntimeError('Original retained app changed during restage')
    return {'path': str(destination), 'originalApp': str(source), 'changedFiles': changed,
            'filesSHA256': after, 'cloneMode': 'Darwin clonefile; no deep-copy fallback', 'nativeBuildPerformed': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('native_prefix', type=Path)
    parser.add_argument('consumer', type=Path)
    parser.add_argument('new_evidence_prefix', type=Path)
    parser.add_argument('--restage-bundle', type=Path, help='production host bundle.mjs to stage over each retained app')
    parser.add_argument('--restage-report', type=Path, help='host bundler report that names the bundle digest')
    parser.add_argument('--restage-dir', type=Path, help='new owned directory for JS-only restaged app clones')
    args = parser.parse_args()
    native_prefix, prefix = args.native_prefix.resolve(), args.new_evidence_prefix.resolve()
    if list(prefix.parent.glob(prefix.name + '.*')):
        raise RuntimeError('Runtime evidence prefix must be unused')
    restaging = [args.restage_bundle, args.restage_report, args.restage_dir]
    if any(restaging) and not all(restaging):
        raise RuntimeError('Restaging requires bundle, report and new directory')
    bundle, bundle_record = None, None
    if all(restaging):
        bundle = args.restage_bundle.read_bytes()
        report = json.loads(args.restage_report.read_text())
        if not report.get('passed') or report.get('configuration') != 'release' or report.get('platform') != 'ios' or \
                report['filesSHA256'].get('bundle.mjs') != sha(bundle):
            raise RuntimeError('Restage bundle must match a passed release iOS host bundler report')
        if args.restage_dir.exists():
            raise RuntimeError('Restage directory must be new')
        args.restage_dir.mkdir()
        bundle_record = {'bundle': str(args.restage_bundle.resolve()), 'bundleSHA256': sha(bundle),
                         'hostBundleReport': str(args.restage_report.resolve()), 'hostBundleScope': report['scope'],
                         'directory': str(args.restage_dir.resolve())}
    if shutil.disk_usage(tempfile.gettempdir()).free < 1536 * 1024**2:
        raise RuntimeError('At least1.5GiB system headroom required before boot')
    summary = json.loads(Path(str(native_prefix) + '-summary.json').read_text())
    if not summary['passed'] or set(summary['phases']) != {'before', 'changed', 'removed'}:
        raise RuntimeError('Complete compiled native matrix required')
    app = Path(summary['workspace']) / 'app'
    record = {'scope': 'Actual public Run of retained unsigned release simulator plugin-source artifacts; no fresh native compile, installer, signing or original graph proof',
              'guest': GUEST, 'guestOwnership': 'existing; never created, cloned or deleted', 'nativeSummary': str(native_prefix) + '-summary.json',
              'sourceMatrixScope': summary['scope'], 'jsRestage': bundle_record, 'phases': [], 'resources': []}
    if bundle_record:
        record['scope'] = ('Actual public Run of retained unsigned release simulator plugin-source native bytes with only app/bundle.mjs '
                           'restaged from a production host bundle; no fresh native compile, public Build, installer, signing or original graph proof')
    reservation, booted, owned, process, application = None, False, False, None, None

    def retire_installation():
        nonlocal owned
        if owned:
            if application in applications():
                sim('uninstall', GUEST, application)
            if application in applications():
                raise RuntimeError('Owned application survived uninstall')
            owned = False

    try:
        grant = command(['goddard-agent', 'resource', 'acquire', '--json', json.dumps({
            'resources': {'resident_devices': 1, 'exclusive': ['ios:' + GUEST]},
            'purpose': 'retained transitive plugin native-source class/value/removal runtime', 'wait_seconds': 0}), '--output', 'json'])
        reservation = json.loads(grant.stdout)['id']
        record['resources'].append({'action': 'acquire', 'id': reservation})
        devices = json.loads(sim('list', 'devices', 'available', '--json').stdout)
        selected = [device for group in devices['devices'].values() for device in group if device['udid'] == GUEST]
        if len(selected) != 1 or selected[0]['state'] != 'Shutdown':
            raise RuntimeError('Prescribed existing guest must be available and shutdown')
        sim('boot', GUEST)
        booted = True
        sim('bootstatus', GUEST, '-b')
        for phase, expected in [('before', 111), ('changed', 222), ('removed', None)]:
            case = summary['phases'][phase]
            saved = case['retainedPrefix']
            retained = json.loads(Path(saved + '.retained-app.json').read_text())
            for relative, digest in retained['filesSHA256'].items():
                if hashlib.sha256((Path(retained['path']) / relative).read_bytes()).hexdigest() != digest:
                    raise RuntimeError('Retained native app differs')
            built = json.loads(Path(saved + '.json').read_text())
            artifact = built['build']['Artifacts'][0]
            artifact['Path'] = retained['path']
            restaged = None
            if bundle is not None:
                restaged = restage(retained, bundle, args.restage_dir.resolve() / (phase + '.app'))
                artifact['Path'] = restaged['path']
            application = artifact['ApplicationID']
            if application != 'org.example.pluginselectorota':
                raise RuntimeError('Unexpected artifact application')
            stale = applications().get(application)
            if stale and not Path(stale['Path']).exists():
                # A prior owned uninstall was observed to reappear after shutdown with no bundle bytes.
                # Only that fixture registration is retired here as owned residue.
                sim('uninstall', GUEST, application)
                record.setdefault('staleRegistrationsRetired', []).append({'phase': phase, 'path': stale['Path']})
            if application in applications():
                raise RuntimeError('Unexpected artifact or preexisting caller installation')
            facts = json.loads(Path(saved + '.source.json').read_text())
            artifact_file = Path(str(prefix) + '.' + phase + '.artifact.json')
            with artifact_file.open('x') as output:
                output.write(json.dumps(artifact, indent=2) + '\n')
            owned = True
            log_file = Path(str(prefix) + '.' + phase + '.log')
            with log_file.open('x') as log:
                process = subprocess.Popen([str(args.consumer.resolve()), 'hold', str(app), str(artifact_file), GUEST],
                                           stdin=subprocess.PIPE, stdout=log, stderr=subprocess.STDOUT, text=True)
                first, last, samples = None, None, []
                deadline = time.monotonic() + 75
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        raise RuntimeError('Public Run exited before health: ' + phase)
                    try:
                        data = sim('get_app_container', GUEST, application, 'data').stdout.strip()
                    except subprocess.CalledProcessError:
                        time.sleep(0.2)
                        continue
                    health_file = Path(data) / 'Documents/go-plugin-selector-health.json'
                    try:
                        sample = json.loads(health_file.read_text())
                    except (FileNotFoundError, ValueError):
                        time.sleep(0.2)
                        continue
                    if sample.get('nonce') != facts['nonce']:
                        raise RuntimeError('Runtime health nonce differs')
                    record['lastObserved'] = sample
                    if sample.get('failure') or sample.get('present') != (expected is not None) or sample.get('value') != expected:
                        raise RuntimeError('Actual native class/value differs: ' + phase)
                    if not isinstance(sample.get('pid'), int) or sample['pid'] <= 0 or not sample.get('boot'):
                        raise RuntimeError('Runtime process identity missing')
                    first = first or sample
                    if sample['pid'] != first['pid'] or sample['boot'] != first['boot']:
                        raise RuntimeError('App restarted during native health observation')
                    samples.append(sample)
                    last = sample
                    if sample['tick'] >= first['tick'] + 8:
                        state = Path(data) / 'Library/Application Support/xplat-ota'
                        fingerprint = (state / 'fingerprint.txt').read_text()
                        mode = (state / 'mode.txt').read_text()
                        if fingerprint != case['hash'] or mode != 'release':
                            raise RuntimeError('Actual native release startup stamp differs')
                        launchd_pid = app_pid(application)
                        if launchd_pid != sample['pid']:
                            raise RuntimeError('Guest launchd application PID differs from native health PID')
                        break
                    time.sleep(0.2)
                else:
                    raise RuntimeError('Public Run readiness/owned PID timed out: ' + phase)
                process.stdin.write('close\n')
                process.stdin.flush()
                process.wait(timeout=75)
                if process.returncode:
                    raise RuntimeError('Public Run close failed: ' + phase)
                process = None
            text = log_file.read_text()
            pid = first['pid']
            # Public Run retains a bounded log buffer, so verbose guest logs can evict the launch line.
            launched = re.search(re.escape(application) + r': (\d+)', text)
            if launched and int(launched.group(1)) != pid:
                raise RuntimeError('Public launch PID differs from native health PID')
            if app_pid(application) is not None:
                raise RuntimeError('Owned application PID survived public Close')
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                pass
            else:
                raise RuntimeError('Observed application PID remains')
            retire_installation()
            record['phases'].append({'phase': phase, 'expected': expected, 'first': first, 'last': last,
                                     'samples': len(samples), 'observedPID': pid, 'launchdPID': launchd_pid,
                                     'publicLaunchLinePID': int(launched.group(1)) if launched else None, 'ownedPIDAbsent': True,
                                     'ownedInstallationRetired': True, 'artifact': artifact, 'restaged': restaged, 'log': str(log_file),
                                     'nativeStartupFingerprint': fingerprint, 'nativeStartupMode': mode})
        record['runtimePassed'] = True
    finally:
        try:
            if process is not None:
                if process.poll() is None:
                    try:
                        process.stdin.write('close\n')
                        process.stdin.flush()
                        process.wait(timeout=75)
                    except (BrokenPipeError, subprocess.TimeoutExpired):
                        process.kill()
                        process.wait(timeout=15)
                record['failedConsumerExit'] = process.returncode
            retire_installation()
        finally:
            try:
                if booted:
                    sim('shutdown', GUEST)
                    record['ownedBootRetired'] = True
            finally:
                try:
                    if reservation:
                        command(['goddard-agent', 'resource', 'release', reservation, '--output', 'json'])
                        record['resources'].append({'action': 'release', 'id': reservation})
                finally:
                    record['ownedInstallationRetired'] = not owned
                    record['passed'] = bool(record.get('runtimePassed') and record.get('ownedBootRetired') and not owned and
                                            len(record['resources']) == 2 and record['resources'][0]['id'] == record['resources'][1]['id'])
                    with Path(str(prefix) + '.runtime.json').open('x') as output:
                        output.write(json.dumps(record, indent=2) + '\n')
    print('PASS actual plugin Swift native values111/222, removed class absence, public Run and owned cleanup')


if __name__ == '__main__':
    main()
