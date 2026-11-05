#!/usr/bin/env python3
"""Independently inspect retained private OTA snapshot fixtures, not native ABI."""
import hashlib
import json
import pathlib
import sys


def load(file):
    return json.loads(file.read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def stable(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def logical(value, root):
    if isinstance(value, str) and pathlib.Path(value).is_absolute():
        return {'packageRelativePath': pathlib.Path(value).relative_to(root).as_posix()}
    if isinstance(value, list):
        return [logical(item, root) for item in value]
    if isinstance(value, dict):
        return {key: logical(item, root) for key, item in value.items()}
    return value


def inspect(directory):
    records_verified = files_verified = 0
    for placement in ['app', 'workspace', 'installed']:
        report = load(directory / (placement + '.json'))
        assert report['placement'] == placement
        assert len(report['records']) == len(report['stages']) == 6
        hashes = [record['hash'] for record in report['records']]
        assert hashes[0] == hashes[1] and hashes[0] != hashes[2]
        assert hashes[3] != hashes[2] and hashes[4] == hashes[2] and hashes[5] != hashes[2]
        for index, (location, expected) in enumerate(zip(report['stages'], report['records'])):
            stage = pathlib.Path(location)
            assert stage.is_absolute() and not stage.is_symlink()
            stage.relative_to(pathlib.Path(report['root']) / 'state')
            request = load(stage / 'request.json')
            record = load(stage / 'native/.xplat/fingerprints/ios.json')
            assert record == expected
            extras_file = stage / 'project/fingerprint.config.json'
            extras = load(extras_file).get('extraSources', []) if extras_file.exists() else []
            packages = []
            for package_index, fact in enumerate(request.get('localSwiftPackages', [])):
                root = pathlib.Path(fact['manifest']).parent
                assert fact['sourceSHA256'] == request['sourceFiles'][fact['manifest']]
                files = []
                for source, sha256 in request['sourceFiles'].items():
                    try:
                        relative = pathlib.Path(source).relative_to(root).as_posix()
                    except ValueError:
                        continue
                    copied = stage / 'local-swift' / str(package_index) / relative
                    assert not copied.is_symlink() and digest(copied.read_bytes()) == sha256
                    files.append({'path': relative, 'sha256': sha256})
                    files_verified += 1
                copied_root = stage / 'local-swift' / str(package_index)
                inventory = []
                for file in copied_root.rglob('*'):
                    assert not file.is_symlink()
                    if file.is_file():
                        inventory.append(file.relative_to(copied_root).as_posix())
                assert sorted(inventory) == sorted(file['path'] for file in files)
                packages.append({'name': fact['name'], 'products': sorted(set(fact['products'])),
                                 'manifestSHA256': digest(stable(logical(fact['evaluation'], root))),
                                 'files': sorted(files, key=lambda file: file['path'].encode())})
            local = [extra for extra in extras if extra.get('id') == 'xplat-ns/local-spm/v1']
            if packages:
                contents = stable({'format': 'xplat-ns/local-spm/v1',
                                   'packages': sorted(packages, key=lambda package: package['name'].encode())})
                assert len(local) == 1 and local[0]['contents'].encode() == contents
            else:
                assert index == 5 and not local
                assert not any(source.get('id') == 'xplat-ns/local-spm/v1' for source in record['sources'])
                graph = (stage / 'native/NativeScriptApp.xcodeproj/project.pbxproj').read_text()
                assert 'productName = "Local"' not in graph
            assert len(extras) == (2 if index == 3 else 0 if index == 5 else 1)
            for extra in extras:
                matches = [source for source in record['sources']
                           if source.get('type') == 'contents' and source.get('id') == extra['id']]
                assert len(matches) == 1 and matches[0]['hash'] == digest(extra['contents'].encode())
            stamp = load(stage / 'native/app/xplat-native.json')
            assert stamp['hash'] == record['hash'] and stamp['release'] is True
            assert record['hash'] in (stage / 'native/internal/main.m').read_text()
            records_verified += 1
    return {'passed': True, 'recordsVerified': records_verified, 'copiedFileHashesVerified': files_verified,
            'scope': 'Independent descriptor reconstruction, copied membership, canonical extra-source hashes, '
                     'coexistence/removal and boot/stamp fixture inspection; no library compilation or OTA installer proof.'}


if __name__ == '__main__':
    if len(sys.argv) != 2 or not pathlib.Path(sys.argv[1]).is_absolute():
        raise SystemExit('usage: inspect-snapshot.py ABSOLUTE_RETAINED_REPORT_DIRECTORY')
    print(json.dumps(inspect(pathlib.Path(sys.argv[1]))))
