#!/usr/bin/env python3
"""Public createUpdates check()/install() qualification over a caller-authorized
Portless HTTPS origin on one exact iOS release simulator.

Run inside the exact ios:UDID/resident_devices:1 device reservation after a
separate native_builds:1 build. The simulator must start Shutdown; the fixture
root comes from payloads.py. No device creation, TLS bypass or network change.
"""
import argparse, json, os, pathlib, subprocess, time

ROOT = pathlib.Path(__file__).resolve().parents[4]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('app', type=pathlib.Path)
p.add_argument('artifact', type=pathlib.Path)
p.add_argument('consumer', type=pathlib.Path)
p.add_argument('device')
p.add_argument('evidence', type=pathlib.Path)
p.add_argument('--origin', required=True)
p.add_argument('--fixture-root', type=pathlib.Path, required=True)
p.add_argument('--installation-owner', type=pathlib.Path)
a = p.parse_args()
a.app = a.app.resolve()
a.evidence.mkdir(parents=True, exist_ok=True)
fixture = a.fixture_root.resolve()
origin = a.origin.rstrip('/')
artifact = json.loads(a.artifact.read_text())
app_id = artifact['ApplicationID']
id = a.device
if app_id != 'org.nativescript.p91guard':
    raise RuntimeError('unexpected application identity')
if not origin.startswith('https://ns-ota-qualification.localhost:'):
    raise RuntimeError('origin must be the authorized ns-ota-qualification.localhost Portless route')


def sim(*args, check=True):
    return subprocess.run(['xcrun', 'simctl', *args], check=check, capture_output=True, text=True, timeout=120)


def routes():
    out = subprocess.run(['portless', 'list'], capture_output=True, text=True, timeout=30).stdout
    return out


def other_routes():
    return sorted(line.split()[0] for line in routes().splitlines()
                  if line.strip().startswith('https://') and 'ns-ota-qualification' not in line)


def state(name):
    path = state_root / name
    if not path.exists():
        return None
    return json.loads(path.read_text()) if name.endswith('.json') else path.read_text().strip()


devices = json.loads(sim('list', 'devices', 'available', '--json').stdout)
selected = [d for ds in devices['devices'].values() for d in ds if d['udid'] == id]
if len(selected) != 1 or selected[0]['state'] != 'Shutdown':
    raise RuntimeError('exact shutdown simulator required')
owner = a.installation_owner or a.evidence / 'installation-owned'
if sim('get_app_container', id, app_id, 'data', check=False).returncode == 0 and not owner.exists():
    raise RuntimeError('refusing existing unowned installation')
manifests = {}
for phase in ('v2', 'v3', 'v4', 'v5'):
    manifests[phase] = json.loads((fixture / 'manifests' / (phase + '.json')).read_text())
sha = {phase: m['sha256'] for phase, m in manifests.items()}
record = {'boundary': 'public createUpdates check/install over local Portless HTTPS on iOS release simulator; origin-unavailable (not device-offline) restore; no Android/physical/production-host claim',
          'device': id, 'origin': origin, 'artifact': artifact, 'bundles': {p: {'sha256': m['sha256'], 'size': m['size']} for p, m in manifests.items()},
          'phases': [], 'access': str(a.evidence / 'access.jsonl')}
documents = None
state_root = None
child = None
backend = None


def save():
    (a.evidence / 'result.json').write_text(json.dumps(record, indent=2) + '\n')


