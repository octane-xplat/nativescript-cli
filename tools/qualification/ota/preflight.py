#!/usr/bin/env python3
"""Read-only host preflight for an explicitly authorized canonical OTA origin.

Uses system HTTPS trust, refuses redirects, and never uploads or extracts files.
Passing is host evidence only, not guest check/install or release acceptance.
"""
import argparse
import hashlib
import io
import json
import re
import urllib.parse
import urllib.request
import zipfile

DOWNLOAD_LIMIT = 32 * 1024 * 1024
EXPANDED_LIMIT = 128 * 1024 * 1024
HASH = r'[0-9a-f]{64}'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def version(value):
    return (isinstance(value, str) and
            re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', value) is not None and
            all(int(part) <= 2**53 - 1 for part in value.split('.')))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('OTA origin returned a redirect')


def fetch(url, limit):
    # No custom SSL context, CA installation or credential discovery.
    with urllib.request.build_opener(NoRedirect()).open(url, timeout=30) as response:
        require(response.status == 200, 'OTA request did not return 200')
        data = response.read(limit + 1)
    require(len(data) <= limit, 'OTA response exceeds byte limit')
    return data


def validate_manifest(data, origin, platform, channel, fingerprint):
    require(isinstance(data, dict), 'Manifest must be an object')
    require(data.get('updateAvailable') is True and data.get('platform') == platform and
            data.get('channel') == channel, 'Expected an available release for this platform/channel')
    require(version(data.get('version')), 'Invalid payload version')
    sha = data.get('sha256')
    require(isinstance(sha, str) and re.fullmatch(HASH, sha), 'Invalid archive hash')
    require(type(data.get('size')) is int and 0 < data['size'] <= DOWNLOAD_LIMIT,
            'Invalid archive size or download limit exceeded')
    require(data.get('nativeFingerprint') == fingerprint, 'Native fingerprint mismatch')
    require(data.get('url') == origin + '/bundles/' + sha, 'Archive must use the exact same-origin hash path')


def validate_archive(raw, manifest, platform, fingerprint):
    require(len(raw) == manifest['size'] and hashlib.sha256(raw).hexdigest() == manifest['sha256'],
            'Archive integrity or size mismatch')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        names, files, expanded = set(), {}, 0
        entries = archive.infolist()
        require(len(entries) <= 10000, 'Too many archive entries')
        for entry in entries:
            name = entry.filename.removesuffix('/')
            require(name and not re.search(r'[\\:\x00]', name) and
                    all(part not in ('', '.', '..') for part in name.split('/')),
                    'Unsafe archive path')
            require(name.lower() not in names, 'Duplicate archive path')
            names.add(name.lower())
            expanded += entry.file_size
            require(expanded <= EXPANDED_LIMIT, 'Expanded archive limit exceeded')
            if not entry.is_dir():
                files[name] = entry
        require('package.json' in files and 'xplat-native.json' in files, 'Missing archive metadata')
        # Read metadata only after applying the complete expanded-size bound.
        package = json.loads(archive.read(files['package.json']))
        stamp = json.loads(archive.read(files['xplat-native.json']))
        require(isinstance(stamp, dict) and stamp.get('format') == 'octane-xplat.native-fingerprint.v1' and
                stamp.get('platform') == platform and stamp.get('release') is True and
                stamp.get('hash') == fingerprint, 'Archive native stamp mismatch')
        main = package.get('main') if isinstance(package, dict) else None
        require(isinstance(main, str) and re.fullmatch(r'[a-zA-Z0-9_-]+(?:\.mjs)?', main),
                'Invalid archive entry point')
        require((main if main.endswith('.mjs') else main + '.mjs') in files, 'Missing archive entry point')
        # Verify CRCs for every entry without extracting into the filesystem.
        require(archive.testzip() is None, 'Archive CRC mismatch')


def preflight(origin, platform, channel, fingerprint, current, request=fetch):
    origin = origin.removesuffix('/')
    require(re.fullmatch(r'https://[a-zA-Z0-9.-]+(?::[0-9]+)?', origin), 'Expected an HTTPS origin without a path')
    require(re.fullmatch(HASH, fingerprint), 'Invalid native fingerprint')
    require(platform in ('ios', 'android'), 'Invalid platform')
    require(re.fullmatch(r'[a-z0-9][a-z0-9-]{0,31}', channel), 'Invalid channel')
    require(version(current), 'Invalid current version')
    query = urllib.parse.urlencode(dict(platform=platform, channel=channel,
                                       nativeFingerprint=fingerprint, currentVersion=current))
    raw_manifest = request(origin + '/manifest?' + query, 65536)
    require(len(raw_manifest) <= 65536, 'Manifest exceeds byte limit')
    manifest = json.loads(raw_manifest)
    validate_manifest(manifest, origin, platform, channel, fingerprint)
    raw = request(manifest['url'], manifest['size'])
    validate_archive(raw, manifest, platform, fingerprint)
    return dict(boundary='host HTTPS manifest/archive preflight only; guest installer unqualified',
                platform=platform, channel=channel, version=manifest['version'],
                nativeFingerprint=fingerprint, sha256=manifest['sha256'], size=manifest['size'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('origin', help='existing authorized HTTPS origin')
    parser.add_argument('platform', choices=['ios', 'android'])
    parser.add_argument('native_fingerprint')
    parser.add_argument('--channel', default='stable')
    parser.add_argument('--current-version', default='1.0.0')
    args = parser.parse_args()
    try:
        print(json.dumps(preflight(args.origin, args.platform, args.channel,
                                   args.native_fingerprint, args.current_version), indent=2))
    except Exception:
        # urllib exceptions can include credential-bearing proxy URLs. Keep all
        # network/configuration errors out of durable evidence and terminal logs.
        parser.exit(1, 'OTA host preflight failed; no guest acceptance established\n')


if __name__ == '__main__':
    main()
