import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('existing_avd', Path(__file__).with_name('existing_avd.py'))
existing_avd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(existing_avd)

SCRIPTS = [Path(__file__).with_name('qualify.py'),
           Path(__file__).with_name('native-usage') / 'qualify.py',
           Path(__file__).resolve().parents[1] / 'ota' / 'android' / 'debug_guard.py']


def avd_fixture(root, registry_path=None, config_overrides=None, image_dir=True, extra_config=None):
    home = root / 'home'
    sdk = root / 'sdk'
    data = home / '.android' / 'avd' / (existing_avd.AVD + '.avd')
    data.mkdir(parents=True)
    (home / '.android' / 'avd' / (existing_avd.AVD + '.ini')).write_text(
        'path=' + str(registry_path if registry_path is not None else data) + '\n')
    config = {'abi.type': 'arm64-v8a', 'hw.device.name': 'pixel_6',
              'image.sysdir.1': existing_avd.IMAGE + '/'}
    config.update(config_overrides or {})
    (data / 'config.ini').write_text(''.join(key + '=' + value + '\n' for key, value in config.items()) + (extra_config or ''))
    if image_dir:
        (sdk / existing_avd.IMAGE).mkdir(parents=True)
    return home, sdk


def fake_execute(devices_output='', devices_rc=0, pgrep_rc=1):
    def execute(argv, **kwargs):
        argv = [str(arg) for arg in argv]
        if argv[0] == 'pgrep':
            return subprocess.CompletedProcess(argv, pgrep_rc, stdout='', stderr='')
        return subprocess.CompletedProcess(argv, devices_rc, stdout=devices_output, stderr='')
    return execute


class ExistingAvdHomeTests(unittest.TestCase):
    def test_valid_fixture_returns_avd_home(self):
        with tempfile.TemporaryDirectory() as directory:
            home, sdk = avd_fixture(Path(directory))
            self.assertEqual(existing_avd.existing_avd_home(home, sdk), home / '.android' / 'avd')

    def test_each_incompatible_detail_fails(self):
        cases = {
            'registry path': {'registry_path': Path('/elsewhere') / (existing_avd.AVD + '.avd')},
            'abi': {'config_overrides': {'abi.type': 'x86_64'}},
            'device': {'config_overrides': {'hw.device.name': 'pixel_8'}},
            'image': {'config_overrides': {'image.sysdir.1': 'system-images/android-35/google_apis/x86_64'}},
            'missing image dir': {'image_dir': False},
            'duplicate key': {'extra_config': 'abi.type=arm64-v8a\n'},
        }
        for label, overrides in cases.items():
            with self.subTest(label), tempfile.TemporaryDirectory() as directory:
                home, sdk = avd_fixture(Path(directory), **overrides)
                with self.assertRaises(RuntimeError):
                    existing_avd.existing_avd_home(home, sdk)


class EnsureNoAndroidEmulatorTests(unittest.TestCase):
    HEADER = 'List of devices attached\n\n'

    def test_missing_header_raises(self):
        with self.assertRaises(RuntimeError):
            existing_avd.ensure_no_android_emulator('/sdk', fake_execute('garbage without the header\n', pgrep_rc=1))

    def test_listed_emulator_raises(self):
        with self.assertRaises(RuntimeError):
            existing_avd.ensure_no_android_emulator('/sdk', fake_execute(self.HEADER + 'emulator-5554\tdevice\n', pgrep_rc=1))

    def test_adb_failure_raises(self):
        with self.assertRaises(RuntimeError):
            existing_avd.ensure_no_android_emulator('/sdk', fake_execute(self.HEADER, devices_rc=1, pgrep_rc=1))

    def test_running_process_raises(self):
        with self.assertRaises(RuntimeError):
            existing_avd.ensure_no_android_emulator('/sdk', fake_execute(self.HEADER, pgrep_rc=0))

    def test_unknown_probe_exit_raises(self):
        with self.assertRaises(RuntimeError):
            existing_avd.ensure_no_android_emulator('/sdk', fake_execute(self.HEADER, pgrep_rc=2))

    def test_no_emulator_passes(self):
        existing_avd.ensure_no_android_emulator('/sdk', fake_execute(self.HEADER + '00a1b2c3\tdevice\n', pgrep_rc=1))


class EmulatorEnvTests(unittest.TestCase):
    def test_replaces_avd_home_and_preserves_base(self):
        base = {'ANDROID_AVD_HOME': '/elsewhere', 'OTHER': 'kept'}
        env = existing_avd.emulator_env(Path('/avds'), base)
        self.assertEqual(env['ANDROID_AVD_HOME'], '/avds')
        self.assertEqual(env['OTHER'], 'kept')
        self.assertEqual(base, {'ANDROID_AVD_HOME': '/elsewhere', 'OTHER': 'kept'})


