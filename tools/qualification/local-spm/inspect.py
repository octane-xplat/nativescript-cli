#!/usr/bin/env python3
"""Independently verify retained fixture arm64 implementations and removal."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('evidence_prefix', type=Path)
args = parser.parse_args()
prefix = args.evidence_prefix.resolve()
evidence = {}
for phase, expected in [('plugin', 111), ('app', 222), ('removed', None)]:
    saved = Path(str(prefix) + '-' + phase)
    build = json.loads(Path(str(saved) + '.json').read_text())
    binary = Path(str(saved) + '.macho')
    digest = hashlib.sha256(binary.read_bytes()).hexdigest()
    if digest != build['executableSHA256']:
        raise RuntimeError('retained executable hash differs from public Build evidence')
    output = subprocess.check_output(['xcrun', 'otool', '-tvV', str(binary)], text=True)
    function = re.search(r'^_local_spm_value:\n((?:[0-9a-f]+\t[^\n]+\n)+)', output, re.M)
    if expected is None:
        if function:
            raise RuntimeError('removed library implementation remains')
        evidence[phase] = {'executableSHA256': digest, 'functionAbsent': True}
        continue
    if not function:
        raise RuntimeError('linked local implementation missing')
    body = function.group(1)
    immediate = re.search(r'\bmov\s+w0,\s*#(0x[0-9a-f]+|[0-9]+)', body)
    if not immediate or int(immediate.group(1), 0) != expected or not re.search(r'\bret\b', body):
        raise RuntimeError('linked C implementation does not return the selected fixture value')
    evidence[phase] = {'executableSHA256': digest, 'selectedConstant': expected, 'assembly': body}
Path(str(prefix) + '-code.json').write_text(json.dumps(evidence, indent=2) + '\n')
print('PASS: retained arm64 C implementations return111/222; removal has no implementation')
