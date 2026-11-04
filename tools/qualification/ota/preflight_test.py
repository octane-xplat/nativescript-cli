"""Offline contract checks; no network or guest TLS qualification."""
import hashlib
import io
import json
import unittest
import zipfile

import preflight as p


class PreflightTests(unittest.TestCase):
    origin = 'https://approved.example'
    fingerprint = 'a' * 64

    def fixture(self, extra=None, stamp=None, main='main.mjs'):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as archive:
            archive.writestr('package.json', json.dumps({'main': main}))
            archive.writestr('main.mjs', '/* emitted payload fixture */')
            archive.writestr('xplat-native.json', json.dumps(stamp or {
                'format': 'octane-xplat.native-fingerprint.v1', 'platform': 'ios',
                'release': True, 'hash': self.fingerprint}))
            if extra:
                archive.writestr(*extra)
        raw = stream.getvalue()
        sha = hashlib.sha256(raw).hexdigest()
        manifest = dict(updateAvailable=True, platform='ios', channel='stable', version='2.0.0',
                        sha256=sha, size=len(raw), nativeFingerprint=self.fingerprint,
                        url=self.origin + '/bundles/' + sha)
        return raw, manifest

    def test_request_contract_and_evidence_boundary(self):
        raw, manifest = self.fixture()
        calls = []

        def request(url, limit):
            calls.append((url, limit))
            return json.dumps(manifest).encode() if len(calls) == 1 else raw

        result = p.preflight(self.origin, 'ios', 'stable', self.fingerprint, '1.0.0', request)
        self.assertEqual(calls, [(self.origin + '/manifest?platform=ios&channel=stable&nativeFingerprint=' +
                                 self.fingerprint + '&currentVersion=1.0.0', 65536),
                                (manifest['url'], len(raw))])
        self.assertIn('guest installer unqualified', result['boundary'])

    def test_invalid_origin_never_requests(self):
        for origin in ['http://approved.example', 'https://user:password@approved.example',
                       self.origin + '/path', self.origin + '?query=1', self.origin + '#fragment']:
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                p.preflight(origin, 'ios', 'stable', self.fingerprint, '1.0.0',
                            lambda *_: self.fail('network called for invalid origin'))

    def test_manifest_rejections(self):
        _, valid = self.fixture()
        for field, value in [('url', 'https://other.example/bundles/' + valid['sha256']),
                             ('size', True), ('size', p.DOWNLOAD_LIMIT + 1),
                             ('nativeFingerprint', 'b' * 64), ('version', '02.0.0'),
                             ('updateAvailable', False), ('platform', 'android'),
                             ('channel', 'other')]:
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                p.validate_manifest(dict(valid, **{field: value}), self.origin, 'ios',
                                    'stable', self.fingerprint)

    def test_tampering_and_archive_contract(self):
        raw, manifest = self.fixture()
        with self.assertRaises(ValueError):
            p.validate_archive(raw + b'x', manifest, 'ios', self.fingerprint)
        cases = [dict(extra=('../outside', 'unsafe')), dict(extra=('MAIN.MJS', 'duplicate')),
                 dict(main='missing'), dict(stamp={'release': False})]
        for case in cases:
            with self.subTest(case=case), self.assertRaises(ValueError):
                raw, manifest = self.fixture(**case)
                p.validate_archive(raw, manifest, 'ios', self.fingerprint)

    def test_expanded_archive_bound(self):
        raw, manifest = self.fixture()
        previous = p.EXPANDED_LIMIT
        try:
            p.EXPANDED_LIMIT = 1
            with self.assertRaises(ValueError):
                p.validate_archive(raw, manifest, 'ios', self.fingerprint)
        finally:
            p.EXPANDED_LIMIT = previous

    def test_redirect_refused(self):
        with self.assertRaises(ValueError):
            p.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.example')


if __name__ == '__main__':
    unittest.main()
