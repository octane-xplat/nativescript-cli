#!/usr/bin/env python3
"""Verify frozen compiler-scope npm payloads and original patches without installation."""
import argparse
import base64
import hashlib
import importlib.util
import json
import os
import re
import shlex
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import tempfile
import urllib.parse
import urllib.request

REFERENCE = 'b58567933b22fc6ff076f366fba61926a090f8e4'
MAX_TARBALL = 512 * 1024 * 1024
MAX_UNPACKED = 1024 * 1024 * 1024
MAX_CACHE = 1024 * 1024 * 1024
PARSE_LOCK = """const fs=require('node:fs'),path=require('node:path');const ts=require(path.resolve(process.argv[1]));const p=ts.parseConfigFileTextToJson('bun.lock',fs.readFileSync(process.argv[2],'utf8'));if(p.error||!p.config?.packages)throw Error('Invalid original lock');process.stdout.write(JSON.stringify(p.config));"""


def digest(file, algorithm='sha256'):
    h = hashlib.new(algorithm)
    with Path(file).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def child(root, name):
    parts = PurePosixPath(name)
    if parts.is_absolute() or '..' in parts.parts or '\\' in name:
        raise ValueError('Unsafe artifact path')
    return root.joinpath(*parts.parts)


def payload_path(root, name, prefix='package'):
    parts = PurePosixPath(name).parts
    if not parts or parts[0] != prefix or PurePosixPath(name).is_absolute():
        raise ValueError('Unsupported tarball root')
    return child(root, '/'.join(parts[1:]))


def ordinary_parents(root, file):
    for parent in file.relative_to(root).parents:
        candidate = root / parent
        if candidate.is_symlink():
            raise ValueError('Tar entry traverses a symlink')


def unpack(tarball, root):
    total = 0
    seen = set()
    hardlinks = []
    duplicates = []
    prefix = None
    with tarfile.open(tarball, mode='r|gz') as archive:
        for entry in archive:
            if prefix is None:
                parts = PurePosixPath(entry.name).parts
                if not parts or parts[0] in ['.', '..', '/']:
                    raise ValueError('Invalid tarball root')
                prefix = parts[0]
            target = payload_path(root, entry.name, prefix)
            ordinary_parents(root, target)
            if entry.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            if target == root:
                raise ValueError('Duplicate or invalid artifact entry')
            if target in seen:
                if not entry.isfile() or target.is_symlink() or not target.is_file():
                    raise ValueError('Conflicting duplicate artifact entry')
                total += entry.size
                if total > MAX_UNPACKED:
                    raise ValueError('Duplicate entry exceeds unpacked byte budget')
                h = hashlib.sha256()
                with archive.extractfile(entry) as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                        h.update(chunk)
                if h.hexdigest() != digest(target):
                    raise ValueError('Conflicting duplicate artifact content')
                duplicates.append({'archiveName': entry.name, 'path': target.relative_to(root).as_posix(), 'sha256': h.hexdigest()})
                continue
            seen.add(target)
            target.parent.mkdir(parents=True, exist_ok=True)
            if entry.isfile():
                total += entry.size
                if total > MAX_UNPACKED or shutil.disk_usage(root).free < entry.size + 256 * 1024 * 1024:
                    raise ValueError('Unpacked artifact exceeds available/bounded space')
                stream = archive.extractfile(entry)
                with stream, target.open('xb') as output:
                    shutil.copyfileobj(stream, output, 1024 * 1024)
                target.chmod(entry.mode & 0o777)
            elif entry.issym():
                link = Path(entry.linkname)
                if link.is_absolute() or not (target.parent / link).resolve().is_relative_to(root):
                    raise ValueError('Artifact symlink escapes payload')
                target.symlink_to(entry.linkname)
            elif entry.islnk():
                hardlinks.append((target, payload_path(root, entry.linkname, prefix)))
            else:
                raise ValueError('Unsupported artifact entry type')
    for target, original in hardlinks:
        ordinary_parents(root, original)
        if original.is_symlink() or not original.is_file():
            raise ValueError('Unsupported artifact hardlink target')
        os.link(original, target)
    return {'archiveRoot': prefix, 'identicalDuplicateEntries': duplicates}


