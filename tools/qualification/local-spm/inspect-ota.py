#!/usr/bin/env python3
"""Inspect actual retained native code/stamps; partial evidence is not completion."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('evidence_prefix', type=Path)
parser.add_argument('--partial', action='store_true')
args = parser.parse_args()
prefix = args.evidence_prefix.resolve()


def load(file):
    return json.loads(file.read_text())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def stable(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def logical(value, root):
    if isinstance(value, str) and Path(value).is_absolute():
        return {'packageRelativePath': Path(value).relative_to(root).as_posix()}
    if isinstance(value, list):
        return [logical(item, root) for item in value]
    if isinstance(value, dict):
        return {key: logical(item, root) for key, item in value.items()}
    return value


results, records = {}, {}
for phase, expected in [('before', 111), ('changed', 222), ('removed', None)]:
    saved = str(prefix) + '-' + phase
    if not Path(saved + '.json').is_file() and args.partial:
        continue
    build, record, stamp = [load(Path(saved + suffix)) for suffix in ['.json', '.fingerprint.json', '.stamp.json']]
    binary = Path(saved + '.macho').read_bytes()
    assert sha(binary) == build['executableSHA256']
    assert stamp['hash'] == record['hash'] and stamp['release'] is True
    assert record['hash'].encode() in binary and record['hash'] in Path(saved + '.main.m').read_text()
    assembly = subprocess.check_output(['xcrun', 'otool', '-tvV', saved + '.macho'], text=True)
    function = re.search(r'^_local_spm_value:\n((?:[0-9a-f]+\t[^\n]+\n)+)', assembly, re.M)
    symbols = subprocess.check_output(['xcrun', 'nm', '-U', saved + '.macho'], text=True)
    assert ('_OBJC_CLASS_$_LocalSpmProbe' in symbols) == (expected is not None)
    if expected is not None:
        assert function
        immediate = re.search(r'\bmov\s+w0,\s*#(0x[0-9a-f]+|[0-9]+)', function.group(1))
        assert immediate and int(immediate.group(1), 0) == expected and re.search(r'\bret\b', function.group(1))
    else:
        assert not function
    evaluations = load(Path(saved + '.evaluations.json')) or []
    packages = []
    for fact in evaluations:
        root = Path(fact['manifest']).parent
        sources = {source['Path']: source['Digest'] for source in build['project']['Sources']}
        assert fact['sourceSHA256'] == sources[fact['manifest']]
        files = []
        for file, digest in sources.items():
            try:
                relative = Path(file).relative_to(root).as_posix()
            except ValueError:
                continue
            files.append({'path': relative, 'sha256': digest})
        packages.append({'name': fact['package']['Name'], 'products': sorted(set(fact['package']['Products'])),
                         'manifestSHA256': sha(stable(logical(fact['evaluation'], root))),
                         'files': sorted(files, key=lambda file: file['path'].encode())})
    local = [source for source in record['sources'] if source.get('id') == 'xplat-ns/local-spm/v1']
    if packages:
        descriptor = stable({'format': 'xplat-ns/local-spm/v1', 'packages': sorted(packages, key=lambda package: package['name'].encode())})
        assert len(local) == 1 and local[0]['hash'] == sha(descriptor)
    else:
        assert expected is None and not local
    records[phase] = record
    results[phase] = {'executableSHA256': sha(binary), 'canonicalHash': record['hash'], 'selectedCValue': expected,
                      'descriptorVerified': bool(packages), 'compiledStampVerified': True}

if 'before' in records and 'changed' in records:
    sources = lambda record: {(source['type'], source.get('id'), source.get('filePath')): source['hash'] for source in record['sources']}
    before, changed = sources(records['before']), sources(records['changed'])
    differences = [key for key in before.keys() | changed.keys() if before.get(key) != changed.get(key)]
    assert differences == [('contents', 'xplat-ns/local-spm/v1', None)]
complete = len(results) == 3
result = {'passed': bool(results), 'coverageComplete': complete, 'phases': results,
          'scope': 'Actual arm64 C/Swift/ObjC code, independent local descriptor reconstruction and compiled canonical release stamps; no installer, guest, signing or original V8 ABI claim.'}
print(json.dumps(result))
if not complete and not args.partial:
    raise SystemExit(1)
