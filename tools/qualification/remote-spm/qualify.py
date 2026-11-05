#!/usr/bin/env python3
"""Qualify app exact-version and installed-plugin revision SPM plus removal.

Run under a native_builds:1 broker reservation. All authored changes are confined
to a new explicit fixture workspace; source/reference checkouts stay read-only.
No device, signing, trust or publishing operation is performed.
"""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('workspace', type=pathlib.Path)
p.add_argument('consumer', type=pathlib.Path)
p.add_argument('updates', type=pathlib.Path)
p.add_argument('fingerprint', type=pathlib.Path)
p.add_argument('bridge', type=pathlib.Path, help='explicit original XplatPulsarBridge.swift input')
p.add_argument('license', type=pathlib.Path, help='license belonging to the bridge input')
p.add_argument('evidence_prefix', type=pathlib.Path)
a = p.parse_args()
workspace, prefix = a.workspace.resolve(), a.evidence_prefix.resolve()
workspace.mkdir(parents=True, exist_ok=False)
app = workspace / 'apps/mobile'
stage = pathlib.Path(__file__).resolve().parents[1] / 'ota/stage-consumer.py'
subprocess.run(['python3', str(stage), 'ios', str(a.updates.resolve()), str(a.fingerprint.resolve()), str(app)], check=True)
original = a.bridge.read_bytes()
source = original.decode()
needle = 'public final class XplatPulsarBridge: NSObject'
if source.count(needle) != 1:
    raise RuntimeError('unknown bridge shape; do not silently rewrite it')
source = source.replace(needle, '@objc(H1Generated)\npublic final class H1Generated: NSObject')
shared = workspace / 'shared'
shared.mkdir()
(shared / 'H1Generated.swift').write_text(source)
(shared / 'LICENSE').write_bytes(a.license.read_bytes())
(app / 'nativescript.config.js').unlink()
config = app / 'nativescript.config.ts'
repository = 'https://github.com/software-mansion-labs/pulsar-ios'
declaration = lambda version: {'name': 'Pulsar', 'repositoryURL': repository, 'version': version, 'libs': ['Pulsar']}

def write_config(spm, sources=True):
    ios = {}
    if sources:
        ios['NativeSource'] = [{'name': 'H1Configured', 'path': '../../shared/**/*.swift'}]
    if spm:
        ios['SPMPackages'] = spm
    value = {'id': 'org.nativescript.p91guard', 'appPath': 'app', 'appResourcesPath': 'App_Resources', 'ios': ios}
    text = "import { NativeScriptConfig } from '@nativescript/core';\nexport default " + json.dumps(value) + ' as NativeScriptConfig;\n'
    config.write_text(text)
    return hashlib.sha256(text.encode()).hexdigest()

def run(phase, present):
    saved = pathlib.Path(str(prefix) + '-' + phase + '.json')
    subprocess.run([str(a.consumer.resolve()), str(app), str(saved), 'configured-with' if present else 'configured-removed'], check=True)
    result = json.loads(saved.read_text())
    if not result['passed'] or not result['embeddingGlobalsPreserved']:
        raise RuntimeError('consumer did not qualify')
    native = pathlib.Path(result['build']['Prepared']['NativeDir'])
    pinfile = native / 'NativeScriptApp.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved'
    pins = json.loads(pinfile.read_text())
    pathlib.Path(str(prefix) + '-' + phase + '.pins.json').write_bytes(pinfile.read_bytes())
    project = (native / 'NativeScriptApp.xcodeproj/project.pbxproj').read_text()
    if (repository in project) != present:
        raise RuntimeError('remote project reference membership differs')
    metadata = (native / 'metadata-inputs.json').read_bytes()
    pathlib.Path(str(prefix) + '-' + phase + '.metadata.json').write_bytes(metadata)
    remote = json.loads(metadata)['remotePackages']
    declared = [c for c in result['resolved']['Contributions'] if c['Kind'] == 'spm-remote']
    if len(remote) != int(present) or len(declared) != int(present):
        raise RuntimeError('typed remote declaration/consumer membership differs')
    selected = [pin for pin in pins['pins'] if pin['identity'].lower() == 'pulsar-ios']
    if len(selected) != int(present):
        raise RuntimeError('actual resolved Pulsar pin membership differs')
    return {'result': str(saved), 'native': str(native), 'pins': selected, 'declared': declared, 'metadata': remote}

exact_config = write_config([declaration('1.4.0')])
exact = run('exact', True)
commit = exact['pins'][0]['state']['revision']
if exact['pins'][0]['state'].get('version') != '1.4.0' or not re.fullmatch('[a-f0-9]{40}', commit):
    raise RuntimeError('exact version did not resolve to its expected concrete pin')

# The existing task-owned directly installed native health package becomes the
# producer. No install/update is inferred from library Resolve or Build.
plugin = (app / 'node_modules/p91-native-health').resolve()
if json.loads((plugin / 'package.json').read_text())['name'] != 'p91-native-health':
    raise RuntimeError('wrong installed fixture package')
plugin_config = plugin / 'nativescript.config.js'
if plugin_config.exists():
    raise RuntimeError('fixture plugin config unexpectedly exists')
plugin_config.write_text('module.exports=' + json.dumps({'ios': {'SPMPackages': [declaration('#' + commit)]}}))
revision_config = write_config([])
revision = run('revision', True)
if revision['pins'][0]['state']['revision'] != commit or revision['metadata'][0]['version'] != '#' + commit:
    raise RuntimeError('plugin revision did not resolve to the declared commit')
if pathlib.Path(revision['declared'][0]['PackageDirectory']) != plugin:
    raise RuntimeError('installed plugin ownership was lost')

plugin_config.unlink()
removed_config = write_config([], sources=False)
removed = run('removed', False)
summary = {'passed': True, 'boundary': 'real unsigned simulator compilation, declared app/plugin SPM resolution and removal; no guest/runtime/signing/OTA installer claim',
           'bridgeSourceSHA256': hashlib.sha256(original).hexdigest(), 'adaptedSourceSHA256': hashlib.sha256(source.encode()).hexdigest(),
           'adaptation': 'class declaration renamed and given explicit ObjC name for the maintained inspector; method bodies unchanged',
           'configSHA256': {'exact': exact_config, 'revision': revision_config, 'removed': removed_config},
           'repository': repository, 'resolvedRevision': commit, 'exact': exact, 'revision': revision, 'removed': removed}
pathlib.Path(str(prefix) + '-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print('PASS actual app exact-version, installed-plugin commit revision, original bridge body compilation, native class/product/pin removal')
