"""Artifact qualification regressions; run with python3 -B -m unittest discover."""
import base64
import hashlib
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('verify_artifacts', Path(__file__).with_name('verify-artifacts.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ArtifactTests(unittest.TestCase):
    def archive(self, file, entries):
        with tarfile.open(file, 'w:gz') as archive:
            for name, data, link in entries:
                entry = tarfile.TarInfo(name)
                if link:
                    entry.type = tarfile.SYMTYPE
                    entry.linkname = link
                    archive.addfile(entry)
                else:
                    entry.size = len(data)
                    archive.addfile(entry, io.BytesIO(data))

    def test_payload_extracts_internal_links_and_bundled_dependency_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            container = Path(tmp).resolve()
            file, root = container / 'package.tgz', container / 'payload'
            root.mkdir()
            self.archive(file, [('package/a', b'original', None), ('package/link', b'', 'a'), ('package/node_modules/bundled/index.js', b'bundled', None)])
            m.unpack(file, root)
            records = m.inventory(root)
            self.assertEqual(records['link'], {'kind': 'symlink', 'target': 'a'})
            self.assertIn('node_modules/bundled/index.js', records)
            self.assertNotIn('node_modules/bundled/index.js', m.inventory(root, omit_installer_modules=True))

    def test_archive_escape_and_duplicate_entries_are_rejected(self):
        for entries in [[('package/../outside', b'x', None)], [('package/escape', b'', '../outside')], [('package/a', b'first', None), ('package/a', b'second', None)]]:
            with self.subTest(entries=entries), tempfile.TemporaryDirectory() as tmp:
                container = Path(tmp).resolve()
                file, root = container / 'package.tgz', container / 'payload'
                root.mkdir()
                self.archive(file, entries)
                with self.assertRaises(ValueError):
                    m.unpack(file, root)
                self.assertFalse((container / 'outside').exists())

    def test_named_roots_and_identical_normalized_entries_are_recorded(self):
        with tempfile.TemporaryDirectory() as tmp:
            container = Path(tmp).resolve()
            file, root = container / 'package.tgz', container / 'payload'
            root.mkdir()
            self.archive(file, [('react/./index.d.ts', b'payload', None), ('react/index.d.ts', b'payload', None)])
            layout = m.unpack(file, root)
            self.assertEqual(layout['archiveRoot'], 'react')
            self.assertEqual(len(layout['identicalDuplicateEntries']), 1)
            self.assertEqual((root / 'index.d.ts').read_bytes(), b'payload')
        with tempfile.TemporaryDirectory() as tmp:
            container = Path(tmp).resolve()
            file, root = container / 'package.tgz', container / 'payload'
            root.mkdir()
            self.archive(file, [('react/index.d.ts', b'payload', None), ('other/index.d.ts', b'other', None)])
            with self.assertRaises(ValueError):
                m.unpack(file, root)

    def test_only_empty_root_installer_tags_are_classified(self):
        empty = {'kind': 'file', 'sha256': hashlib.sha256(b'').hexdigest()}
        changed = {'kind': 'file', 'sha256': hashlib.sha256(b'changed').hexdigest()}
        actual = {'.bun-tag-a': empty, '.bun-tag-b': changed, 'nested/.bun-tag-c': empty, '.bun-tag-abcg': empty, '.bun-tag-d': {'kind': 'symlink', 'target': 'elsewhere'}}
        result = m.differences({}, actual)
        self.assertEqual(result['emptyBunInstallerTags'], ['.bun-tag-a'])
        self.assertEqual(len(result['extra']), 4)
        self.assertEqual(m.differences({'.bun-tag-a': empty}, {'.bun-tag-a': changed})['changed'], ['.bun-tag-a'])

    def test_precise_eof_annotation_repair_keeps_unrelated_line_breaks(self):
        patch = b'''diff --git a/other.js b/other.js
--- a/other.js
+++ b/other.js
@@ -1,2 +1,3 @@
 first
+added
 middle
diff --git a/hmr/shared/vendor/manifest-collect.js b/hmr/shared/vendor/manifest-collect.js
--- a/hmr/shared/vendor/manifest-collect.js
+++ b/hmr/shared/vendor/manifest-collect.js
@@ -1,3 +1,2 @@
 a
 }
\\ No newline at end of file
-//# sourceMappingURL=manifest-collect.js.map
\\ No newline at end of file
'''
        missing_old_marker = patch.replace(b'-//# sourceMappingURL=manifest-collect.js.map\n\\ No newline at end of file\n', b'-//# sourceMappingURL=manifest-collect.js.map\n')
        for identity, selected in [('@nativescript/vite@8.0.20', patch), ('@nativescript/vite@8.0.21', missing_old_marker)]:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp).resolve() / 'payload'
                target = root / 'hmr/shared/vendor/manifest-collect.js'
                target.parent.mkdir(parents=True)
                target.write_bytes(b'a\n}\n//# sourceMappingURL=manifest-collect.js.map')
                (root / 'other.js').write_bytes(b'first\nmiddle\nlast')
                file = root.parent / 'original.patch'
                file.write_bytes(selected)
                with (root.parent / 'log').open('w') as log:
                    result = m.apply_patch(root, file, identity, log)
                self.assertEqual(target.read_bytes(), b'a\n}')
                self.assertEqual((root / 'other.js').read_bytes(), b'first\nadded\nmiddle\nlast')
                self.assertIsNotNone(result['formatNormalization'])
                self.assertEqual(file.read_bytes(), selected)
        with self.assertRaises(ValueError):
            m.normalize_vite_eof(b'unsupported')

    def test_patch_path_escape_is_rejected_before_git(self):
        for patch in [b'diff --git a/../outside b/../outside\n--- a/safe\n+++ b/safe\n', b'--- a/../outside\n+++ b/../outside\n', b'GIT binary patch\n']:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                m.validate_patch(patch)

    def test_corrupt_cache_never_counts_as_verified_and_remains_unchanged(self):
        expected = b'trusted'
        sri = 'sha512-' + base64.b64encode(hashlib.sha512(expected).digest()).decode()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            file = root / (hashlib.sha512(expected).hexdigest() + '.tgz')
            file.write_bytes(b'corrupt')
            with self.assertRaises(ValueError):
                m.tarball({'integrity': sri}, root, root / 'npm', False)
            self.assertEqual(file.read_bytes(), b'corrupt')
            file.unlink()
            with self.assertRaisesRegex(ValueError, '--allow-fetch'):
                m.tarball({'integrity': sri}, root, root / 'npm', False)

    def test_redirect_cannot_downgrade_https_or_change_registry(self):
        for url in ['http://registry.npmjs.org/package', 'https://other.example/package', 'https://user:password@registry.npmjs.org/package']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                m.HTTPSRedirect().redirect_request(None, None, 302, 'redirect', {}, url)


if __name__ == '__main__':
    unittest.main()
