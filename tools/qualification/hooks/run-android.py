#!/usr/bin/env python3
"""Run the hook probe under an externally held prescribed-AVD reservation."""
import argparse
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'android'))
import existing_avd


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--consumer', type=Path, required=True)
    parser.add_argument('--project', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--nonce', required=True)
    args = parser.parse_args()
    sdk = Path(os.environ['ANDROID_HOME'])
    avd_home = existing_avd.existing_avd_home(Path.home(), sdk)
    existing_avd.ensure_no_android_emulator(sdk)
    port = 5554
    serial = 'emulator-5554'
    package = 'org.example.registeredhooks'
    for occupied in (port, port + 1):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', occupied))

    def adb(*argv):
        return subprocess.check_output([str(sdk / 'platform-tools/adb'), '-s', serial, *argv],
                                       text=True, timeout=30)

    def interrupted(_signal, _frame):
        raise KeyboardInterrupt('hook probe interrupted')

    signal.signal(signal.SIGTERM, interrupted)
    installation_owned = False
    with (args.project / 'emulator.log').open('w') as log:
        emulator = subprocess.Popen([str(sdk / 'emulator/emulator'), '-avd', existing_avd.AVD,
                                     '-port', str(port), '-no-window', '-no-audio',
                                     '-no-snapshot', '-no-boot-anim'], stdout=log, stderr=log,
                                    env=existing_avd.emulator_env(avd_home))
        try:
            deadline = time.monotonic() + 180
            while time.monotonic() < deadline:
                if emulator.poll() is not None:
                    raise RuntimeError('owned emulator exited before boot')
                boot = subprocess.run([str(sdk / 'platform-tools/adb'), '-s', serial,
                                       'shell', 'getprop', 'sys.boot_completed'],
                                      capture_output=True, text=True, timeout=10)
                if boot.returncode == 0 and boot.stdout.strip() == '1':
                    break
                time.sleep(1)
            else:
                raise RuntimeError('owned emulator boot timed out')
            if adb('emu', 'avd', 'name').splitlines()[0] != existing_avd.AVD:
                raise RuntimeError('serial belongs to another AVD')
            if existing_avd.package_present(adb('shell', 'pm', 'list', 'packages', package), package):
                raise RuntimeError('refusing an existing hook probe installation')
            installation_owned = True
            subprocess.run([str(args.consumer.resolve()), '--phase', 'run', '--project',
                            str(args.project.resolve()), '--output', str(args.output.resolve()),
                            '--platform', 'android', '--device', serial, '--nonce', args.nonce],
                           check=True, timeout=180)
        finally:
            try:
                if installation_owned:
                    existing_avd.retire_owned_package(adb, package)
            finally:
                if emulator.poll() is None:
                    emulator.terminate()
                try:
                    emulator.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    emulator.kill()
                    emulator.wait(timeout=30)
    print('HOOK_ANDROID_CLEANUP_PASS avd=' + existing_avd.AVD)


if __name__ == '__main__':
    main()
