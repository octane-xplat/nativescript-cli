"""Real loopback HTTP backend checks, not external/guest HTTPS evidence."""
import http.client
import http.server
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.parse

import preflight_test
from serve import handler


class ServerTests(unittest.TestCase):
    def test_canonical_routes_and_read_only_boundary(self):
        fixture = preflight_test.PreflightTests()
        raw, manifest = fixture.fixture()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'bundles').mkdir()
            (root / 'bundles' / manifest['sha256']).write_bytes(raw)
            (root / 'manifest.json').write_text(json.dumps(manifest))
            server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler(root, fixture.origin))
            thread = threading.Thread(target=server.serve_forever)
            thread.start()
            try:
                def request(path, method='GET'):
                    connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=5)
                    try:
                        connection.request(method, path)
                        response = connection.getresponse()
                        return response.status, response.getheader('Cache-Control'), response.read()
                    finally:
                        connection.close()

                query = dict(platform='ios', channel='stable', nativeFingerprint=fixture.fingerprint,
                             currentVersion='1.0.0')
                path = lambda: '/manifest?' + urllib.parse.urlencode(query)
                status, cache, body = request(path())
                self.assertEqual((status, cache, json.loads(body)), (200, 'no-store', manifest))
                query['nativeFingerprint'] = 'b' * 64
                self.assertEqual(json.loads(request(path())[2])['reason'], 'native-incompatible')
                query['nativeFingerprint'] = fixture.fingerprint
                query['currentVersion'] = '2.0.0'
                self.assertEqual(json.loads(request(path())[2])['reason'], 'up-to-date')
                status, cache, body = request('/bundles/' + manifest['sha256'])
                self.assertEqual(status, 200)
                self.assertIn('immutable', cache)
                self.assertEqual(body, raw)
                for path_ in ['/manifest', '/manifest?token=unknown', '/bundles/../manifest.json',
                              '/bundles/' + manifest['sha256'] + '?extra=1', '/']:
                    self.assertIn(request(path_)[0], (400, 404))
                self.assertEqual(request('/manifest', 'POST')[0], 501)
                # A changed archive at a hash URL fails closed.
                (root / 'bundles' / manifest['sha256']).write_bytes(b'tampered')
                self.assertEqual(request('/bundles/' + manifest['sha256'])[0], 400)
            finally:
                server.shutdown()
                thread.join()
                server.server_close()


if __name__ == '__main__':
    unittest.main()
