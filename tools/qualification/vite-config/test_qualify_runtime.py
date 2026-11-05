import importlib.util
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('qualify_preset_runtime', Path(__file__).with_name('qualify-runtime.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class ExistingSimulatorDriverTests(unittest.TestCase):
    def test_build_release_precedes_exact_guest_delegation_and_failure_is_not_success(self):
        for failure in [None, 'go', 'acquire', 'build', 'release', 'runtime']:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                root = Path(directory).resolve()
                app = root / 'app'
                app.mkdir()
                (app / 'runtime-probe.json').write_text('{}')
                prefix = root / 'result'
                calls = []

                def execute(argv, **kwargs):
                    calls.append(argv)
                    stage = ('go' if argv[0] == 'go' else argv[2] if argv[0] == 'goddard-agent'
                             else 'runtime' if argv[1].endswith('qualify-retained-runtime.py') else 'build')
                    if stage == failure:
                        raise subprocess.CalledProcessError(1, argv)
                    if stage == 'acquire':
                        return subprocess.CompletedProcess(argv, 0, stdout='{"id":"fixture-build-grant"}')
                    return subprocess.CompletedProcess(argv, 0)

                with redirect_stdout(io.StringIO()):
                    if failure:
                        with self.assertRaises(subprocess.CalledProcessError):
                            runner.main([str(app), str(prefix)], repo=root, execute=execute)
                    else:
                        runner.main([str(app), str(prefix)], repo=root, execute=execute)
                self.assertTrue(all('create' not in command and 'delete' not in command for command in calls))
                record = json.loads(Path(str(prefix) + '.build-ownership.json').read_text())
                acquired = failure not in ['go', 'acquire']
                released = acquired and failure != 'release'
                self.assertEqual(record['buildLeaseRetired'], released)
                delegated = [call for call in calls if len(call) > 1 and call[1].endswith('qualify-retained-runtime.py')]
                self.assertEqual(bool(delegated), failure in [None, 'runtime'])
                if delegated:
                    self.assertEqual(delegated[0][5], runner.GUEST)
                    self.assertEqual(delegated[0][6], str(prefix) + '.guest')
                    release = next(i for i, call in enumerate(calls) if call[:3] == ['goddard-agent', 'resource', 'release'])
                    self.assertLess(release, calls.index(delegated[0]))

    def test_existing_evidence_refuses_before_commands(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            app = root / 'app'
            app.mkdir()
            (app / 'runtime-probe.json').write_text('{}')
            (root / 'result.runtime.json').write_text('caller-owned')
            with self.assertRaises(RuntimeError):
                runner.main([str(app), str(root / 'result')], repo=root,
                            execute=lambda *a, **k: self.fail('unexpected tool execution'))
            self.assertEqual((root / 'result.runtime.json').read_text(), 'caller-owned')

    def test_retained_runner_rejects_other_udid_before_files_or_tools(self):
        result = subprocess.run([sys.executable, str(Path(__file__).with_name('qualify-retained-runtime.py')),
                                 '/not-an-app', '/not-a-build', '/not-a-consumer', 'OTHER-GUEST', '/not-an-output'],
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Only the prescribed existing iPhone18Pro UDID', result.stderr)
        self.assertNotIn('FileNotFoundError', result.stderr)


if __name__ == '__main__':
    unittest.main()
