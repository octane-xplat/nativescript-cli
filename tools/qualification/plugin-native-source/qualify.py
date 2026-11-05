#!/usr/bin/env python3
"""Run under native_builds:1: transitive plugin selector native/stamp matrix."""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import uuid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('workspace', type=Path)
parser.add_argument('consumer', type=Path)
parser.add_argument('evidence_prefix', type=Path)
parser.add_argument('canonical_archives', type=Path)
parser.add_argument('--resume-staged', action='store_true', help='reuse this owned staging only before any native state exists')
args = parser.parse_args()
repo = Path(__file__).resolve().parents[3]
workspace, prefix = args.workspace.resolve(), args.evidence_prefix.resolve()
if not workspace.is_relative_to(repo / '.cache') or workspace.exists() != args.resume_staged or list(prefix.parent.glob(prefix.name + '-*')):
    raise RuntimeError('Requires a new project-cache workspace and unused evidence prefix')
if shutil.disk_usage(workspace.parent).free < 2 * 1024**3:
    raise RuntimeError('At least 2 GiB project-cache headroom required before staging')
archives = [args.canonical_archives.resolve() / ('octane-xplat-' + name + '-0.19.0.tgz') for name in ['updates', 'fingerprint']]
if not all(file.is_file() for file in archives):
    raise RuntimeError('Existing reviewed canonical archives required')
app = workspace / 'app'
native_name, parent_name = 'plugin-selector-native-qualification', 'plugin-selector-parent-qualification'
native_source = app / 'fixture-native/native'
parent_source = app / 'fixture-native/parent'
declaration = {'ios': {'NativeSource': [{'name': 'Bridge', 'path': 'src/*.swift'}]}}
if not args.resume_staged:
    workspace.mkdir()
    subprocess.run([sys.executable, str(repo / 'tools/qualification/vite-config/stage.py'), str(app)], check=True)
    for directory in [native_source, parent_source]:
        directory.mkdir(parents=True)
        (directory / 'index.js').write_text('// Owned native qualification fixture\n')
    (native_source / 'src').mkdir()
    (native_source / 'package.json').write_text(json.dumps({'name': native_name, 'version': '1.0.0', 'nativescript': {'platforms': {'ios': '9.1.0'}}}))
    (parent_source / 'package.json').write_text(json.dumps({'name': parent_name, 'version': '1.0.0', 'dependencies': {native_name: 'file:../native'}}))
    (native_source / 'nativescript.config.cjs').write_text('module.exports=' + json.dumps(declaration) + ';\n')
    (native_source / 'src/Bridge.swift').write_text('import Foundation\n')
    subprocess.run(['bun', 'add', '--offline', '--ignore-scripts', './fixture-native/parent', *map(str, archives)], cwd=app, check=True)
elif (app / 'state').exists() or (app / 'platforms').exists():
    raise RuntimeError('Staging resume cannot replace any prior native attempt')
parent_owner = (app / 'node_modules' / parent_name).resolve(strict=True)
parent_manifest = json.loads((parent_owner / 'package.json').read_text())
if parent_manifest.get('name') != parent_name or native_name not in parent_manifest.get('dependencies', {}):
    raise RuntimeError('Installed parent does not declare the native child')
if native_name in json.loads((app / 'package.json').read_text()).get('dependencies', {}):
    raise RuntimeError('The native plugin must be transitive, not an app dependency')
owner_manifest = subprocess.check_output(['node', '-e', "process.stdout.write(require.resolve(process.argv[1]+'/package.json',{paths:[process.argv[2]]}))", native_name, str(parent_owner)], text=True)
owner = Path(owner_manifest).parent.resolve(strict=True)
if not owner.is_relative_to(workspace):
    raise RuntimeError('Refusing to alter a dependency outside this new owned fixture')
if json.loads((owner / 'package.json').read_text())['name'] != native_name:
    raise RuntimeError('Installed native package identity differs')
(app / 'nativescript.config.ts').write_text("export default {id:'org.example.pluginselectorota',appPath:'app',appResourcesPath:'App_Resources',cli:{packageManager:'bun'},bundler:'vite',bundlerConfigPath:'vite.config.mts'};\n")
nonce = uuid.uuid4().hex
(app / 'nonce').write_text(nonce)
(app / 'app/app.ts').write_text("console.log('Plugin selector native',__PROJECT_CONFIG_VALUE__);let tick=0;setInterval(()=>{const present=typeof PluginSelectorProbe!=='undefined';console.log('PLUGIN_SELECTOR_HEALTH '+JSON.stringify({nonce:'" + nonce + "',tick:++tick,present,value:present?PluginSelectorProbe.answer():null}));},250);\n")
clone = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True).clonefile
clone.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int]
clone.restype = ctypes.c_int
phases = {}


def replace_owned(file, text):
    # Break any package-manager hardlink rather than changing a shared inode.
    temporary = file.with_name(file.name + '.next-' + uuid.uuid4().hex)
    with temporary.open('x') as output:
        output.write(text)
    temporary.replace(file)


