#!/usr/bin/env python3
"""Project pinned preset sources into an already staged, task-owned workspace.

Before running, stage the published fixture at WORKSPACE/apps/mobile and install
@octane-xplat/bamboo0.19.0 and @bamboocss/dev1.60.1 there with scripts disabled.
This is a source projection, not the consumer package's release build procedure.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path, help='read-only b585679 pinned Xplat snapshot')
parser.add_argument('workspace', type=Path, help='task-owned staged workspace')
parser.add_argument('--preserve-app-sources', action='store_true', help='keep an already staged original app instead of writing the small host probe')
args = parser.parse_args()
source, workspace = args.source.resolve(), args.workspace.resolve()
app = workspace / 'apps/mobile'
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
if digest(source / 'packages/cli/src/vite.ts') != '1c946dcc3a6f014d32a7ef1bb402d94b0462671645b093c326257cbb9540e993':
    raise RuntimeError('pinned CLI entry source differs')
manifest = {'sourceReference': 'b58567933b22fc6ff076f366fba61926a090f8e4', 'sourceSHA256': {}, 'bundledSHA256': {}, 'appSourcesPreserved': args.preserve_app_sources}
if any(p.exists() or p.is_symlink() for p in [workspace / 'source-projection.json', workspace / 'node_modules', workspace / 'packages/cli', workspace / 'packages/bamboo']):
    raise RuntimeError('source projection requires unused owned destinations')
for name in ['cli', 'bamboo']:
    installed = app / 'node_modules/@octane-xplat' / name
    backup = installed.with_name(name + '-published-backup')
    if not installed.is_dir() or backup.exists() or backup.is_symlink():
        raise RuntimeError('source projection requires installed prerequisites and unused backups')
if args.preserve_app_sources:
    if not (app / 'src/index.ts').is_file() or not (workspace / 'packages/app/package.json').is_file():
        raise RuntimeError('preserved app requires staged mobile entry and shared ownership manifest')
    def app_sources():
        return {str(file.relative_to(workspace)): digest(file)
                for directory in [app / 'src', workspace / 'packages/app/src']
                for file in sorted(directory.rglob('*')) if file.is_file()}
    manifest['preservedAppSourcesSHA256'] = app_sources()
elif (workspace / 'packages/app/src').exists():
    raise RuntimeError('existing shared source requires --preserve-app-sources')
(workspace / 'node_modules').symlink_to(app / 'node_modules')
for name in ['cli', 'bamboo']:
    package = workspace / 'packages' / name
    package.mkdir(parents=True)
    shutil.copytree(source / 'packages' / name / 'src', package / 'src')
    shutil.copyfile(source / 'packages' / name / 'package.json', package / 'package.json')
    for file in sorted((source / 'packages' / name / 'src').rglob('*')):
        if file.is_file():
            relative = file.relative_to(source)
            manifest['sourceSHA256'][str(relative)] = digest(file)
            assert digest(package / file.relative_to(source / 'packages' / name)) == digest(file)
    installed = app / 'node_modules/@octane-xplat' / name
    backup = installed.with_name(name + '-published-backup')
    installed.rename(backup)
    dependencies = backup / 'node_modules'
    (package / 'node_modules').symlink_to(dependencies if dependencies.exists() else app / 'node_modules')
    entries = ['src/vite.ts'] if name == 'cli' else ['src/vite.ts', 'src/config.ts']
    subprocess.run(['bun', 'build', *entries, '--target=node', '--format=esm', '--packages=external', '--outdir=dist'], cwd=package, check=True)
    for file in (package / 'dist').glob('*.js'):
        manifest['bundledSHA256'][str(file.relative_to(workspace))] = digest(file)
    installed.symlink_to(package)
for relative, destination in [
    ('apps/mobile/vite.config.mts', app / 'vite.config.mts'),
    ('packages/app/bamboo.config.ts', workspace / 'packages/app/bamboo.config.ts'),
]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source / relative, destination)
    manifest['sourceSHA256'][relative] = digest(source / relative)
    assert digest(destination) == digest(source / relative)
if args.preserve_app_sources:
    if app_sources() != manifest['preservedAppSourcesSHA256']:
        raise RuntimeError('app sources changed during projection')
else:
    probe = workspace / 'packages/app/src/probe.tsx'
    probe.parent.mkdir(parents=True)
    probe.write_text("import {css} from 'styled-system/css'; export const probe=css({color:'primary',margin:'4'});\n")
    (app / 'src/main.tsx').write_text("export const Component=()=> <label text='PINNED_PRESET_20261105'/>; console.log('PINNED_PRESET_COMPONENT',Component);\n")
(workspace / 'source-projection.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Projected pinned sources; original Vite/Bamboo configs preserved')
