#!/usr/bin/env python3
"""Loopback-only canonical OTA fixture backend for an existing HTTPS proxy.

Read-only HTTP upstream; PORTLESS_URL is the externally validated HTTPS origin.
The caller owns the root containing manifest.json and bundles/<sha256>.
No uploads, directory listing, proxy configuration or trust changes are exposed.
"""
import argparse
import hashlib
import http.server
import json
import os
from pathlib import Path
import re
import urllib.parse

import preflight


def handler(root, origin):
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def reply(self, status, body, content_type='application/json', immutable=False):
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable' if immutable else 'no-store')
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            path = urllib.parse.urlsplit(self.path)
            try:
                if path.path == '/manifest':
                    query = urllib.parse.parse_qs(path.query, strict_parsing=True)
                    preflight.require(set(query) == {'platform', 'channel', 'nativeFingerprint', 'currentVersion'} and
                                      all(len(values) == 1 for values in query.values()), 'Invalid query')
                    platform, channel, fingerprint, current = [query[key][0] for key in
                        ('platform', 'channel', 'nativeFingerprint', 'currentVersion')]
                    preflight.require(platform in ('ios', 'android') and
                                      re.fullmatch(r'[a-z0-9][a-z0-9-]{0,31}', channel) and
                                      re.fullmatch(preflight.HASH, fingerprint) and preflight.version(current),
                                      'Invalid query')
                    # Replace manifest.json atomically between lifecycle phases.
                    # Archives stay immutable at their content-addressed paths.
                    manifest = json.loads((root / 'manifest.json').read_bytes())
                    preflight.validate_manifest(manifest, origin, manifest['platform'],
                                                manifest['channel'], manifest['nativeFingerprint'])
                    if platform != manifest['platform'] or channel != manifest['channel']:
                        self.reply(404, b'{}')
                        return
                    reason = None
                    if fingerprint != manifest['nativeFingerprint']:
                        reason = 'native-incompatible'
                    elif tuple(map(int, current.split('.'))) >= tuple(map(int, manifest['version'].split('.'))):
                        reason = 'up-to-date'
                    body = {'updateAvailable': False, 'reason': reason} if reason else manifest
                    self.reply(200, json.dumps(body).encode())
                    return
                match = re.fullmatch(r'/bundles/(' + preflight.HASH + ')', path.path)
                if match and not path.query:
                    bundle = root / 'bundles' / match[1]
                    preflight.require(not bundle.is_symlink(), 'Symlink archive refused')
                    with bundle.open('rb') as stream:
                        raw = stream.read(preflight.DOWNLOAD_LIMIT + 1)
                    preflight.require(len(raw) <= preflight.DOWNLOAD_LIMIT and
                                      hashlib.sha256(raw).hexdigest() == match[1], 'Archive mismatch')
                    self.reply(200, raw, 'application/zip', immutable=True)
                    return
                self.reply(404, b'{}')
            except FileNotFoundError:
                self.reply(404, b'{}')
            except (ValueError, KeyError, OSError):
                self.reply(400, b'{"error":"invalid fixture request or data"}')

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--origin', default=os.environ.get('PORTLESS_URL'))
    parser.add_argument('--port', type=int, default=int(os.environ.get('PORT', '0')))
    args = parser.parse_args()
    if not args.origin or not re.fullmatch(r'https://[a-zA-Z0-9.-]+(?::[0-9]+)?', args.origin):
        parser.error('Supply the existing proxy HTTPS origin via --origin or PORTLESS_URL')
    server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), handler(args.root.resolve(), args.origin))
    print(json.dumps({'backend': '127.0.0.1', 'port': server.server_port, 'origin': args.origin}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
