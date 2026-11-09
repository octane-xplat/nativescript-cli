"""Reject the consumer's alternate application identity before touching devices."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class IdentityGuardTests(unittest.TestCase):
    def test_alternate_app_identity_never_starts_either_runner(self):
        for script in ('cli-cycle.py', 'android-cycle.py'):
            with self.subTest(script=script), tempfile.TemporaryDirectory() as work:
                report = Path(work) / 'must-not-exist'
                result = subprocess.run([sys.executable, '-B', str(Path(__file__).with_name(script)),
                                         '--consumer', str(Path(work) / 'not-a-checkout'),
                                         '--report', str(report)], capture_output=True, text=True,
                                        env=dict(os.environ, XPLAT_DOCS_DEMOS='1'), timeout=10)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('overrides the probe application identity', result.stderr)
                self.assertNotIn('consumer must be an isolated Git worktree', result.stderr)
                self.assertFalse(report.exists())


if __name__ == '__main__':
    unittest.main()
