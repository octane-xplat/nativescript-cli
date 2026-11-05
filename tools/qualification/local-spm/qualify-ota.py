#!/usr/bin/env python3
"""Broker-owned public release simulator builds with local Swift canonical stamps.

Retain evidence, then retire only this run's fresh compiler scratch directory
between cases. Never reuse or remove another qualification's native outputs.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('workspace', type=Path)
parser.add_argument('consumer', type=Path)
parser.add_argument('evidence_prefix', type=Path)
parser.add_argument('canonical_packages', type=Path)
parser.add_argument('--resume', action='store_true', help='reuse verified complete phase evidence and continue this owned fixture')
args = parser.parse_args()
workspace, prefix = args.workspace.resolve(), args.evidence_prefix.resolve()
if args.resume:
    if not workspace.is_dir() or Path(str(prefix) + '-summary.json').exists():
        raise RuntimeError('Resume requires an existing unfinished fixture')
else:
    workspace.mkdir(parents=True, exist_ok=False)
if not args.resume and shutil.disk_usage(workspace).free < 2 * 1024**3:
    raise RuntimeError('At least 2 GiB free project-cache space is required before staging')
app = workspace / 'app'
stage = Path(__file__).resolve().parents[1] / 'vite-config/stage.py'
archives = [args.canonical_packages.resolve() / ('octane-xplat-' + name + '-0.19.0.tgz')
            for name in ['updates', 'fingerprint']]
if not all(archive.is_file() for archive in archives):
    raise RuntimeError('Existing reviewed canonical package archives required')
library = workspace / 'Library'
source = library / 'Sources/LocalProbeC/LocalProbe.c'
if not args.resume:
    subprocess.run([sys.executable, str(stage), str(app)], check=True)
    subprocess.run(['bun', 'add', '--offline', '--ignore-scripts', *map(str, archives)], cwd=app, check=True)
    (library / 'Sources/LocalProbeC/include').mkdir(parents=True)
    (library / 'Package.swift').write_text('// swift-tools-version: 5.9\nimport PackageDescription\nlet package = Package(name: "LocalShim", platforms: [.iOS(.v13)], products: [.library(name: "LocalProbeC", targets: ["LocalProbeC"])], targets: [.target(name: "LocalProbeC")])\n')
    (library / 'Sources/LocalProbeC/include/LocalProbe.h').write_text('int local_spm_value(void);\n')
    (app / 'bridge').mkdir()
    (app / 'bridge/LocalProbe.swift').write_text('import Foundation\nimport LocalProbeC\n@objc(LocalSpmProbe) public final class LocalSpmProbe: NSObject { @objc public static func answer() -> Int32 { local_spm_value() } }\n')
    (app / 'app/app.ts').write_text("console.log('Local SPM canonical compile', __PROJECT_CONFIG_VALUE__);\n")

if args.resume:
    completed = [Path(str(prefix) + '-' + phase + '.json') for phase in ['before', 'changed', 'removed']]
    completed = [file for file in completed if file.exists()]
    if not completed:
        raise RuntimeError('No completed public Build evidence to resume')
    last = json.loads(completed[-1].read_text())
    if Path(last['project']['Directory']).resolve() != app:
        raise RuntimeError('Retained evidence belongs to a different fixture')
    for source_fact in last['project']['Sources']:
        file = Path(source_fact['Path'])
        if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != source_fact['Digest']:
            raise RuntimeError('Resolved inputs changed since the completed phase')


def config(removed=False):
    value = {'id': 'org.example.localspmota', 'appPath': 'app', 'appResourcesPath': 'App_Resources',
             'cli': {'packageManager': 'bun'}, 'bundler': 'vite', 'bundlerConfigPath': 'vite.config.mts'}
    if not removed:
        value['ios'] = {'NativeSource': [{'name': 'Bridge', 'path': 'bridge/LocalProbe.swift'}],
                        'SPMPackages': [{'name': 'LocalShim', 'path': '../Library', 'libs': ['LocalProbeC']}]}
    (app / 'nativescript.config.ts').write_text('export default ' + json.dumps(value) + ';\n')


phases = {}
for phase, expected in [('before', 111), ('changed', 222), ('removed', None)]:
    saved = Path(str(prefix) + '-' + phase)
    if not (args.resume and Path(str(saved) + '.json').exists()):
        if shutil.disk_usage(workspace).free < 1280 * 1024**2:
            raise RuntimeError('Insufficient project-cache headroom for the next fresh native build')
        if expected is not None:
            source.write_text(f'int local_spm_value(void) {{ return {expected}; }}\n')
        config(removed=expected is None)
        subprocess.run([str(args.consumer.resolve()), str(app), str(saved), 'release', 'ota'], check=True)
    result = json.loads(Path(str(saved) + '.json').read_text())
    binary = Path(str(saved) + '.macho')
    if hashlib.sha256(binary.read_bytes()).hexdigest() != result['executableSHA256']:
        raise RuntimeError('Retained executable differs')
    symbols = subprocess.check_output(['xcrun', 'nm', '-U', str(binary)], text=True)
    if ('_local_spm_value' in symbols) != (expected is not None) or ('_OBJC_CLASS_$_LocalSpmProbe' in symbols) != (expected is not None):
        raise RuntimeError('Actual C/Swift/ObjC native symbol membership differs')
    stamp = json.loads(Path(str(saved) + '.stamp.json').read_text())
    record = json.loads(Path(str(saved) + '.fingerprint.json').read_text())
    if stamp['hash'] != record['hash'] or not stamp['release'] or stamp['hash'].encode() not in binary.read_bytes():
        raise RuntimeError('Native compiled release stamp differs')
    locals = [s for s in record['sources'] if s.get('id') == 'xplat-ns/local-spm/v1']
    if len(locals) != int(expected is not None):
        raise RuntimeError('Canonical local source membership differs')
    artifact = Path(result['build']['Artifacts'][0]['Path']).resolve()
    native = Path(result['build']['Prepared']['NativeDir']).resolve()
    scratch = artifact.parent.parent
    if not scratch.name.startswith('xcode-') or scratch.parent != native.parent or not scratch.is_relative_to(workspace) or scratch.is_symlink():
        raise RuntimeError('Refusing compiler scratch retirement outside current fixture')
    # These outputs are new, owned scratch. All required retained evidence must
    # exist before cleanup; older caches/inputs/history are never touched.
    for suffix in ['.json', '.macho', '.fingerprint.json', '.stamp.json', '.main.m', '.pbxproj', '.evaluations.json']:
        if not Path(str(saved) + suffix).is_file():
            raise RuntimeError('Missing retained proof before scratch retirement')
    phases[phase] = {'hash': record['hash'], 'executableSHA256': result['executableSHA256'],
                     'expectedCValue': expected, 'retainedPrefix': str(saved),
                     'retiredNewScratch': str(scratch)}
    if scratch.exists():
        shutil.rmtree(scratch)

if phases['before']['hash'] == phases['changed']['hash'] or phases['changed']['hash'] == phases['removed']['hash']:
    raise RuntimeError('Native compatibility changes did not change canonical identity')
summary = {'passed': True, 'phases': phases, 'workspace': str(workspace),
           'scope': 'Three actual public OTA-enabled unsigned iOS release simulator builds, C/Swift/ObjC change/removal and compiled canonical stamps; no installer, guest, physical signing or original V8 ABI proof.'}
Path(str(prefix) + '-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print('PASS: actual local Swift native changes/removal and compiled release canonical stamps')