def access_lines():
    log = a.evidence / 'access.jsonl'
    return [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []


def container():
    """Resolve this app's live data container; marks the installation owned."""
    global documents, state_root
    data = sim('get_app_container', id, app_id, 'data', check=False)
    if data.returncode != 0:
        return None
    owner.touch()
    root = pathlib.Path(data.stdout.strip())
    record.setdefault('containers', [])
    if str(root) not in record['containers']:
        record['containers'].append(str(root))
    documents = root / 'Documents'
    state_root = root / 'Library/Application Support/xplat-ota'
    return root


def activate(phase):
    target = fixture / 'manifest.json'
    if phase is None:
        target.unlink(missing_ok=True)
    else:
        temp = fixture / '.manifest.tmp'
        temp.write_text(json.dumps(manifests[phase]))
        (a.evidence / ('manifest-' + phase + '.json')).write_text(json.dumps(manifests[phase], indent=2) + '\n')
        os.replace(temp, target)


def launch(label, marker, command=None, crash=False, deadline_s=180):
    global child, documents, state_root
    # Only this app's own data container is touched, resolved by simctl.
    if container():
        for stale in ('p91-ota-result.json', 'p91-health.json', 'p91-command.json'):
            (documents / stale).unlink(missing_ok=True)
        if command is not None:
            (documents / 'p91-command.json').write_text(json.dumps(command))
    elif command is not None:
        raise RuntimeError('a command needs the existing installation: ' + label)
    log = (a.evidence / (label + '.log')).open('w')
    access_before = len(access_lines())
    child = subprocess.Popen([str(a.consumer), 'hold', str(a.app), str(a.artifact), id],
                             stdin=subprocess.PIPE, stdout=log, stderr=subprocess.STDOUT, text=True)
    deadline = time.monotonic() + deadline_s
    health = result = {}
    expected_id = (command or {}).get('id', 'initial')
    while time.monotonic() < deadline:
        live = container()
        if live and not crash:
            try:
                health = json.loads((documents / 'p91-health.json').read_text())
                result = json.loads((documents / 'p91-ota-result.json').read_text())
            except (OSError, ValueError):
                pass
            if (health.get('nonce') == marker and health.get('ticks', 0) >= 4 and
                    result.get('id') == expected_id and result.get('done')):
                os.kill(health['pid'], 0)
                phase = {'name': label, 'health': health, 'result': result, 'state': {
                    name: state(name) for name in ('current.json', 'rejected.txt', 'mode.txt', 'fingerprint.txt')},
                    'pending': (state_root / 'pending.txt').read_text().strip() if (state_root / 'pending.txt').exists() else None,
                    'rollback': (state_root / 'rollback.txt').exists(), 'next': state('next/release.json'),
                    'access': access_lines()[access_before:], 'container': str(live)}
                record['phases'].append(phase)
                child.stdin.write('close\n')
                child.stdin.flush()
                child.wait(timeout=60)
                if child.returncode != 0:
                    raise RuntimeError('public session cleanup failed: ' + label)
                try:
                    os.kill(health['pid'], 0)
                except ProcessLookupError:
                    pass
                else:
                    raise RuntimeError('app PID survived cleanup: ' + label)
                log.close()
                child = None
                save()
                return phase
        if crash and live and (state_root / 'pending.txt').exists() and child.poll() is not None:
            pending = (state_root / 'pending.txt').read_text().strip()
            record['phases'].append({'name': label, 'exit': child.returncode, 'pending': pending,
                                     'access': access_lines()[access_before:]})
            log.close()
            child = None
            save()
            return pending
        if child.poll() is not None and not crash:
            record['lastObserved'] = {'label': label, 'health': health, 'result': result}
            raise RuntimeError('app exited during ' + label)
        time.sleep(0.2)
    record['lastObserved'] = {'label': label, 'health': health, 'result': result}
    diagnose(label)
    raise RuntimeError('runtime evidence timed out: ' + label)


def diagnose(label):
    """Record the stuck app's own state: Documents listing and a host stack sample."""
    live = container()
    record['lastObserved']['documents'] = sorted(p.name for p in documents.iterdir()) if live and documents.exists() else None
    pids = subprocess.run(['pgrep', '-f', id + '/data/Containers/Bundle/Application/.*/NativeScriptApp.app/NativeScriptApp'],
                          capture_output=True, text=True).stdout.split()
    record['lastObserved']['pids'] = pids
    for pid in pids[:1]:
        subprocess.run(['sample', pid, '3', '-file', str(a.evidence / (label + '.sample.txt'))],
                       capture_output=True, text=True, timeout=60)

try:
    record['otherRoutesBefore'] = other_routes()
    env = dict(os.environ, PORTLESS_SYNC_HOSTS='0')
    backend_log = (a.evidence / 'backend.log').open('w')
    backend = subprocess.Popen(['portless', 'ns-ota-qualification', 'python3', '-B',
                                str(ROOT / 'tools/qualification/ota/serve.py'), str(fixture),
                                '--access-log', str(a.evidence / 'access.jsonl')],
                               env=env, stdout=backend_log, stderr=subprocess.STDOUT)
    for _ in range(150):
        if origin in routes():
            break
        if backend.poll() is not None:
            raise RuntimeError('fixture backend exited; see backend.log')
        time.sleep(0.2)
    else:
        raise RuntimeError('Portless route never appeared for ' + origin)
    activate('v2')
    preflight = subprocess.run(['python3', '-B', str(ROOT / 'tools/qualification/ota/preflight.py'),
                                origin, 'ios', manifests['v2']['nativeFingerprint']],
                               capture_output=True, text=True, timeout=60)
    record['preflight'] = {'returncode': preflight.returncode, 'output': preflight.stdout + preflight.stderr}
    if preflight.returncode != 0:
        raise RuntimeError('host preflight failed: ' + preflight.stdout + preflight.stderr)
    sim('boot', id)
    sim('bootstatus', id, '-b')

    def expect(condition, message):
        if not condition:
            raise RuntimeError(message)

    # L1: no manifest -> no-release on a real guest request.
    activate(None)
    p1 = launch('l1-embedded-no-release', 'P91_EMBEDDED')
    r = p1['result']
    expect(r['before']['currentVersion'] == '1.0.0' and r['before']['stagedVersion'] is None, 'L1 baseline status')
    expect(r.get('check') == {'available': False, 'reason': 'no-release'}, 'L1 check: ' + json.dumps(r))
    expect(any(e['path'].startswith('/manifest') and e['status'] == 404 for e in p1['access']), 'L1 manifest 404 in access log')
    # L2: check+install+installTwice stage v2.
    activate('v2')
    p2 = launch('l2-check-install-v2', 'P91_EMBEDDED', {'id': 'l2', 'check': True, 'install': True, 'installTwice': True})
    r = p2['result']
    expect(r.get('check', {}).get('manifest', {}).get('sha256') == sha['v2'], 'L2 check manifest: ' + json.dumps(r))
    expect(r.get('installed') is True, 'L2 install: ' + json.dumps(r))
    expect('already staged' in r.get('secondInstallError', ''), 'L2 second install: ' + json.dumps(r))
    expect(r['after']['stagedVersion'] == '2.0.0' and r['after']['currentVersion'] == '1.0.0', 'L2 status: ' + json.dumps(r))
    expect(p2['next'] and p2['next']['sha256'] == sha['v2'], 'L2 next/release.json')
    expect(any(e['path'].startswith('/manifest') and e['status'] == 200 for e in p2['access']), 'L2 manifest in access log')
    expect(any(e['path'] == '/bundles/' + sha['v2'] and e['status'] == 200 for e in p2['access']), 'L2 bundle fetch in access log')
    # L3: v2 boots, confirms healthy, sees up-to-date.
    p3 = launch('l3-v2-confirm', 'P91_V2', {'id': 'l3', 'check': True})
    r = p3['result']
    expect(r['before']['currentVersion'] == '2.0.0' and r['before']['needsConfirmation'] is True, 'L3 pending status: ' + json.dumps(r))
    expect(r['afterHealthy']['needsConfirmation'] is False, 'L3 markHealthy: ' + json.dumps(r))
    expect(r.get('check', {}).get('reason') == 'up-to-date', 'L3 check: ' + json.dumps(r))
    expect(any(e['path'].startswith('/manifest') and e['status'] == 200 for e in p3['access']), 'L3 manifest in access log')
    expect(not any('/bundles/' in e['path'] for e in p3['access']), 'L3 must not download: ' + json.dumps(p3['access']))
    expect(p3['state']['current.json'] and p3['state']['current.json']['sha256'] == sha['v2'], 'L3 current.json')
    expect(p3['pending'] is None, 'L3 pending cleared')
    # L4: stage broken v3 for the crash/reject lifecycle.
    activate('v3')
    p4 = launch('l4-stage-v3', 'P91_V2', {'id': 'l4', 'check': True, 'install': True})
    expect(p4['result']['after']['stagedVersion'] == '3.0.0', 'L4 staged: ' + json.dumps(p4['result']))
    expect(any(e['path'] == '/bundles/' + sha['v3'] and e['status'] == 200 for e in p4['access']), 'L4 bundle fetch in access log')
    # L5: v3 fails boot verification, remains pending.
    pending = launch('l5-v3-boot-failure', None, crash=True)
    expect(pending == sha['v3'], 'L5 pending must be v3 sha: ' + str(pending))
    # L6: native recovery to v2; v3 is rejected on device and refuses install.
    p6 = launch('l6-rejected-v3', 'P91_V2', {'id': 'l6', 'check': True, 'install': True, 'installManifest': manifests['v3']})
    r = p6['result']
    expect(p6['state']['rejected.txt'] == sha['v3'], 'L6 rejected.txt')
    expect(p6['state']['current.json'] and p6['state']['current.json']['sha256'] == sha['v2'], 'L6 current.json')
    expect(r.get('check', {}).get('reason') == 'rejected', 'L6 check: ' + json.dumps(r))
    expect(not any('/bundles/' in e['path'] for e in p6['access']), 'L6 rejected must not download: ' + json.dumps(p6['access']))
    expect('failed a previous boot' in r.get('installError', ''), 'L6 install: ' + json.dumps(r))
    # L7: native-incompatible manifest is refused at both layers.
    activate('v4')
    p7 = launch('l7-native-incompatible', 'P91_V2', {'id': 'l7', 'check': True, 'install': True, 'installManifest': manifests['v4']})
    r = p7['result']
    expect(r.get('check', {}).get('reason') == 'native-incompatible', 'L7 check: ' + json.dumps(r))
    expect(not any('/bundles/' in e['path'] for e in p7['access']), 'L7 incompatible must not download: ' + json.dumps(p7['access']))
    expect('incompatible with this native fingerprint' in r.get('installError', ''), 'L7 install: ' + json.dumps(r))
    # L8: archive/native stamp mismatch is refused after download.
    activate('v5')
    p8 = launch('l8-payload-mismatch', 'P91_V2', {'id': 'l8', 'check': True, 'install': True})
    r = p8['result']
    expect(r.get('check', {}).get('manifest', {}).get('sha256') == sha['v5'], 'L8 check: ' + json.dumps(r))
    expect('does not match the installed native fingerprint' in r.get('installError', ''), 'L8 install: ' + json.dumps(r))
    expect(any(e['path'] == '/bundles/' + sha['v5'] and e['status'] == 200 for e in p8['access']), 'L8 bundle fetch in access log')
    expect(r['after']['stagedVersion'] is None and p8['next'] is None, 'L8 no staged update: ' + json.dumps(r))
    # Stop the backend; the route and the unrelated route must behave correctly.
    backend.terminate()
    backend.wait(timeout=30)
    backend = None
    for _ in range(50):
        listing = routes()
        if 'ns-ota-qualification' not in listing:
            break
        time.sleep(0.2)
    expect('ns-ota-qualification' not in listing, 'Portless route not removed')
    # Recorded only: unrelated routes belong to other processes and may change.
    record['otherRoutesAfter'] = other_routes()
    record['routeRemoved'] = True
    # L9: activated update boots with the origin unavailable; rollback requested.
    p9 = launch('l9-v2-offline-rollback', 'P91_V2', {'id': 'l9', 'check': True, 'rollback': True}, deadline_s=240)
    r = p9['result']
    expect('checkError' in r or 'check' in r, 'L9 check outcome missing: ' + json.dumps(r))
    expect(r.get('check', {}).get('available') is not True, 'L9 check must not be available: ' + json.dumps(r))
    expect(r.get('rollbackRequested') is True, 'L9 rollback flag: ' + json.dumps(r))
    expect(p9['rollback'] is True, 'L9 rollback.txt')
    # L10: embedded restored with origin unavailable.
    p10 = launch('l10-embedded-restored', 'P91_EMBEDDED', {'id': 'l10', 'check': False}, deadline_s=240)
    r = p10['result']
    expect(r['before']['currentVersion'] == '1.0.0', 'L10 embedded status: ' + json.dumps(r))
    expect(p10['state']['current.json'] is None, 'L10 current.json absent')
    expect(p10['state']['rejected.txt'] == sha['v2'], 'L10 rejected.txt must be v2 sha')
    record['passed'] = True
finally:
    if child:
        try:
            child.stdin.write('close\n')
            child.stdin.flush()
        except (BrokenPipeError, OSError):
            pass
        try:
            child.wait(timeout=60)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
    sim('terminate', id, app_id, check=False)
    if state_root and (state_root / 'fixture-error').exists():
        record['fixtureError'] = (state_root / 'fixture-error').read_text()
    try:
        if owner.exists():
            sim('uninstall', id, app_id)
            owner.unlink()
            gone = sim('get_app_container', id, app_id, 'data', check=False)
            if gone.returncode == 0:
                sim('uninstall', id, app_id)
                gone = sim('get_app_container', id, app_id, 'data', check=False)
            if gone.returncode == 0:
                raise RuntimeError('owned app survived uninstall')
            record['ownedAppUninstalled'] = True
    finally:
        if backend:
            backend.terminate()
            backend.wait(timeout=30)
            record['routeRemoved'] = 'ns-ota-qualification' not in routes()
        sim('shutdown', id, check=False)
        record['shutdown'] = True
        save()
print(json.dumps(record, indent=2))
