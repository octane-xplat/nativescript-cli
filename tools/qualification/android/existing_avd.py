"""Caller-owned AVD policy shared by the Python Android qualification harnesses.

Mirrors tools/qualification/development/consumer/device_policy.go: only the
existing elegant-fir-probe AVD may boot, at most one emulator at a time, and no
device may ever be created, registered, rewritten or deleted.
"""
import os
from pathlib import Path
import posixpath
import subprocess

AVD = 'elegant-fir-probe'
IMAGE = 'system-images/android-35/google_apis/arm64-v8a'
EMULATOR_PROCESS = r'/emulator/(qemu/[^ ]*/)?(emulator|qemu-system-(aarch64|x86_64))( |$)'


def read_device_config(path):
    """Parse an emulator key=value ini; a repeated key is ambiguous."""
    values = {}
    for line in Path(path).read_text().splitlines():
        if '=' not in line:
            continue
        key, _, value = line.partition('=')
        key = key.strip()
        if key in values:
            raise RuntimeError('ambiguous duplicate field in device config: ' + str(path))
        values[key] = value.strip()
    return values


def existing_avd_home(home, sdk):
    """Return HOME/.android/avd after proving the prescribed existing AVD."""
    root = Path(home) / '.android' / 'avd'
    data = root / (AVD + '.avd')
    try:
        registry = read_device_config(root / (AVD + '.ini'))
    except OSError as error:
        raise RuntimeError('required existing AVD registry: ' + str(error)) from error
    if os.path.normpath(registry.get('path', '')) != os.path.normpath(str(data)):
        raise RuntimeError('required AVD registry points outside the prescribed data directory')
    try:
        config = read_device_config(data / 'config.ini')
    except OSError as error:
        raise RuntimeError('required existing AVD config: ' + str(error)) from error
    if (config.get('abi.type') != 'arm64-v8a' or config.get('hw.device.name') != 'pixel_6'
            or posixpath.normpath(config.get('image.sysdir.1', '')) != IMAGE):
        raise RuntimeError('existing AVD is incompatible with the prescribed Pixel 6/API35/Google APIs/arm64 target')
    if not (Path(sdk) / IMAGE).is_dir():
        raise RuntimeError('prescribed Android system image is unavailable; no download or replacement is permitted')
    return root


def ensure_no_android_emulator(sdk, execute=subprocess.run):
    """Fail unless ADB proves no emulator serial and pgrep proves no process.

    A starting emulator may not have registered with ADB yet, so the pgrep
    presence/absence exit contract is also required. pgrep output is never
    printed or propagated.
    """
    adb = Path(sdk) / 'platform-tools' / 'adb'
    try:
        result = execute([str(adb), 'devices'], capture_output=True, text=True, timeout=30)
    except Exception as error:
        raise RuntimeError('cannot establish Android emulator availability: ' + str(error)) from error
    if result.returncode != 0:
        raise RuntimeError('cannot establish Android emulator availability: adb devices failed')
    header = False
    for line in result.stdout.splitlines():
        if line.strip() == 'List of devices attached':
            header = True
        fields = line.split()
        if fields and fields[0].startswith('emulator-'):
            raise RuntimeError('an Android emulator is already present; coordinate or wait')
    if not header:
        raise RuntimeError('ADB returned no device-list header; emulator availability is unknown')
    try:
        probe = execute(['pgrep', '-f', EMULATOR_PROCESS], capture_output=True, text=True, timeout=30)
    except Exception as error:
        raise RuntimeError('cannot establish emulator process absence: ' + str(error)) from error
    if probe.returncode == 1:
        return
    if probe.returncode == 0:
        raise RuntimeError('an Android emulator process is already running or starting; coordinate or wait')
    raise RuntimeError('cannot establish emulator process absence: pgrep exit ' + str(probe.returncode))


def emulator_env(avd_home, base=None):
    """Child environment pointing ANDROID_AVD_HOME only at the caller's avd dir."""
    env = dict(os.environ if base is None else base)
    env.pop('ANDROID_AVD_HOME', None)
    env['ANDROID_AVD_HOME'] = str(avd_home)
    return env


def package_present(output, package):
    """Strict `pm list packages` scan: every line is package:NAME; exact match."""
    present = False
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        if not line.startswith('package:'):
            raise RuntimeError('invalid package-list response')
        present = present or line[len('package:'):] == package
    return present


def retire_owned_package(adb, package):
    """Uninstall an owned installation and verify absence; no-op when absent."""
    if not package_present(adb('shell', 'pm', 'list', 'packages', package), package):
        return
    if adb('uninstall', package).strip() != 'Success':
        raise RuntimeError('owned package uninstall failed: ' + package)
    if package_present(adb('shell', 'pm', 'list', 'packages', package), package):
        raise RuntimeError('owned package survived uninstall: ' + package)


_RADIOS = (('airplane_mode_on', ('cmd', 'connectivity', 'airplane-mode')),
           ('wifi_on', ('svc', 'wifi')),
           ('mobile_data', ('svc', 'data')))


def capture_radio_state(adb):
    """Read the guest airplane/wifi/mobile-data settings before any change."""
    return {key: adb('shell', 'settings', 'get', 'global', key).strip() for key, _ in _RADIOS}


def restore_radio_state(adb, state):
    """Restore each radio to its captured value, re-read, and verify equality."""
    for key, command in _RADIOS:
        adb('shell', *command, 'enable' if state[key] == '1' else 'disable')
    observed = capture_radio_state(adb)
    if observed != dict(state):
        raise RuntimeError('radio state was not restored: expected %r observed %r' % (dict(state), observed))
    return observed
