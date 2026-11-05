#!/usr/bin/env python3
"""Independently inspect one compiled plugin selector case before scratch cleanup."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('prefix', type=Path)
parser.add_argument('expected', choices=['111', '222', 'removed'])
args = parser.parse_args()
prefix = str(args.prefix.resolve())
load = lambda suffix: json.loads(Path(prefix + suffix).read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
stable = lambda value: json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
built, record, stamp, facts, retained = map(load, ['.json', '.fingerprint.json', '.stamp.json', '.source.json', '.retained-app.json'])
binary = Path(prefix + '.macho').read_bytes()
assert sha(binary) == built['executableSHA256']
for name, digest in retained['filesSHA256'].items():
    assert sha((Path(retained['path']) / name).read_bytes()) == digest
assert sha((Path(retained['path']) / 'NativeScriptApp').read_bytes()) == sha(binary)
assert stamp['release'] is True and stamp['hash'] == record['hash'] and record['hash'].encode() in binary
assert record['hash'] in Path(prefix + '.main.m').read_text()
selected = args.expected != 'removed'
assert facts['transitive'] is True and facts['selected'] is selected
manifest = load('.plugin.json')
assert manifest['name'] == facts['nativeName'] and manifest['version'] == '1.0.0'
swift = Path(prefix + '.swift').read_bytes()
assert sha(swift) == facts['swiftSHA256']
sources = {source['Path']: source['Digest'] for source in built['project']['Sources']}
assert (sources.get(facts['source']) == sha(swift)) is selected
descriptor = stable({'format': 'xplat-ns/plugin-native-source/v1', 'groups': [{'owner': {'name': manifest['name'], 'version': manifest['version']},
                     'name': 'Bridge', 'pattern': 'src/*.swift', 'files': [{'path': 'src/Bridge.swift', 'sha256': sha(swift)}]}]})
matches = [source for source in record['sources'] if source.get('id') == 'xplat-ns/plugin-native-source/v1']
assert len(matches) == int(selected)
if selected:
    assert matches[0]['type'] == 'contents' and matches[0]['hash'] == sha(descriptor)
symbols = subprocess.check_output(['xcrun', 'nm', '-U', prefix + '.macho'], text=True)
assert ('_OBJC_CLASS_$_PluginSelectorProbe' in symbols) is selected
assert ('_plugin_selector_value' in symbols) is selected
assembly = subprocess.check_output(['xcrun', 'otool', '-tvV', prefix + '.macho'], text=True)
function = re.search(r'^_plugin_selector_value:\n((?:[0-9a-f]+\t[^\n]+\n)+)', assembly, re.M)
if selected:
    assert function
    immediate = re.search(r'\bmov\s+w0,\s*#(0x[0-9a-f]+|[0-9]+)', function.group(1))
    assert immediate and int(immediate.group(1), 0) == int(args.expected) and re.search(r'\bret\b', function.group(1))
else:
    assert not function
print(json.dumps({'passed': True, 'canonicalHash': record['hash'], 'executableSHA256': sha(binary), 'expectedValue': None if not selected else int(args.expected),
                  'descriptorVerified': selected, 'compiledStampVerified': True, 'retainedAppFiles': len(retained['filesSHA256']),
                  'assembly': function.group(1) if function else None,
                  'scope': 'Actual native Swift/ObjC/C-export membership, retained app bytes, independent descriptor and compiled stamp; no guest or installer proof'}))
