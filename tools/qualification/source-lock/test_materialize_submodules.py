"""Verify vendor identities against Git and reject unchecked nested content."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('materialize', Path(__file__).with_name('materialize-submodules.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class VendorSourceTests(unittest.TestCase):
    def test_tree_agrees_with_git_and_detects_content_and_mode_changes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            def git(*args):
                return subprocess.check_output(['git', *args], cwd=root, text=True).strip()
            git('init', '--quiet')
            (root / 'a').mkdir()
            (root / 'a/file').write_text('child')
            (root / 'a.c').write_text('sibling')
            (root / 'run').write_text('executable')
            (root / 'run').chmod(0o755)
            (root / 'link').symlink_to('missing')
            git('add', '.')
            pin = '1' * 40
            git('update-index', '--add', '--cacheinfo', '160000', pin, 'vendor')
            expected = git('write-tree')
            self.assertEqual(module.git_tree(root, {'vendor': pin}), expected)
            (root / 'run').chmod(0o644)
            self.assertNotEqual(module.git_tree(root, {'vendor': pin}), expected)
            (root / 'run').chmod(0o755)
            (root / 'a/file').write_text('changed')
            self.assertNotEqual(module.git_tree(root, {'vendor': pin}), expected)

    def test_materialized_nested_content_and_links_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            pins = {'vendor': '2' * 40}
            module.require_unmaterialized(root, pins)
            (root / 'vendor').mkdir()
            module.require_unmaterialized(root, pins)
            (root / 'vendor/file').write_text('unverified')
            with self.assertRaisesRegex(ValueError, 'absent or empty'):
                module.require_unmaterialized(root, pins)
            (root / 'vendor/file').unlink()
            (root / 'vendor').rmdir()
            (root / 'vendor').symlink_to('missing')
            with self.assertRaisesRegex(ValueError, 'absent or empty'):
                module.require_unmaterialized(root, pins)


if __name__ == '__main__':
    unittest.main()
