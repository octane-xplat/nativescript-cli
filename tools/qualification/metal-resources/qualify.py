#!/usr/bin/env python3
"""Broker-owned actual native source projection and precompiled shader copying.

The four effects iOS inputs remain byte-exact. A minimal native-only fixture
manifest supplies the published SwiftUI native dependency. No shader compiler,
guest, rendering, physical device, signing or OTA claim is made.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source_ios', type=Path, help='explicit original effects platforms/ios directory')
parser.add_argument('workspace', type=Path, help='new task-owned fixture directory')
parser.add_argument('consumer', type=Path, help='public selected-config Build consumer')
parser.add_argument('evidence_prefix', type=Path)
args = parser.parse_args()
source, workspace, prefix = args.source_ios.resolve(), args.workspace.resolve(), args.evidence_prefix.resolve()
files = ['src/XplatShaderEffect.swift', 'src/XplatBundledShaders.swift', 'Resources/OctaneShaders.metallib', 'Resources/OctaneShaders.sim.metallib']
hashes = {name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in files}
for name in files[2:]:
    if (source / name).read_bytes()[:4] != b'MTLB':
        raise RuntimeError('source is not the expected precompiled Metal library')
workspace.mkdir(parents=True, exist_ok=False)
app = workspace / 'app'
stage = Path(__file__).resolve().parents[1] / 'vite-config/stage.py'
subprocess.run([sys.executable, str(stage), str(app)], check=True)
package = app / 'fixture-native/shader-effects'
for name in files:
    target = package / 'platforms/ios' / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source / name, target)
(package / 'package.json').write_text(json.dumps({'name': 'native-shader-projection', 'version': '1.0.0', 'nativescript': {'platforms': {'ios': '9.1'}}, 'dependencies': {'@nativescript/swift-ui': '4.0.2'}}))
subprocess.run(['bun', 'add', '--offline', '--ignore-scripts', './fixture-native/shader-effects'], cwd=app, check=True)


def build(phase, present):
    saved = Path(str(prefix) + '-' + phase)
    subprocess.run([str(args.consumer.resolve()), str(app), str(saved), 'debug'], check=True)
    result = json.loads(Path(str(saved) + '.json').read_text())
    artifact = Path(result['build']['Artifacts'][0]['Path'])
    symbols = subprocess.check_output(['xcrun', 'nm', '-U', str(saved) + '.macho'], text=True)
    if ('_OBJC_CLASS_$_XplatShaderEffectProvider' in symbols) != present:
        raise RuntimeError('original native effects provider symbol membership differs')
    resources = {}
    for name in files[2:]:
        target = artifact / Path(name).name
        if present:
            digest = hashlib.sha256(target.read_bytes()).hexdigest()
            if digest != hashes[name]:
                raise RuntimeError('compiled shader bundle bytes differ from original source')
            resources[target.name] = digest
        elif target.exists():
            raise RuntimeError('removed shader resource remains in the next app')
    contributions = [c for c in result['project']['Contributions'] if c['Kind'] == 'resource' and c['Path'].endswith('.metallib')]
    if len(contributions) != (2 if present else 0):
        raise RuntimeError('shader resource producer/consumer membership differs')
    for contribution in contributions:
        if contribution['Platform'] != 'ios':
            raise RuntimeError('shader resource entered another platform')
    return {'buildEvidence': str(saved) + '.json', 'artifact': str(artifact), 'resources': resources, 'executableSHA256': result['executableSHA256']}


included = build('included', True)
manifest = app / 'package.json'
value = json.loads(manifest.read_text())
del value['dependencies']['native-shader-projection']
manifest.write_text(json.dumps(value, indent=2) + '\n')
subprocess.run(['bun', 'install', '--offline', '--ignore-scripts'], cwd=app, check=True)
removed = build('removed', False)
if any(hashlib.sha256((source / name).read_bytes()).hexdigest() != hashes[name] for name in files):
    raise RuntimeError('original effects inputs changed')
summary = {'passed': True, 'boundary': 'actual unsigned iOS debug compilation of four byte-exact native effects inputs, shader copy/removal; no rendering/runtime/full original graph/OTA/release claim',
           'source': str(source), 'sourceSHA256': hashes, 'nativeDependency': '@nativescript/swift-ui@4.0.2',
           'projection': 'native-only fixture manifest; original JS workspace/peer closure is not projected', 'included': included, 'removed': removed}
Path(str(prefix) + '-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print('PASS: unchanged native effects source compilation, exact shader bundle bytes and removal')