def inventory(root, omit_installer_modules=False):
    records = {}
    for folder, dirs, files in os.walk(root, followlinks=False):
        if omit_installer_modules and Path(folder) == root and 'node_modules' in dirs:
            dirs.remove('node_modules')
        for name in dirs + files:
            file = Path(folder) / name
            rel = file.relative_to(root).as_posix()
            if file.is_symlink():
                records[rel] = {'kind': 'symlink', 'target': os.readlink(file)}
            elif file.is_file():
                records[rel] = {'kind': 'file', 'sha256': digest(file)}
            elif not file.is_dir():
                raise ValueError('Unsupported installed payload entry type')
    return records


def differences(expected, actual):
    # Bun's empty patch sentinels are installer metadata, not tarball payload.
    # Never suppress a payload-declared tag or a nonempty/symlink lookalike.
    tags = sorted(k for k in actual.keys() - expected.keys()
                  if re.fullmatch(r'\.bun-tag-[0-9a-f]{1,16}', k)
                  and actual[k] == {'kind': 'file', 'sha256': hashlib.sha256(b'').hexdigest()})
    actual = {k: v for k, v in actual.items() if k not in tags}
    return {'missing': sorted(expected.keys() - actual.keys()),
            'extra': sorted(actual.keys() - expected.keys()),
            'changed': sorted(k for k in expected.keys() & actual.keys() if expected[k] != actual[k]),
            'emptyBunInstallerTags': tags}


_format_spec = importlib.util.spec_from_file_location('native_patch_format', Path(__file__).resolve().parents[1] / 'vite-config/patch_format.py')
_format = importlib.util.module_from_spec(_format_spec)
_format_spec.loader.exec_module(_format)
normalize_vite_eof = _format.normalize_vite_eof


def validate_patch(bytes_):
    paths = set()
    for line in bytes_.decode('utf8').splitlines():
        if line.startswith('diff --git '):
            names = shlex.split(line)[2:]
            if len(names) != 2:
                raise ValueError('Unsupported diff header')
            for name in names:
                if not name.startswith(('a/', 'b/')):
                    raise ValueError('Unsupported diff header path')
                child(Path('/payload'), name[2:])
        if line.startswith(('rename ', 'GIT binary patch')):
            raise ValueError('Unsupported patch form')
        if not line.startswith(('--- ', '+++ ')):
            continue
        value = line[4:]
        if value == '/dev/null':
            continue
        if not value.startswith(('a/', 'b/')):
            raise ValueError('Unsupported patch path')
        rel = value[2:]
        if not rel or child(Path('/payload'), rel) == Path('/payload'):
            raise ValueError('Invalid patch path')
        paths.add(rel)
    if not paths:
        raise ValueError('Patch has no supported file changes')
    return sorted(paths)


def apply_patch(root, patchfile, identity, log):
    original = patchfile.read_bytes()
    paths = validate_patch(original)
    command = ['git', 'apply']
    result = subprocess.run([*command, '--check', str(patchfile)], cwd=root, stdout=log, stderr=subprocess.STDOUT)
    normalization = None
    applied = patchfile
    if result.returncode and identity in ['@nativescript/vite@8.0.20', '@nativescript/vite@8.0.21']:
        applied = root.parent / 'vite-eof-normalized.patch'
        applied.write_bytes(normalize_vite_eof(original, (root / 'hmr/shared/vendor/manifest-collect.js').read_bytes()))
        normalization = 'split one EOF context line into equal delete/add; preserve all code and other annotations'
        subprocess.run([*command, '--check', str(applied)], cwd=root, stdout=log, stderr=subprocess.STDOUT, check=True)
    elif result.returncode:
        raise ValueError('Original patch check failed')
    subprocess.run([*command, str(applied)], cwd=root, stdout=log, stderr=subprocess.STDOUT, check=True)
    return {'path': str(patchfile), 'originalSHA256': digest(patchfile), 'appliedSHA256': digest(applied),
            'formatNormalization': normalization, 'changedPaths': paths}


class HTTPSRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        url = urllib.parse.urlparse(newurl)
        if url.scheme != 'https' or url.hostname != 'registry.npmjs.org' or url.username or url.password:
            raise ValueError('Untrusted artifact redirect')
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def tarball(record, cache, npm_cache, allow_fetch):
    sri = record['integrity']
    if not sri.startswith('sha512-'):
        raise ValueError('Unsupported artifact integrity')
    raw = base64.b64decode(sri[7:], validate=True)
    if len(raw) != 64:
        raise ValueError('Invalid SHA512 integrity')
    hex_ = raw.hex()
    cached = npm_cache / 'content-v2/sha512' / hex_[:2] / hex_[2:4] / hex_[4:]
    own = cache / (hex_ + '.tgz')
    for candidate, origin in [(own, 'project-cache'), (cached, 'existing-npm-cache')]:
        if candidate.is_file():
            if candidate.stat().st_size > MAX_TARBALL or digest(candidate, 'sha512') != hex_:
                raise ValueError('Cached tarball integrity mismatch')
            return candidate, origin
    if not allow_fetch:
        raise ValueError('Verified tarball not cached; explicit --allow-fetch required')
    name, version = record['name'], record['version']
    url = 'https://registry.npmjs.org/' + urllib.parse.quote(name, safe='@/') + '/-/' + urllib.parse.quote(name.rsplit('/', 1)[-1] + '-' + version + '.tgz', safe='.-_')
    opener = urllib.request.build_opener(HTTPSRedirect())
    h, size = hashlib.sha512(), 0
    partial = None
    try:
        with tempfile.NamedTemporaryFile(dir=cache, prefix=hex_ + '.', suffix='.partial', delete=False) as output:
            partial = Path(output.name)
            with opener.open(url, timeout=30) as response:
                for chunk in iter(lambda: response.read(1024 * 1024), b''):
                    size += len(chunk)
                    if size > MAX_TARBALL or sum(p.stat().st_size for p in cache.iterdir() if p.is_file()) + len(chunk) > MAX_CACHE:
                        raise ValueError('Artifact download/cache exceeds byte budget')
                    if shutil.disk_usage(cache).free < len(chunk) + 512 * 1024 * 1024:
                        raise ValueError('Artifact download lacks reserved disk space')
                    h.update(chunk)
                    output.write(chunk)
        if h.digest() != raw:
            raise ValueError('Downloaded artifact integrity mismatch')
        partial.rename(own)
        return own, 'verified-registry-https'
    finally:
        if partial is not None and partial.exists():
            partial.unlink()


