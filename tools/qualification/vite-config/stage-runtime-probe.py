#!/usr/bin/env python3
"""Add a maintained runtime probe to a new task-owned patched source projection."""
import argparse
import hashlib
import json
from pathlib import Path
import secrets
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path, help='read-only pinned consumer source')
parser.add_argument('workspace', type=Path)
parser.add_argument('--profile', choices=['label', 'mason'], default='label')
args = parser.parse_args()
workspace = args.workspace.resolve()
app = workspace / 'apps/mobile'
if not (workspace / 'source-projection.json').is_file():
    raise RuntimeError('requires pinned source-projection marker')
if json.loads((workspace / 'source-projection.json').read_text())['sourceReference'] != 'b58567933b22fc6ff076f366fba61926a090f8e4':
    raise RuntimeError('requires qualified source reference')
patches = json.loads((workspace / 'runtime-patches.json').read_text())
if len(patches) != 6:
    raise RuntimeError('requires all six runtime patches')
for package in patches:
    installed = app / 'node_modules' / package['name']
    for name, digest in package['filesSHA256'].items():
        if hashlib.sha256((installed / name).read_bytes()).hexdigest() != digest:
            raise RuntimeError('patched source identity changed')
if (app / 'runtime-probe.json').exists() or (app / 'state').exists():
    raise RuntimeError('requires unused task-owned fixture')
fixture = Path(__file__).resolve().parent / 'runtime'
owner = args.source.resolve() / 'packages/app/package.json'
if hashlib.sha256(owner.read_bytes()).hexdigest() != '01163d6f214759b991efdaf8cd8c4988adec3a508190ae0521faac4ed886f2e4':
    raise RuntimeError('shared app manifest differs from pinned source')
owner_data = json.loads(owner.read_text())
if owner_data.get('name') != '@xplat/app' or 'octane' not in owner_data.get('devDependencies', {}):
    raise RuntimeError('requires original shared app compiler ownership manifest')
shutil.copyfile(owner, workspace / 'packages/app/package.json')
nonce = secrets.token_hex(16)
copies = {'main.tsx': app / 'src/main.tsx',
          'layout-trace.ts': app / 'src/layout-trace.ts',
          'runtime.css': app / 'src/runtime.css',
          'runtime-probe.tsx': workspace / 'packages/app/src/runtime-probe.tsx'}
hashes = {'packages/app/package.json': hashlib.sha256(owner.read_bytes()).hexdigest()}
for name, destination in copies.items():
    selected = 'runtime-probe-mason.tsx' if name == 'runtime-probe.tsx' and args.profile == 'mason' else name
    shutil.copyfile(fixture / selected, destination)
    hashes[name] = hashlib.sha256(destination.read_bytes()).hexdigest()
(app / 'src/runtime-nonce.ts').write_text('export const nonce=' + json.dumps(nonce) + ';\nexport const profile=' + json.dumps(args.profile) + ';\n')
(app / 'runtime-probe.json').write_text(json.dumps({'nonce': nonce, 'profile': args.profile, 'filesSHA256': hashes}, indent=2) + '\n')
print('Staged native preset lifecycle/style probe; original Vite/Bamboo configs unchanged')
