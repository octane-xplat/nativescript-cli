#!/usr/bin/env python3
"""Opt-in G2: fresh npm app + external Go module, separate build/device leases."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import uuid
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--simulator-id', required=True, help='exact task-owned shutdown arm64 iOS simulator')
parser.add_argument('--build-only', action='store_true', help='component evidence only; skip device qualification')
args = parser.parse_args()
source = Path(__file__).resolve().parent
repo = source.parents[2]
module = 'github.com/octane-xplat/nativescript-cli'
version = 'v' + json.loads((repo / 'package.json').read_text())['version']

def run(argv, **kwargs):
    subprocess.run(argv, check=True, **kwargs)

with tempfile.TemporaryDirectory(prefix='g2 isolated ') as tmp:
    work = Path(tmp)
    app = work / 'app'
    shutil.copytree(source / 'app', app)
    nonce = str(uuid.uuid4())
    entry = app / 'app/app.js'
    entry.write_text(entry.read_text().replace('G2_NONCE', nonce))
    (app / 'nonce').write_text(nonce)
    run(['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], cwd=app)
    # Walk installed package identities, not merely the direct manifest.
    names = []
    for manifest in (app / 'node_modules').rglob('package.json'):
        try:
            names.append(json.loads(manifest.read_text()).get('name'))
        except (ValueError, OSError):
            pass
    if 'nativescript' in names or '@nativescript/cli' in names:
        raise RuntimeError('upstream CLI present')
    if (app / 'platforms').exists() or (app / 'state').exists():
        raise RuntimeError('native tree exists before Build')
    print('G2 fresh installed dependencies: runtime 8.9.0, Vite 7.3.1, local health plugin; no upstream CLI/tree', flush=True)
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
    consumer = work / 'consumer'
    consumer.mkdir()
    (consumer / 'main.go').write_bytes((source / 'consumer/main.go').read_bytes())
    (consumer / 'go.mod').write_text(f'module example.invalid/g2\n\ngo 1.26.0\n\nrequire {module} {version}\n')
    env = dict(os.environ, GOPROXY=(work / 'proxy').as_uri(), GOSUMDB='off', GOMODCACHE=str(work / 'modcache'), GOWORK='off')
    run(['go', 'mod', 'tidy'], cwd=consumer, env=env)
    binary = work / 'consumer-bin'
    run(['go', 'build', '-o', str(binary), '.'], cwd=consumer, env=env)
    # The running binary sees only Node and platform tools, never npm or either CLI.
    toolpath = work / 'tools'
    toolpath.mkdir()
    for name in ['node', 'xcrun', 'xcodebuild', 'clang', 'ditto', 'uname', 'which', 'swiftc']:
        path = shutil.which(name)
        if path:
            (toolpath / name).symlink_to(path)
    runtime_env = dict(os.environ, PATH=str(toolpath) + ':/usr/bin:/bin:/usr/sbin:/sbin')
    runtime_env.pop('NODE_OPTIONS', None)
    runtime_env.pop('NODE_PATH', None)
    saved = work / 'artifact.json'
    run(['goddard-agent', 'resource', 'run', '--json', json.dumps({'resources': {'native_builds': 1}, 'purpose': 'G2 fresh public-library iOS build'}), '--', '/usr/bin/env', 'PATH=' + runtime_env['PATH'], str(binary), 'build', str(app), str(saved), 'generic'], cwd=work, env=dict(runtime_env, PATH=os.environ['PATH']))
    if args.build_only:
        print('G2 BUILD ONLY: launch/health/cancellation gate NOT RUN', flush=True)
        raise SystemExit(0)
    # Resource broker needs its executable path; workload PATH is restricted separately.
    device_resources = {'exclusive': ['ios:' + args.simulator_id], 'resident_devices': 1}
    run(['goddard-agent', 'resource', 'run', '--json', json.dumps({'resources': device_resources, 'purpose': 'G2 nonce health and owned cancellation'}), '--', '/usr/bin/env', 'PATH=' + runtime_env['PATH'], str(binary), 'run', str(app), str(saved), args.simulator_id], cwd=work)
    print('G2 PASS: isolated module distribution -> R1/V1/P1/B1 -> D1/W1 -> advancing health -> cancellation cleanup', flush=True)
