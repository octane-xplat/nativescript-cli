#!/usr/bin/env python3
"""Qualify the actual isolated xplat CLI on the full mobile app, without images.

Run under native_builds:1 plus the prescribed iOS device reservation: native
compilation and the retained simulator overlap during this active edit cycle.
"""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import time
import uuid

from cli_output import Output

UDID = '91D40099-A056-497D-A572-ADDDFD6A8F23'
APP = 'org.example.xplatgointegration'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--consumer', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--mode', choices=['restart', 'hmr'], default='restart')
    parser.add_argument('--startup-timeout', type=int, default=90,
                        help='cold app entry heartbeat deadline; source-edit HMR remains bounded at90s')
    args = parser.parse_args()
    if not 1 <= args.startup_timeout <= 900:
        parser.error('startup-timeout must be between1 and900 seconds')
    if os.environ.get('XPLAT_DOCS_DEMOS'):
        raise RuntimeError('XPLAT_DOCS_DEMOS overrides the probe application identity; unset it before qualification')
    root = args.consumer.resolve()
    if not (root / '.git').is_file():
        raise RuntimeError('consumer must be an isolated Git worktree')
    app = root / 'apps/mobile'
    binary = root / 'research/go-cli/xplat-go-darwin-arm64-cli'
    source = app / 'src/index.ts'
    native = app / 'App_Resources/iOS/build.xcconfig'
    if subprocess.check_output(['git', 'diff', 'HEAD', '--', str(source), str(native)], cwd=root):
        raise RuntimeError('probe source inputs must have no pre-existing edits')
    args.report.mkdir(parents=True, exist_ok=False)
    original = {p: p.read_bytes() for p in (source, native)}
    expected = dict(original)
    nonce = 'CLI_NATIVE_' + uuid.uuid4().hex
    first, edited = nonce + '_INITIAL', nonce + '_EDITED'
    booted = installation_owned = False
    child = None
    output = Output(APP, UDID, (first, edited))
    counts, samples = output.counts, output.samples
    proofs = []
    started = time.monotonic()
    (args.report / 'initial-build.json').write_bytes(Path(str(binary) + '.json').read_bytes())

    def proof(phase, pid):
        container = simctl('get_app_container', UDID, APP, 'app').decode().strip()
        proofs.append(dict(phase=phase, pid=pid, container=container,
                           elapsedSeconds=round(time.monotonic() - started, 3), **counts))
        (args.report / 'progress.json').write_text(json.dumps(proofs, indent=2))

    def simctl(*argv):
        return subprocess.check_output(['xcrun', 'simctl', *argv], timeout=45)

    def applications():
        # simctl emits the OpenStep plist form, not XML or a binary plist.
        data = subprocess.check_output(['/usr/bin/plutil', '-convert', 'json', '-o', '-', '--', '-'],
                                       input=simctl('listapps', UDID), timeout=15)
        return json.loads(data)

    def app_pid():
        pids = {int(parts[0]) for line in simctl('spawn', UDID, 'launchctl', 'list').decode().splitlines()
                if len(parts := line.split()) >= 3 and APP in parts[2] and parts[0].isdigit()}
        if len(pids) > 1:
            raise RuntimeError('ambiguous probe process')
        return next(iter(pids), None)

    def edit(path, data):
        if path.read_bytes() != expected[path]:
            raise RuntimeError('probe input changed concurrently: ' + str(path))
        path.write_bytes(data)
        expected[path] = data

    def interrupt(_signal, _frame):
        raise KeyboardInterrupt('CLI cycle interrupted')

    signal.signal(signal.SIGTERM, interrupt)
    with (args.report / 'cli.log').open('wb') as log, (args.report / 'cli.log').open('r', errors='replace') as reader:
        def observe():
            output.append(reader.read())

        def until(check, label, timeout=1200):
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                observe()
                if child.poll() is not None:
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
            state = json.loads(simctl('list', 'devices', 'available', '--json'))
            device = next((d for group in state['devices'].values() for d in group if d['udid'] == UDID), None)
            if device is None or device['state'] != 'Shutdown':
                raise RuntimeError('prescribed simulator must be available and shut down')
            simctl('boot', UDID)
            booted = True
            simctl('bootstatus', UDID, '-b')
            if APP in applications():
                raise RuntimeError('refusing existing probe installation')
            installation_owned = True
            edit(source, original[source] + ("\nconsole.log('" + first + "');setInterval(()=>console.log('" + first + "'),1000);\n").encode())
            env = dict(os.environ, XPLAT_VLIST_APP_ID=APP, XPLAT_NATIVE_ENGINE='go')
            # This app contains a second navigation-proof app. Select the
            # full consumer explicitly rather than depending on saved prefs.
            argv = [str(binary), 'dev', 'ios', '--device', UDID,
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
            edit(native, original[native] + b'\nGCC_PREPROCESSOR_DEFINITIONS = $(inherited) CLI_NATIVE_CYCLE=1\n')
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
                    if booted and app_pid() is not None:
                        raise RuntimeError('owned app survived CLI cleanup')
            finally:
                try:
                    restore_errors = []
                    for path, data in original.items():
                        try:
                            edit(path, data)
                        except Exception as error:
                            restore_errors.append(error)
                    if installation_owned and APP in applications():
                        simctl('uninstall', UDID, APP)
                        if APP in applications():
                            raise RuntimeError('owned probe installation survived uninstall')
                    if restore_errors:
                        raise ExceptionGroup('probe source restoration failed', restore_errors)
                finally:
                    if booted:
                        simctl('shutdown', UDID)
    result = dict(mode=args.mode, nonce=nonce, device=UDID, phases=proofs, cleanup='passed')
    (args.report / 'result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == '__main__':
    main()
