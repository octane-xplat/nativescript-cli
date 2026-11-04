#!/usr/bin/env python3
"""Stage a fresh iOS native HMR app from locked, already cached dependencies."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import uuid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path, help='new task-owned app directory')
args = parser.parse_args()
source = Path(__file__).resolve().parent / 'app'
destination = args.output.resolve()
shutil.copytree(source, destination)
nonce = str(uuid.uuid4())
entry = destination / 'app/app.ts'
entry.write_text(entry.read_text().replace('G5_NONCE', nonce))
(destination / 'nonce').write_text(nonce)
subprocess.run(['bun', 'install', '--offline', '--frozen-lockfile', '--ignore-scripts'], cwd=destination, check=True)
for manifest in (destination / 'node_modules').rglob('package.json'):
    try:
        name = json.loads(manifest.read_text()).get('name')
    except (OSError, ValueError):
        continue
    if name in ('nativescript', '@nativescript/cli'):
        raise RuntimeError('upstream CLI installed')
if (destination / 'platforms').exists() or (destination / 'state').exists():
    raise RuntimeError('unexpected pre-existing native tree')
print('Staged fresh locked native HMR app:', destination)
