#!/usr/bin/env python3
"""Stage the locked published Xplat preset host fixture; no upstream CLI/scripts."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('cli_tarball', type=Path, help='published @octane-xplat/cli0.19 tarball')
parser.add_argument('output', type=Path, help='new task-owned project cache app')
args = parser.parse_args()
tarball = args.cli_tarball.resolve()
expected = 'f2ed1c018ee831e9025da3eb793d0886109ca9daa982e054bb4399c24756261f'
if hashlib.sha256(tarball.read_bytes()).hexdigest() != expected:
    raise RuntimeError('CLI tarball differs from the qualified published payload')
destination = args.output.resolve()
shutil.copytree(Path(__file__).resolve().parent / 'xplat', destination)
(destination / 'App_Resources').mkdir()
(destination / 'dependencies').mkdir()
shutil.copyfile(tarball, destination / 'dependencies/cli.tgz')
subprocess.run(['bun', 'install', '--offline', '--frozen-lockfile', '--ignore-scripts'], cwd=destination, check=True)
for manifest in (destination / 'node_modules').rglob('package.json'):
    try:
        name = json.loads(manifest.read_text()).get('name')
    except (OSError, ValueError):
        continue
    if name in ('nativescript', '@nativescript/cli'):
        raise RuntimeError('upstream NativeScript CLI installed')
if (destination / 'state').exists() or (destination / 'platforms').exists():
    raise RuntimeError('unexpected generated native tree')
print('Staged locked published Xplat host fixture:', destination)
