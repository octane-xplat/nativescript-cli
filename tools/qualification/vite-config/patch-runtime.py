#!/usr/bin/env python3
"""Apply pinned runtime patches to private copies in a task-owned fixture."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

from patch_format import normalize_vite_eof

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('workspace', type=Path)
args = parser.parse_args()
source, workspace = args.source.resolve(), args.workspace.resolve()
app = workspace / 'apps/mobile'
projection = json.loads((workspace / 'source-projection.json').read_text())
if projection.get('sourceReference') != 'b58567933b22fc6ff076f366fba61926a090f8e4':
    raise RuntimeError('workspace must be an explicitly staged pinned projection')
entry = 'packages/cli/src/vite.ts'
if hashlib.sha256((source / entry).read_bytes()).hexdigest() != projection['sourceSHA256'][entry]:
    raise RuntimeError('patch source does not match workspace projection')
output = workspace / 'patched-runtime'
output.mkdir()
manifest = []
def locate(base, name):
    script = "const fs=require('fs'),path=require('path'),{Module}=require('module');const p=Module._nodeModulePaths(process.argv[1]).map(p=>path.join(p,process.argv[2],'package.json')).find(fs.existsSync);if(!p)process.exit(1);process.stdout.write(fs.realpathSync(path.dirname(p)));"
    return Path(subprocess.check_output(['node', '-e', script, str(base), name], text=True))
def patch(name, version, filename, base=app):
    original = locate(base, name)
    if not original.is_relative_to(workspace):
        raise RuntimeError('refusing to modify a package outside the owned workspace')
    pkg = json.loads((original / 'package.json').read_text())
    if pkg['version'] != version:
        raise RuntimeError(f'{name} version differs from pinned patch')
    target = output / name.replace('/', '__').replace('@', '')
    # copy2 duplicates file bytes, rather than modifying Bun's shared hardlinks.
    shutil.copytree(original, target, ignore=shutil.ignore_patterns('node_modules'), symlinks=True)
    patchfile = source / 'packages/cli/patches' / filename
    applied = patchfile
    normalization = None
    if name == '@nativescript/vite':
        # Split the single ambiguous EOF context line without changing code or
        # unrelated line endings; Git's ordinary context checks remain active.
        applied = output / 'vite-eof-normalized.patch'
        applied.write_bytes(normalize_vite_eof(patchfile.read_bytes(), (target / 'hmr/shared/vendor/manifest-collect.js').read_bytes()))
        normalization = 'split one EOF context line into equal delete/add; preserve all code and other annotations'
        command = ['git', 'apply', '--unsafe-paths', '--directory=' + str(target)]
        # Git can silently skip absolute --directory paths when its cwd is
        # inside another working tree. This owned driver has no repository.
        with tempfile.TemporaryDirectory(prefix='ns-patch-driver-') as driver:
            probe = subprocess.run(['git', 'rev-parse', '--is-inside-work-tree'], cwd=driver, capture_output=True)
            if probe.returncode == 0:
                raise RuntimeError('Patch driver must be outside a Git working tree')
            subprocess.run([*command, '--check', str(applied)], cwd=driver, check=True)
            subprocess.run([*command, str(applied)], cwd=driver, check=True)
    else:
        subprocess.run(['patch', '--dry-run', '-p1', '-i', str(patchfile)], cwd=target, check=True)
        subprocess.run(['patch', '-p1', '-i', str(patchfile)], cwd=target, check=True)
    backup = original.with_name(original.name + '-runtime-original')
    original.rename(backup)
    (target / 'node_modules').symlink_to(backup / 'node_modules' if (backup / 'node_modules').exists() else app / 'node_modules')
    original.symlink_to(target)
    manifest.append({'name':name,'version':version,'patchSHA256':hashlib.sha256(patchfile.read_bytes()).hexdigest(),'appliedPatchSHA256':hashlib.sha256(applied.read_bytes()).hexdigest(),'formatNormalization':normalization,'filesSHA256':{str(p.relative_to(target)):hashlib.sha256(p.read_bytes()).hexdigest() for p in target.rglob('*') if p.is_file() and 'node_modules' not in p.relative_to(target).parts}})
for name, version, filename in [
    ('@nativescript/core','9.1.3','@nativescript__core@9.1.3.patch'),
    ('octane','0.16.3','octane@0.16.3.patch'),
    ('@nativescript-community/octane','0.2.5','@nativescript-community__octane@0.2.5.patch'),
    ('@nativescript/vite','8.0.21','@nativescript__vite@8.0.21.patch'),
    ('@nativescript-community/vite-octane','0.2.1','@nativescript-community__vite-octane@0.2.1.patch'),
]:
    patch(name,version,filename)
engine = locate(app, '@nativescript/vite')
patch('css','3.0.0','css@3.0.0.patch',engine)
(workspace / 'runtime-patches.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Patched private runtime copies; originals and shared cache preserved. Runtime/alias qualification remains separate.')