class PackagePresentTests(unittest.TestCase):
    def test_exact_match(self):
        self.assertTrue(existing_avd.package_present('package:org.example.b2fresh\npackage:other\n', 'org.example.b2fresh'))

    def test_prefix_is_not_a_match(self):
        self.assertFalse(existing_avd.package_present('package:org.example.b2fresh2\n', 'org.example.b2fresh'))

    def test_empty_output(self):
        self.assertFalse(existing_avd.package_present('', 'org.example.b2fresh'))

    def test_invalid_line_raises(self):
        with self.assertRaises(RuntimeError):
            existing_avd.package_present('package:org.example.b2fresh\nwarning: bogus\n', 'org.example.b2fresh')


def fake_adb(packages, uninstall_output='Success\n', uninstall_works=True):
    calls = []

    def adb(*args):
        calls.append(args)
        if args[:3] == ('shell', 'pm', 'list'):
            return ''.join('package:' + name + '\n' for name in sorted(packages))
        if args[0] == 'uninstall':
            if uninstall_works:
                packages.discard(args[1])
            return uninstall_output
        raise AssertionError('unexpected adb args: %r' % (args,))

    adb.calls = calls
    return adb


class RetireOwnedPackageTests(unittest.TestCase):
    PACKAGE = 'org.example.b2fresh'

    def test_absent_never_uninstalls(self):
        adb = fake_adb({'unrelated.app'})
        existing_avd.retire_owned_package(adb, self.PACKAGE)
        self.assertEqual(adb.calls, [('shell', 'pm', 'list', 'packages', self.PACKAGE)])

    def test_present_uninstalls_then_verifies_absence(self):
        adb = fake_adb({self.PACKAGE})
        existing_avd.retire_owned_package(adb, self.PACKAGE)
        self.assertEqual(adb.calls, [('shell', 'pm', 'list', 'packages', self.PACKAGE),
                                     ('uninstall', self.PACKAGE),
                                     ('shell', 'pm', 'list', 'packages', self.PACKAGE)])

    def test_uninstall_without_success_raises(self):
        with self.assertRaises(RuntimeError):
            existing_avd.retire_owned_package(fake_adb({self.PACKAGE}, uninstall_output='Failure [X]\n'), self.PACKAGE)

    def test_surviving_uninstall_raises(self):
        with self.assertRaises(RuntimeError):
            existing_avd.retire_owned_package(fake_adb({self.PACKAGE}, uninstall_works=False), self.PACKAGE)


def radio_adb(state):
    calls = []

    def adb(*args):
        calls.append(args)
        if args[:3] == ('shell', 'settings', 'get'):
            return state[args[4]] + '\n'
        if args[:4] == ('shell', 'cmd', 'connectivity', 'airplane-mode'):
            state['airplane_mode_on'] = '1' if args[4] == 'enable' else '0'
        elif args[:3] == ('shell', 'svc', 'wifi'):
            state['wifi_on'] = '1' if args[3] == 'enable' else '0'
        elif args[:3] == ('shell', 'svc', 'data'):
            state['mobile_data'] = '1' if args[3] == 'enable' else '0'
        else:
            raise AssertionError('unexpected adb args: %r' % (args,))
        return ''

    adb.calls = calls
    return adb


class RadioStateTests(unittest.TestCase):
    def test_capture_reads_each_setting(self):
        adb = radio_adb({'airplane_mode_on': '0', 'wifi_on': '1', 'mobile_data': '1'})
        self.assertEqual(existing_avd.capture_radio_state(adb),
                         {'airplane_mode_on': '0', 'wifi_on': '1', 'mobile_data': '1'})

    def test_restore_returns_to_each_captured_combination(self):
        for captured in ('0', '1'):
            for wifi in ('0', '1'):
                for data in ('0', '1'):
                    with self.subTest(airplane=captured, wifi=wifi, data=data):
                        state = {'airplane_mode_on': '1', 'wifi_on': '0', 'mobile_data': '0'}
                        adb = radio_adb(state)
                        before = {'airplane_mode_on': captured, 'wifi_on': wifi, 'mobile_data': data}
                        observed = existing_avd.restore_radio_state(adb, before)
                        self.assertEqual(observed, before)
                        self.assertEqual(state, before)

    def test_unrestored_mismatch_raises(self):
        def adb(*args):
            if args[:3] == ('shell', 'settings', 'get'):
                return '1\n'
            return ''
        with self.assertRaises(RuntimeError):
            existing_avd.restore_radio_state(adb, {'airplane_mode_on': '0', 'wifi_on': '0', 'mobile_data': '0'})


class ScriptStaticGuardTests(unittest.TestCase):
    FORBIDDEN = ('avdmanager', "'create', 'avd'", "'delete', 'avd'", 'disk.dataPartition')

    def test_scripts_never_create_rewrite_or_delete_devices(self):
        for script in SCRIPTS:
            text = script.read_text()
            for forbidden in self.FORBIDDEN:
                with self.subTest(script=script.name, forbidden=forbidden):
                    self.assertNotIn(forbidden, text)


if __name__ == '__main__':
    unittest.main()
