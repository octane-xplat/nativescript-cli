#!/usr/bin/env python3
"""Create a private diagnostic overlay of a preserved historical Mason fixture.

Uses clonefile for regular inputs and read-only dependency references. This is
not verification of an upstream Git tree or promotion of legacy patch evidence.
"""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('preserved_workspace', type=Path)
parser.add_argument('new_workspace', type=Path)
args = parser.parse_args()
source, destination = args.preserved_workspace.resolve(), args.new_workspace.resolve()
if sys.platform != 'darwin' or not (source / 'apps/mobile/runtime-probe.json').is_file():
    raise RuntimeError('Requires Darwin and a preserved staged runtime fixture')
if shutil.disk_usage(destination.parent).free < 1536 * 1024**2:
    raise RuntimeError('At least 1.5 GiB project-cache headroom required')
destination.mkdir(exist_ok=False)
clone = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True).clonefile
clone.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int]
clone.restype = ctypes.c_int
inputs, links = {}, {}


def copy(original, target):
    if original.is_symlink():
        resolved = original.resolve(strict=True)
        target.symlink_to(resolved, target_is_directory=resolved.is_dir())
        links[str(target.relative_to(destination))] = str(resolved)
    elif original.is_dir():
        target.mkdir()
        for child in original.iterdir():
            if child.name == 'node_modules':
                resolved = child.resolve(strict=True)
                (target / child.name).symlink_to(resolved, target_is_directory=True)
                links[str((target / child.name).relative_to(destination))] = str(resolved)
            else:
                copy(child, target / child.name)
    elif original.is_file():
        if clone(os.fsencode(original), os.fsencode(target), 0) != 0:
            raise OSError(ctypes.get_errno(), 'clonefile failed; no deep-copy fallback')
        expected = hashlib.sha256(original.read_bytes()).hexdigest()
        if hashlib.sha256(target.read_bytes()).hexdigest() != expected:
            raise RuntimeError('Cloned source identity differs')
        inputs[str(target.relative_to(destination))] = expected
    else:
        raise RuntimeError('Unsupported fixture entry')


app = destination / 'apps/mobile'
app.mkdir(parents=True)
for name in ['package.json', 'bun.lock', 'nativescript.config.ts', 'vite.config.mts', 'src', 'App_Resources', 'dependencies']:
    original = source / 'apps/mobile' / name
    if original.exists():
        copy(original, app / name)
(app / 'node_modules').symlink_to((source / 'apps/mobile/node_modules').resolve(strict=True), target_is_directory=True)
links['apps/mobile/node_modules'] = str((source / 'apps/mobile/node_modules').resolve(strict=True))
(destination / 'node_modules').symlink_to(app / 'node_modules', target_is_directory=True)
links['node_modules'] = str(app / 'node_modules')
copy(source / 'packages', destination / 'packages')
for name in ['source-projection.json', 'runtime-patches.json']:
    copy(source / name, destination / name)
subprocess.run([sys.executable, str(Path(__file__).with_name('stage-runtime-probe.py')),
                str(source), str(destination), '--profile', 'mason'], check=True)
changed = [relative for relative, digest in inputs.items()
           if hashlib.sha256((destination / relative).read_bytes()).hexdigest() != digest]
allowed = {'apps/mobile/src/main.tsx', 'apps/mobile/src/runtime-nonce.ts',
           'apps/mobile/src/runtime.css', 'packages/app/src/runtime-probe.tsx', 'packages/app/package.json'}
if set(changed) - allowed:
    raise RuntimeError('Unexpected source overlay change')
record = {'scope': 'Private historical-input overlay; no upstream tree, canonical patch, native build or runtime acceptance',
          'source': str(source), 'inputsSHA256': inputs, 'dependencyLinks': links, 'changedProbeFiles': changed,
          'newTraceSHA256': hashlib.sha256((app / 'src/layout-trace.ts').read_bytes()).hexdigest()}
(destination / 'diagnostic-overlay.json').write_text(json.dumps(record, indent=2) + '\n')
print('Staged owned numeric Mason trace overlay; preserved fixture untouched')
