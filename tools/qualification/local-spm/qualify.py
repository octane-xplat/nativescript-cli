#!/usr/bin/env python3
"""Run under a native_builds:1 grant: declared local libraries and removal.

All changes are confined to a new task-owned fixture. This qualifies unsigned
simulator compilation and native symbol membership, not runtime/OTA/real shims.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('workspace', type=Path)
parser.add_argument('consumer', type=Path)
parser.add_argument('evidence_prefix', type=Path)
args = parser.parse_args()
workspace, prefix = args.workspace.resolve(), args.evidence_prefix.resolve()
workspace.mkdir(parents=True, exist_ok=False)
app = workspace / 'app'
stage = Path(__file__).resolve().parents[1] / 'vite-config/stage.py'
subprocess.run([sys.executable, str(stage), str(app)], check=True)
for name, value in [('a-local', 111), ('b-local', 222)]:
    package = app / 'fixture-native' / name
    native = package / 'platforms/ios/Local'
    (native / 'Sources/LocalProbeC/include').mkdir(parents=True)
    (package / 'package.json').write_text(json.dumps({'name': name, 'version': '1.0.0', 'nativescript': {'platforms': {'ios': '9.1'}}}))
    declaration = {'name': 'SharedShim', 'path': f'node_modules/{name}/platforms/ios/Local', 'libs': ['LocalProbeC']}
    (package / 'nativescript.config.cjs').write_text('module.exports=' + json.dumps({'ios': {'SPMPackages': [declaration]}}))
    (native / 'Package.swift').write_text('// swift-tools-version: 5.9\nimport PackageDescription\nlet package = Package(name: "SharedShim", platforms: [.iOS(.v13)], products: [.library(name: "LocalProbeC", targets: ["LocalProbeC"])], targets: [.target(name: "LocalProbeC")])\n')
    (native / 'Sources/LocalProbeC/include/LocalProbe.h').write_text('int local_spm_value(void);\n')
    (native / 'Sources/LocalProbeC/LocalProbe.c').write_text(f'int local_spm_value(void) {{ return {value}; }}\n')
subprocess.run(['bun', 'add', '--offline', '--ignore-scripts', './fixture-native/a-local', './fixture-native/b-local'], cwd=app, check=True)
(app / 'bridge').mkdir()
bridge = app / 'bridge/LocalProbe.swift'
bridge.write_text('import Foundation\nimport LocalProbeC\n@objc(LocalSpmProbe) public final class LocalSpmProbe: NSObject { @objc public static func answer() -> Int32 { local_spm_value() } }\n')
(app / 'app/app.ts').write_text("console.log('Local SPM native compile', __PROJECT_CONFIG_VALUE__);\n")


def write_config(override=None, removed=False):
    value = {'id': 'org.example.localspm', 'appPath': 'app', 'appResourcesPath': 'App_Resources',
             'cli': {'packageManager': 'bun'}, 'bundler': 'vite', 'bundlerConfigPath': 'vite.config.mts'}
    if not removed:
        value['ios'] = {'NativeSource': [{'name': 'LibraryBridge', 'path': 'bridge/LocalProbe.swift'}]}
        if override:
            value['ios']['SPMPackages'] = [{'name': 'SharedShim', 'path': f'node_modules/{override}/platforms/ios/Local', 'libs': ['LocalProbeC']}]
    text = 'export default ' + json.dumps(value) + ';\n'
    (app / 'nativescript.config.ts').write_text(text)
    return hashlib.sha256(text.encode()).hexdigest()


def build(phase, selected=None):
    saved = Path(str(prefix) + '-' + phase)
    subprocess.run([str(args.consumer.resolve()), str(app), str(saved), 'debug'], check=True)
    result = json.loads(Path(str(saved) + '.json').read_text())
    resolved, built = result['project'], result['build']
    contributions = [c for c in resolved['Contributions'] if c['Kind'] == 'spm']
    native = Path(built['Prepared']['NativeDir'])
    project = (native / 'NativeScriptApp.xcodeproj/project.pbxproj').read_text()
    symbols = subprocess.check_output(['xcrun', 'nm', '-U', str(saved) + '.macho'], text=True)
    present = selected is not None
    if ('_local_spm_value' in symbols) != present or ('_OBJC_CLASS_$_LocalSpmProbe' in symbols) != present:
        raise RuntimeError('actual C library/ObjC bridge native symbol membership differs')
    if len(contributions) != int(present):
        raise RuntimeError('declared or automatic local package deduplication differs')
    if present:
        if selected not in contributions[0]['Path'] or 'SPM' not in contributions[0] or contributions[0]['SPM']['Products'] != ['LocalProbeC']:
            raise RuntimeError('selected local package producer/products differ')
        losing = 'b-local' if selected == 'a-local' else 'a-local'
        if f'node_modules/{losing}/platforms/ios/Local' in project or f'node_modules/{selected}/platforms/ios/Local' not in project:
            raise RuntimeError('project contains losing or lacks selected package reference')
    elif 'productName = "LocalProbeC"' in project:
        raise RuntimeError('removed local product remains linked')
    return {'buildEvidence': str(saved) + '.json', 'selected': contributions, 'executableSHA256': result['executableSHA256']}


configs = {'plugin': write_config()}
first = build('plugin', 'a-local')
configs['app'] = write_config('b-local')
second = build('app', 'b-local')
manifest = app / 'package.json'
package = json.loads(manifest.read_text())
for name in ['a-local', 'b-local']:
    del package['dependencies'][name]
manifest.write_text(json.dumps(package, indent=2) + '\n')
subprocess.run(['bun', 'install', '--offline', '--ignore-scripts'], cwd=app, check=True)
configs['removed'] = write_config(removed=True)
removed = build('removed')
summary = {'passed': True, 'boundary': 'actual unsigned iOS debug compilation, local plugin selection/app override, C/ObjC linking and removal; no guest/runtime/OTA/original shim ABI claim',
           'configSHA256': configs, 'bridgeSHA256': hashlib.sha256(bridge.read_bytes()).hexdigest(),
           'plugin': first, 'app': second, 'removed': removed}
Path(str(prefix) + '-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print('PASS: local SPM plugin/app selection, actual C/ObjC compilation and removal')
