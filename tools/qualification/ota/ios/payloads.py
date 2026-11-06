#!/usr/bin/env python3
"""Build content-addressed OTA payload archives and phase manifests for the
iOS installer qualification from one built release artifact.

Writes FIXTURE_ROOT/bundles/<sha256> and FIXTURE_ROOT/manifests/<phase>.json;
nothing is activated until the harness swaps manifest.json in or out.
"""
import argparse, hashlib, io, json, pathlib, sys, zipfile

LIMIT = 32 * 1024 * 1024
FORMAT = 'octane-xplat.native-fingerprint.v1'

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('artifact', type=pathlib.Path)
p.add_argument('root', type=pathlib.Path)
p.add_argument('origin')
a = p.parse_args()
artifact = json.loads(a.artifact.read_text())
emitted = pathlib.Path(artifact['Path']).resolve() / 'app'
stamp_path = emitted / 'xplat-native.json'
stamp = json.loads(stamp_path.read_text())
if stamp.get('format') != FORMAT or stamp.get('platform') != 'ios' or stamp.get('release') is not True:
    raise RuntimeError('unexpected xplat-native.json stamp: ' + json.dumps(stamp))
fingerprint = stamp['hash']
manifest_pkg = json.loads((emitted / 'package.json').read_text())
entry_name = manifest_pkg.get('main')
if not isinstance(entry_name, str) or not (emitted / entry_name).is_file():
    raise RuntimeError('emitted package.json has no resolvable main entry')
if entry_name == 'main.mjs':
    raise RuntimeError('emitted entry name collides with the payload main.mjs wrapper')
files = {}
for path in sorted(emitted.rglob('*')):
    if path.is_file() and path.name != 'package.json' and path != stamp_path:
        files[str(path.relative_to(emitted))] = path.read_bytes()
# The engine may move app code into a chunk; exactly one emitted JS file must
# carry the marker so substitution cannot silently miss or double-replace.
marked = [name for name, data in files.items()
          if name.endswith(('.js', '.mjs')) and b'P91_EMBEDDED' in data]
if len(marked) != 1:
    raise RuntimeError('expected exactly one marked emitted JS file, found: ' + json.dumps(marked))


def archive(marker, broken=False, stamp_override=None):
    stream = io.BytesIO()

    def put(z, name, data):
        info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o600 << 16
        z.writestr(info, data)

    with zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        put(z, 'package.json', b'{"main":"main.mjs"}')
        # Emitted chunks may import the entry by name, so it keeps its name and
        # main.mjs only imports it; renaming would evaluate the entry twice.
        source = 'throw new Error("P91 deliberate unconfirmed boot failure");\n' if broken else 'import ' + json.dumps('./' + entry_name) + ';\n'
        put(z, 'main.mjs', source.encode())
        put(z, 'xplat-native.json', json.dumps(stamp_override or stamp).encode())
        for name, data in sorted(files.items()):
            if name in marked:
                data = data.replace(b'P91_EMBEDDED', marker.encode())
            put(z, name, data)
    return stream.getvalue()


def manifest(version, sha, size, fp=None):
    return {'updateAvailable': True, 'platform': 'ios', 'channel': 'stable', 'version': version,
            'sha256': sha, 'size': size, 'nativeFingerprint': fp or fingerprint,
            'url': a.origin.rstrip('/') + '/bundles/' + sha}


out = {'emitted': sorted(files) + ['package.json', 'xplat-native.json'], 'bundles': {}, 'manifests': {}}
(a.root / 'bundles').mkdir(parents=True, exist_ok=True)
(a.root / 'manifests').mkdir(exist_ok=True)
for phase, marker, broken, override in [('v2', 'P91_V2', False, None), ('v3', 'P91_V3', True, None),
                                        ('v5', 'P91_V5', False, dict(stamp, hash='0' * 64))]:
    raw = archive(marker, broken, override)
    if len(raw) > LIMIT:
        raise RuntimeError(phase + ' archive exceeds download limit')
    sha = hashlib.sha256(raw).hexdigest()
    (a.root / 'bundles' / sha).write_bytes(raw)
    data = manifest('2.0.0' if phase == 'v2' else '3.0.0' if phase == 'v3' else '5.0.0', sha, len(raw))
    (a.root / 'manifests' / (phase + '.json')).write_text(json.dumps(data, indent=2) + '\n')
    out['bundles'][phase] = {'sha256': sha, 'size': len(raw), 'marker': marker}
# v4 reuses the v2 archive but advertises an incompatible fingerprint.
v2 = out['bundles']['v2']
v4 = manifest('4.0.0', v2['sha256'], v2['size'], fp='0' * 64)
(a.root / 'manifests' / 'v4.json').write_text(json.dumps(v4, indent=2) + '\n')
out['manifests'] = {'v2': 'manifests/v2.json', 'v3': 'manifests/v3.json', 'v4': 'manifests/v4.json', 'v5': 'manifests/v5.json'}
out['nativeFingerprint'] = fingerprint
json.dump(out, sys.stdout, indent=2)
print()
