#!/usr/bin/env python3
"""Qualify the legacy six-package patch command from verified raw artifacts."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile

artifact_path = Path(__file__).resolve().parents[1] / 'source-lock/verify-artifacts.py'
spec = importlib.util.spec_from_file_location('artifact_verifier', artifact_path)
artifact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(artifact)

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('typescript', type=Path)
parser.add_argument('staged_workspace', type=Path)
parser.add_argument('artifact_cache', type=Path)
parser.add_argument('new_workspace', type=Path)
parser.add_argument('new_report', type=Path)
args = parser.parse_args()
source, staged, workspace = args.source.resolve(), args.staged_workspace.resolve(), args.new_workspace.resolve()
project_cache = Path(__file__).resolve().parents[3] / '.cache'
if workspace == project_cache or not workspace.is_relative_to(project_cache.resolve()) or workspace.exists() or args.new_report.exists():
    raise ValueError('Use a fresh owned project-cache workspace and new report')
proof = json.loads((staged / 'stage-proof.json').read_text())
lock = json.loads(subprocess.check_output(['node', '-e', artifact.PARSE_LOCK, str(args.typescript.resolve()), str(source / 'bun.lock')], text=True))
if artifact.digest(source / 'bun.lock') != proof['originalLockSHA256']:
    raise ValueError('Original lock changed')
if json.loads((args.artifact_cache / 'owner.json').read_text())['originalLockSHA256'] != proof['originalLockSHA256']:
    raise ValueError('Artifact cache ownership differs')
source_hashes = {r['path']: r['sha256'] for r in proof['records'] if r['kind'] == 'file'}
entry = 'packages/cli/src/vite.ts'
if artifact.digest(source / entry) != source_hashes[entry]:
    raise ValueError('Original CLI entry changed')
records = []
for locator in ['@nativescript/core', 'octane', '@nativescript-community/octane', 'nativescript-vite-8-0-21', '@nativescript-community/vite-octane', 'css']:
    row = lock['packages'][locator]
    name, version = row[0].rsplit('@', 1)
    identity = name + '@' + version
    patch = source / lock['patchedDependencies'][identity]
    if artifact.digest(patch) != source_hashes[str(patch.relative_to(source))]:
        raise ValueError('Original patch changed')
    records.append({'name': name, 'version': version, 'identity': identity, 'integrity': row[-1], 'patch': str(patch)})
workspace.mkdir(mode=0o700)
app = workspace / 'apps/mobile'
inputs = []
for record in records:
    archive, origin = artifact.tarball(record, args.artifact_cache.resolve(), Path.home() / '.npm/_cacache', False)
    destination = app / 'node_modules' / record['name']
    destination.mkdir(parents=True)
    layout = artifact.unpack(archive, destination)
    package = json.loads((destination / 'package.json').read_text())
    if package['name'] != record['name'] or package['version'] != record['version']:
        raise ValueError('Verified raw package metadata differs from lock identity')
    inputs.append({**record, 'tarballOrigin': origin, 'tarballSHA512': artifact.digest(archive, 'sha512'), 'archiveLayout': layout})
(workspace / 'source-projection.json').write_text(json.dumps({'sourceReference': artifact.REFERENCE, 'sourceSHA256': {entry: source_hashes[entry]}, 'scope': 'legacy patch preparation only; no bundle or native execution'}) + '\n')
with (workspace / 'patch-command.log').open('w') as log:
    subprocess.run(['python3', '-B', str(Path(__file__).with_name('patch-runtime.py')), str(source), str(workspace)], stdout=log, stderr=subprocess.STDOUT, check=True)
comparisons = []
for record in records:
    archive, _ = artifact.tarball(record, args.artifact_cache.resolve(), Path.home() / '.npm/_cacache', False)
    with tempfile.TemporaryDirectory(prefix='ns-legacy-patch-expect-') as temporary:
        root = Path(temporary).resolve() / 'package'
        root.mkdir()
        artifact.unpack(archive, root)
        with (Path(temporary) / 'git.log').open('w+') as log:
            patch_proof = artifact.apply_patch(root, Path(record['patch']), record['identity'], log)
        expected = artifact.inventory(root)
        actual = workspace / 'patched-runtime' / record['name'].replace('/', '__').replace('@', '')
        diff = artifact.differences(expected, artifact.inventory(actual, omit_installer_modules=True))
        comparisons.append({'identity': record['identity'], 'entries': len(expected), 'patchProof': patch_proof, 'directory': str(actual), **diff})
passed = all(not row[key] for row in comparisons for key in ['missing', 'extra', 'changed'])
report = {'scope': 'real legacy six-package preparation command from verified raw tarballs, independently compared with original Git patch postimages; no compiler API, runtime or native acceptance', 'passed': passed, 'workspace': str(workspace), 'originalLockSHA256': proof['originalLockSHA256'], 'inputs': inputs, 'comparisons': comparisons}
with args.new_report.open('x') as output:
    json.dump(report, output, indent=2)
    output.write('\n')
args.new_report.chmod(0o600)
print(json.dumps({'scope': report['scope'], 'passed': passed, 'packages': len(records), 'entries': sum(row['entries'] for row in comparisons)}))
if not passed:
    raise SystemExit(1)
