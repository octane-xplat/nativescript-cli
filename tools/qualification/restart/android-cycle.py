#!/usr/bin/env python3
"""Qualify the full isolated xplat CLI against the caller's existing Android AVD.

Run under native_builds:1 plus android:elegant-fir-probe and resident_devices:1.
Builds and the retained device overlap during the active edit cycle.
"""
import argparse
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import uuid

from cli_output import Output

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'android'))
import existing_avd

APP = 'org.example.xplatgointegration'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--consumer', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--mode', choices=['restart', 'hmr'], default='restart')
    parser.add_argument('--port', type=int, default=5586)
    parser.add_argument('--startup-timeout', type=int, default=600)
    args = parser.parse_args()
    if not (5554 <= args.port <= 5680 and args.port % 2 == 0):
        parser.error('port must be an even Android console port between5554 and5680')
    if not 1 <= args.startup_timeout <= 900:
        parser.error('startup-timeout must be between1 and900 seconds')
    root = args.consumer.resolve()
    if not (root / '.git').is_file():
        raise RuntimeError('consumer must be an isolated Git worktree')
    app = root / 'apps/mobile'
    binary = root / 'research/go-cli/xplat-go-darwin-arm64-cli'
    source = app / 'src/index.ts'
    native = app / 'App_Resources/Android/app.gradle'
    if subprocess.check_output(['git', 'diff', 'HEAD', '--', str(source), str(native)], cwd=root):
        raise RuntimeError('probe source inputs must have no pre-existing edits')
    original = {p: p.read_bytes() for p in (source, native)}
    expected = dict(original)
    sdk = Path(os.environ['ANDROID_HOME'])
    avd_home = existing_avd.existing_avd_home(Path.home(), sdk)
    existing_avd.ensure_no_android_emulator(sdk)
    for port in (args.port, args.port + 1):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', port))
    args.report.mkdir(parents=True, exist_ok=False)
    (args.report / 'initial-build.json').write_bytes(Path(str(binary) + '.json').read_bytes())
    serial = 'emulator-' + str(args.port)
    nonce = 'CLI_NATIVE_' + uuid.uuid4().hex
    first, edited = nonce + '_INITIAL', nonce + '_EDITED'
    output = Output(APP, serial, (first, edited), target='android')
    counts, samples = output.counts, output.samples
    proofs = []
    child = emulator = None
    installation_owned = False
    started = time.monotonic()

    def adb(*argv):
        return subprocess.check_output([str(sdk / 'platform-tools/adb'), '-s', serial, *argv],
                                       text=True, timeout=30)

    def app_pid():
        result = subprocess.run([str(sdk / 'platform-tools/adb'), '-s', serial, 'shell',
                                 'pidof', '-s', APP], capture_output=True, text=True, timeout=30)
        if result.returncode == 1 and not result.stdout.strip():
            return None
        if result.returncode != 0 or not result.stdout.strip().isdigit():
            raise RuntimeError('could not establish exact app PID')
        return int(result.stdout.strip())

    def edit(path, data):
        if path.read_bytes() != expected[path]:
            raise RuntimeError('probe input changed concurrently: ' + str(path))
        path.write_bytes(data)
        expected[path] = data

    def proof(phase, pid):
        proofs.append(dict(phase=phase, pid=pid, packagePaths=adb('shell', 'pm', 'path', APP).splitlines(),
                           elapsedSeconds=round(time.monotonic() - started, 3), **counts))
        (args.report / 'progress.json').write_text(json.dumps(proofs, indent=2))

    def interrupt(_signal, _frame):
        raise KeyboardInterrupt('CLI cycle interrupted')

    signal.signal(signal.SIGTERM, interrupt)
    with (args.report / 'emulator.log').open('wb') as emulator_log, \
            (args.report / 'cli.log').open('wb') as log, \
            (args.report / 'cli.log').open('r', errors='replace') as reader:
        def until(check, label, timeout=900):
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                output.append(reader.read())
                if emulator.poll() is not None:
                    raise RuntimeError('owned emulator exited during ' + label)
                if child is not None and child.poll() is not None:
                    raise RuntimeError('CLI exited during ' + label + ': ' + str(child.returncode))
                if check():
                    return
                time.sleep(.25)
            raise RuntimeError('timeout during ' + label)

        def heartbeat(marker, pid, timeout=90):
            until(lambda: samples[(marker, pid)] >= 3, 'runtime heartbeat', timeout)
            if app_pid() != pid:
                raise RuntimeError('app changed process during heartbeat proof')

        try:
            emulator = subprocess.Popen([str(sdk / 'emulator/emulator'), '-avd', existing_avd.AVD,
                                         '-port', str(args.port), '-no-window', '-no-audio',
                                         '-no-snapshot', '-no-boot-anim'], stdout=emulator_log,
                                        stderr=emulator_log, env=existing_avd.emulator_env(avd_home))

            def booted():
                result = subprocess.run([str(sdk / 'platform-tools/adb'), '-s', serial, 'shell',
                                         'getprop', 'sys.boot_completed'], capture_output=True,
                                        text=True, timeout=10)
                return result.returncode == 0 and result.stdout.strip() == '1'

            until(booted, 'existing AVD boot', 180)
            if adb('emu', 'avd', 'name').splitlines()[0] != existing_avd.AVD:
                raise RuntimeError('serial belongs to another AVD')
            if existing_avd.package_present(adb('shell', 'pm', 'list', 'packages', APP), APP):
                raise RuntimeError('refusing existing probe installation')
            installation_owned = True
            edit(source, original[source] + ("\nconsole.log('" + first + "');setInterval(()=>console.log('" + first + "'),1000);\n").encode())
            env = dict(os.environ, XPLAT_VLIST_APP_ID=APP, XPLAT_NATIVE_ENGINE='go')
            argv = [str(binary), 'dev', 'android', '--device', serial,
                    '--project', str(root), '--app', 'apps/mobile']
            if args.mode == 'restart':
                argv.append('--no-hmr')
            child = subprocess.Popen(argv, cwd=app, env=env, stdout=log, stderr=subprocess.STDOUT)
            until(lambda: counts['launches'] == 1, 'initial launch')
            initial_pid = app_pid()
            if initial_pid is None:
                raise RuntimeError('initial app process missing')
            heartbeat(first, initial_pid, args.startup_timeout)
            if counts['compiles'] != 1:
                raise RuntimeError('expected one initial compilation')
            proof('initial', initial_pid)
            edit(source, original[source] + ("\nconsole.log('" + edited + "');setInterval(()=>console.log('" + edited + "'),1000);\n").encode())
            js_launches = 2 if args.mode == 'restart' else 1
            until(lambda: counts['launches'] == js_launches, 'source edit')
            if args.mode == 'restart':
                until(lambda: app_pid() not in (None, initial_pid), 'source relaunch')
            js_pid = app_pid()
            heartbeat(edited, js_pid)
            if counts['compiles'] != 1 or (args.mode == 'hmr' and js_pid != initial_pid):
                raise RuntimeError('JS-only edit rebuilt native code or restarted HMR app')
            proof('source-edit', js_pid)
            edit(native, original[native] + b'\nandroid { defaultConfig { resValue "string", "cli_native_cycle", "1" } }\n')
            until(lambda: counts['launches'] == js_launches + 1, 'native edit')
            native_pid = app_pid()
            if native_pid in (None, js_pid) or counts['compiles'] != 2:
                raise RuntimeError('native edit did not compile and launch a fresh process')
            heartbeat(edited, native_pid, args.startup_timeout)
            proof('native-edit', native_pid)
        finally:
            try:
                if child is not None:
                    if child.poll() is None:
                        child.send_signal(signal.SIGTERM)
                    try:
                        child.wait(timeout=90)
                    except subprocess.TimeoutExpired:
                        child.kill()
                        child.wait(timeout=30)
                        raise RuntimeError('CLI cleanup deadline exceeded')
                    if child.returncode not in (0, 143):
                        raise RuntimeError('CLI cleanup returned ' + str(child.returncode))
                    if app_pid() is not None:
                        raise RuntimeError('owned app survived CLI cleanup')
            finally:
                try:
                    errors = []
                    for path, data in original.items():
                        try:
                            edit(path, data)
                        except Exception as error:
                            errors.append(error)
                    if installation_owned:
                        existing_avd.retire_owned_package(adb, APP)
                    if errors:
                        raise ExceptionGroup('probe source restoration failed', errors)
                finally:
                    if emulator is not None:
                        if emulator.poll() is None:
                            emulator.terminate()
                        try:
                            emulator.wait(timeout=30)
                        except subprocess.TimeoutExpired:
                            emulator.kill()
                            emulator.wait(timeout=30)
    result = dict(mode=args.mode, nonce=nonce, avd=existing_avd.AVD, device=serial,
                  phases=proofs, cleanup='passed')
    (args.report / 'result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == '__main__':
    main()