def inputs(source, ts, report):
    lockfile = source / 'bun.lock'
    lock = json.loads(subprocess.check_output(['node', '-e', PARSE_LOCK, str(ts), str(lockfile)], text=True))
    fixture = Path(report['inputFixture']).resolve()
    proof = json.loads((fixture / 'stage-proof.json').read_text())
    if not report.get('passed') or digest(lockfile) != report['inputSHA256']['originalLock'] or digest(fixture / 'bun.lock') != proof['projectedLockSHA256']:
        raise ValueError('Qualified compiler inputs or frozen lock changed')
    graph_root = Path(report['graph']['Directory']).parent.parent
    manifest_hashes = {x['directory']: x['sha256'] for x in report['manifestHashes']}
    source_hashes = {r['path']: r['sha256'] for r in proof['records'] if r['kind'] == 'file'}
    groups = {}
    for row in report['audit']['records']:
        if row['status'] != 'identity-match':
            continue
        entry = lock['packages'][row['expectedLocator']]
        if '@workspace:' in entry[0]:
            continue
        if entry[1] != '':
            raise ValueError('Non-default registry requires separate qualification')
        identity = row['expectedName'] + '@' + row['expectedVersion']
        sri = next((s for s in entry if isinstance(s, str) and s.startswith('sha512-')), None)
        if sri is None:
            raise ValueError('Missing locked integrity')
        directory = fixture / Path(row['actualDirectory']).relative_to(graph_root)
        directory = directory.resolve()
        if not directory.is_relative_to(fixture) or digest(directory / 'package.json') != manifest_hashes[row['actualDirectory']]:
            raise ValueError('Installed package manifest changed or escaped fixture')
        key = (identity, sri)
        record = groups.setdefault(key, {'identity': identity, 'name': row['expectedName'], 'version': row['expectedVersion'], 'integrity': sri, 'directories': set()})
        record['directories'].add(str(directory))
        patch = lock.get('patchedDependencies', {}).get(identity)
        if patch:
            patchfile = child(source, patch)
            if digest(patchfile) != source_hashes.get(patch):
                raise ValueError('Original patch source changed')
            record['patch'] = str(patchfile)
    return [dict(r, directories=sorted(r['directories'])) for r in groups.values()]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('typescript', type=Path)
    parser.add_argument('compiler_report', type=Path)
    parser.add_argument('cache', type=Path)
    parser.add_argument('new_output', type=Path)
    parser.add_argument('--allow-fetch', action='store_true')
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument('--patches-only', action='store_true')
    selection.add_argument('--retry-failed', type=Path)
    parser.add_argument('--npm-cache', type=Path, default=Path.home() / '.npm/_cacache')
    args = parser.parse_args()
    source, cache = args.source.resolve(), args.cache.resolve()
    project_cache = Path(__file__).resolve().parents[3] / '.cache'
    if cache == project_cache or not cache.is_relative_to(project_cache.resolve()) or args.new_output.exists():
        raise ValueError('Use owned project cache and a new report')
    report = json.loads(args.compiler_report.read_text())
    records = inputs(source, args.typescript.resolve(), report)
    if args.patches_only:
        records = [r for r in records if r.get('patch')]
    if args.retry_failed:
        previous = json.loads(args.retry_failed.read_text())
        if previous['compilerReportSHA256'] != digest(args.compiler_report) or previous['originalLockSHA256'] != report['inputSHA256']['originalLock']:
            raise ValueError('Retry inputs differ from original qualification')
        failed = {(r['identity'], r['integrity']) for r in previous['artifacts'] if not r['passed']}
        records = [r for r in records if (r['identity'], r['integrity']) in failed]
        if {(r['identity'], r['integrity']) for r in records} != failed:
            raise ValueError('Retry artifact set differs')
    if not records:
        raise ValueError('Artifact selection is empty')
    owner = {'scope': 'read-only frozen npm artifact verification cache', 'originalLockSHA256': report['inputSHA256']['originalLock']}
    if cache.exists():
        if json.loads((cache / 'owner.json').read_text()) != owner:
            raise ValueError('Artifact cache ownership differs')
    else:
        cache.mkdir(mode=0o700)
        (cache / 'owner.json').write_text(json.dumps(owner) + '\n')
    results = []
    for index, record in enumerate(records):
        row = dict(record, passed=False)
        try:
            archive, origin = tarball(record, cache, args.npm_cache.resolve(), args.allow_fetch)
            row.update(tarballOrigin=origin, tarballSHA512=digest(archive, 'sha512'), tarballBytes=archive.stat().st_size)
            with tempfile.TemporaryDirectory(prefix='ns-artifact-') as temporary:
                root = Path(temporary).resolve() / 'package'
                root.mkdir()
                row['archiveLayout'] = unpack(archive, root)
                if record.get('patch'):
                    with (Path(temporary) / 'patch.log').open('w+') as log:
                        try:
                            row['patchProof'] = apply_patch(root, Path(record['patch']), record['identity'], log)
                        finally:
                            log.flush()
                            log.seek(0)
                            row['patchDiagnostics'] = log.read()
                expected = inventory(root)
                row['expectedEntries'] = len(expected)
                row['comparisons'] = []
                for directory in record['directories']:
                    bundled = any(k.startswith('node_modules/') for k in expected)
                    diff = differences(expected, inventory(Path(directory), omit_installer_modules=not bundled))
                    row['comparisons'].append({'directory': directory, **diff})
                row['passed'] = all(not d[k] for d in row['comparisons'] for k in ['missing', 'extra', 'changed'])
        except Exception as error:
            row['error'] = str(error)
        results.append(row)
        print(json.dumps({'artifact': record['identity'], 'index': index + 1, 'total': len(records), 'passed': row['passed'], 'error': row.get('error')}), flush=True)
    output = {'scope': 'verified tarball SHA512 plus full installed payload file/link identities after original patches; separately records empty Bun patch tags and excludes installer node_modules only when absent from tarball; does not qualify modes, APIs, bundle or native behavior', 'selection': 'patched compiler-scope artifacts only' if args.patches_only else 'all registry artifacts in qualified compiler scope', 'compilerReportSHA256': digest(args.compiler_report), 'originalLockSHA256': report['inputSHA256']['originalLock'], 'passed': all(r['passed'] for r in results), 'artifacts': results}
    if args.retry_failed:
        output.update(selection='failed subset of prior qualification only', retryOfSHA256=digest(args.retry_failed))
    with os.fdopen(os.open(args.new_output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as stream:
        json.dump(output, stream, indent=2)
        stream.write('\n')
    if not output['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
