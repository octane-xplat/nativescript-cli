#!/usr/bin/env python3
"""Prepare, never apply to a source checkout, the qualified iOS Mason repair."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('inputs', type=Path)
parser.add_argument('new_directory', type=Path)
parser.add_argument('new_patch', type=Path)
args = parser.parse_args()
if not all(p.is_absolute() for p in [args.inputs, args.new_directory, args.new_patch]):
    raise RuntimeError('Absolute paths required')
if args.new_directory.exists() or args.new_patch.exists():
    raise RuntimeError('Output paths must be absent')
inputs_bytes = args.inputs.read_bytes()
inputs = json.loads(inputs_bytes)
if (inputs['commit'] != '1f101ca3c6454895af4e4608d46756010bdeab67' or
        inputs['tag'] != 'core-v1.0.0-beta.5'):
    raise RuntimeError('Requires the reviewed package-specific source tag')
root = Path(inputs['sourceRoot'])
cache = Path(__file__).resolve().parents[3] / '.cache'
if (not args.new_directory.resolve().is_relative_to(cache) or
        args.new_directory.resolve().is_relative_to(root.resolve()) or
        args.new_patch.resolve().is_relative_to(root.resolve())):
    raise RuntimeError('Prepared copies must use this project cache and preserve the source tree')
sha = lambda data: hashlib.sha256(data).hexdigest()
for name, expected in inputs['inputs'].items():
    data = (root / name).read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    if sha(data) != expected['sha256'] or blob != expected['gitBlobSHA1']:
        raise RuntimeError('Source identity differs: ' + name)
manifest = json.loads((root / 'packages/nativescript-mason-core/package.json').read_text())
if manifest['name'] != '@octane-xplat/nativescript-mason-core' or manifest['version'] != '1.0.0-beta.5':
    raise RuntimeError('Wrong source package')
common_name = 'packages/nativescript-masonkit/common.ts'
foreign_name = 'packages/nativescript-mason-core/foreign-layout.ts'
originals = {name: (root / name).read_text() for name in [common_name, foreign_name]}
common = originals[common_name]
old_import = 'import { adoptForeignLayout, invalidateOnLayoutRequest, releaseForeignLayout } from \'./foreign-layout\';'
new_import = old_import.replace('adoptForeignLayout,', 'adoptForeignLayout, adoptMasonForeignFrame,')
branch = '''          const b = child._getCurrentLayoutBounds();
          const w = Utils.layout.makeMeasureSpec(b.right - b.left, Utils.layout.EXACTLY);
          const h = Utils.layout.makeMeasureSpec(b.bottom - b.top, Utils.layout.EXACTLY);
          NSView.measureChild(view, child, w, h);
          child.layout(b.left, b.top, b.right, b.bottom);'''
if common.count(old_import) != 1 or common.count(branch) != 1:
    raise RuntimeError('Reviewed common source boundary differs')
replacement = '''          if (__IOS__) {
            adoptMasonForeignFrame(view, child, NSView.measureChild.bind(NSView), Utils.layout);
          } else {
''' + '\n'.join('  ' + line for line in branch.splitlines()) + '\n          }'
common = common.replace(old_import, new_import).replace(branch, replacement)
candidate_file = Path(__file__).with_name('runtime') / 'frame-adoption-candidate.ts'
candidate = candidate_file.read_text()
helper = candidate[candidate.index('export function adoptMasonForeignFrame('):]
foreign = originals[foreign_name] + '\n/** Adopt a foreign iOS child frame already positioned by Mason, retaining Core cache/events. */\n' + helper
changed = {common_name: common, foreign_name: foreign}
args.new_directory.mkdir()
patch_parts = []
for name, text in changed.items():
    for section, content in [('base', originals[name]), ('changed', text), ('check', originals[name])]:
        target = args.new_directory / section / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
    patch_parts.extend(difflib.unified_diff(originals[name].splitlines(True), text.splitlines(True),
                                          fromfile='a/' + name, tofile='b/' + name))
patch = ''.join(patch_parts)
with args.new_patch.open('x') as output:
    output.write(patch)
check = (args.new_directory / 'check').resolve()
# A Git descendant cache cwd can silently skip patches. Drive absolute copies
# from an empty temporary directory verified outside every Git working tree.
with tempfile.TemporaryDirectory(prefix='ns-mason-source-patch-driver-') as driver:
    inside = subprocess.run(['git', 'rev-parse', '--is-inside-work-tree'], cwd=driver, capture_output=True)
    if inside.returncode == 0:
        raise RuntimeError('Patch driver unexpectedly belongs to a working tree')
    for extra in [['--check'], []]:
        subprocess.run(['git', 'apply', *extra, '--unsafe-paths', '--directory=' + str(check), str(args.new_patch)], cwd=driver, check=True)
for name, text in changed.items():
    if (check / name).read_text() != text:
        raise RuntimeError('Patch did not produce the reviewed source: ' + name)
    if (root / name).read_text() != originals[name]:
        raise RuntimeError('Read-only source changed')
record = {'scope': 'Reviewable two-file maintained-source patch; applied only to owned copies, not a source checkout, distribution or production repair',
          'inputs': str(args.inputs), 'inputsSHA256': sha(inputs_bytes), 'sourceCommit': inputs['commit'],
          'sourceTag': inputs['tag'], 'candidateSource': str(candidate_file.resolve()), 'candidateSourceSHA256': sha(candidate.encode()),
          'patch': str(args.new_patch), 'patchSHA256': sha(patch.encode()), 'sourcePreserved': True,
          'patchCheckAndOwnedApplicationPassed': True, 'changed': {name: sha(text.encode()) for name, text in changed.items()},
          'platformBoundary': '__IOS__ inside existing __APPLE__ guard; prior non-iOS branch preserved',
          'nativeQualification': 'Candidate helper qualified separately; patched package production build not yet qualified'}
(args.new_directory / 'receipt.json').write_text(json.dumps(record, indent=2) + '\n')
print('Prepared exact two-file iOS source patch; owned-copy application verified; source checkout unchanged')