for phase, value in [('before', 111), ('changed', 222), ('removed', None)]:
    if shutil.disk_usage(workspace).free < 1280 * 1024**2:
        raise RuntimeError('Insufficient headroom for the next fresh native build')
    if value is not None:
        replace_owned(owner / 'src/Bridge.swift', 'import Foundation\n@_cdecl("plugin_selector_value") public func pluginSelectorValue() -> Int32 { ' + str(value) + ' }\n@objc(PluginSelectorProbe) public final class PluginSelectorProbe: NSObject { @objc public static func answer() -> Int32 { pluginSelectorValue() } }\n')
    replace_owned(owner / 'nativescript.config.cjs', 'module.exports=' + json.dumps(declaration if value is not None else {'ios': {'NativeSource': []}}) + ';\n')
    saved = Path(str(prefix) + '-' + phase)
    for suffix, source in [('.swift', owner / 'src/Bridge.swift'), ('.plugin.json', owner / 'package.json'), ('.plugin.cjs', owner / 'nativescript.config.cjs')]:
        with Path(str(saved) + suffix).open('xb') as output:
            output.write(source.read_bytes())
    facts = {'nativeName': native_name, 'parentName': parent_name, 'owner': str(owner), 'source': str(owner / 'src/Bridge.swift'),
             'transitive': True, 'selected': value is not None, 'expectedValue': value, 'nonce': nonce,
             'swiftSHA256': hashlib.sha256((owner / 'src/Bridge.swift').read_bytes()).hexdigest()}
    Path(str(saved) + '.source.json').write_text(json.dumps(facts, indent=2) + '\n')
    subprocess.run([str(args.consumer.resolve()), str(app), str(saved), 'release', 'ota'], check=True)
    result = json.loads(Path(str(saved) + '.json').read_text())
    if phase == 'before':
        build_info = subprocess.check_output(['go', 'version', '-m', str(args.consumer.resolve())], text=True)
        vcs = {line.split('=', 1)[0].split()[-1]: line.split('=', 1)[1] for line in build_info.splitlines()
               if '=' in line and line.strip().startswith('build') and line.split()[-1].startswith('vcs.')}
        identity = {'consumer': str(args.consumer.resolve()), 'consumerSHA256': hashlib.sha256(args.consumer.read_bytes()).hexdigest(),
                    'goVersion': build_info.splitlines()[0].split()[-1], 'vcs': vcs,
                    'packages': [{key: package[key] for key in ['Name', 'Version', 'Directory']} for package in result['project']['Packages']
                                 if package['Name'] in ['@nativescript/core', '@nativescript/ios', '@nativescript/vite', 'vite', 'typescript', '@octane-xplat/fingerprint', '@octane-xplat/updates']],
                    'canonicalArchives': {str(file): hashlib.sha256(file.read_bytes()).hexdigest() for file in archives}}
        Path(str(prefix) + '-identity.json').write_text(json.dumps(identity, indent=2) + '\n')
    artifact = Path(result['build']['Artifacts'][0]['Path']).resolve()
    retained = workspace / 'retained' / (phase + '.app')
    retained.mkdir(parents=True)
    inventory = {}
    for source in sorted(artifact.rglob('*')):
        destination = retained / source.relative_to(artifact)
        if source.is_symlink():
            raise RuntimeError('Unsupported native app symlink; refusing implicit copy')
        if source.is_dir():
            destination.mkdir(exist_ok=True)
        elif source.is_file():
            if clone(os.fsencode(source), os.fsencode(destination), 0):
                raise OSError(ctypes.get_errno(), 'clonefile failed; no deep-copy fallback')
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            if hashlib.sha256(destination.read_bytes()).hexdigest() != digest:
                raise RuntimeError('Retained app bytes differ')
            inventory[source.relative_to(artifact).as_posix()] = digest
        else:
            raise RuntimeError('Unsupported app entry')
    Path(str(saved) + '.retained-app.json').write_text(json.dumps({'path': str(retained), 'originalArtifact': str(artifact), 'filesSHA256': inventory}, indent=2) + '\n')
    inspection = subprocess.check_output([sys.executable, str(Path(__file__).with_name('inspect_native.py')), str(saved), 'removed' if value is None else str(value)], text=True)
    inspected = json.loads(inspection)
    Path(str(saved) + '.inspection.json').write_text(json.dumps(inspected, indent=2) + '\n')
    native = Path(result['build']['Prepared']['NativeDir']).resolve()
    scratch = artifact.parent.parent
    if not scratch.name.startswith('xcode-') or scratch.parent != native.parent or not scratch.is_relative_to(workspace) or scratch.is_symlink():
        raise RuntimeError('Refusing compiler scratch retirement outside this fixture')
    for suffix in ['.macho', '.fingerprint.json', '.stamp.json', '.main.m', '.pbxproj', '.evaluations.json', '.inspection.json', '.retained-app.json']:
        if not Path(str(saved) + suffix).is_file():
            raise RuntimeError('Missing retained evidence before owned scratch retirement')
    phases[phase] = {'hash': inspected['canonicalHash'], 'executableSHA256': result['executableSHA256'],
                     'expectedValue': value, 'retainedPrefix': str(saved), 'retainedApp': str(retained), 'retiredNewScratch': str(scratch)}
    shutil.rmtree(scratch)
if len({phase['hash'] for phase in phases.values()}) != 3:
    raise RuntimeError('Changed/removal canonical identities must differ')
summary = {'passed': True, 'phases': phases, 'workspace': str(workspace),
           'scope': 'Three actual public unsigned release simulator builds, transitive installed plugin NativeSource Swift change/removal, code and compiled OTA stamps; no runtime/installer/physical/original graph proof'}
Path(str(prefix) + '-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print('PASS transitive plugin selected Swift native change/removal and compiled canonical stamps')
