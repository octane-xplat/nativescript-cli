#!/usr/bin/env python3
"""Build a fresh probe, then reuse only the prescribed existing simulator."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import uuid

GUEST = '91D40099-A056-497D-A572-ADDDFD6A8F23'


def main(argv=None, repo=None, execute=subprocess.run):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('app', type=Path)
    parser.add_argument('new_evidence_prefix', type=Path)
    args = parser.parse_args(argv)
    root = repo or Path(__file__).resolve().parents[3]
    app, prefix = args.app.resolve(), args.new_evidence_prefix.resolve()
    ownership_file = Path(str(prefix) + '.build-ownership.json')
    if not (app / 'runtime-probe.json').is_file() or list(prefix.parent.glob(prefix.name + '.*')) or ownership_file.exists():
        raise RuntimeError('Requires staged probe and unused evidence prefix')
    tools = root / '.cache' / ('preset-runtime-tools-' + uuid.uuid4().hex)
    tools.mkdir(parents=True)
    record = {'app': str(app), 'guest': GUEST, 'guestOwnership': 'existing; never created, cloned or deleted',
              'resources': [], 'scope': 'Fresh build lease and delegated existing-guest proof; device evidence is separate'}
    reservation = None

    def command(argv, **kwargs):
        return execute([str(value) for value in argv], check=True, text=True, **kwargs)

    try:
        for package, binary in [('consumer', 'build'), ('runtime-consumer', 'runtime')]:
            command(['go', 'build', '-o', tools / binary, './tools/qualification/vite-config/' + package], cwd=root)
        result = command(['goddard-agent', 'resource', 'acquire', '--json', json.dumps({
            'resources': {'native_builds': 1}, 'purpose': 'fresh pinned preset iOS probe compilation', 'wait_seconds': 0}), '--output', 'json'], capture_output=True)
        reservation = json.loads(result.stdout)['id']
        record['resources'].append({'action': 'acquire', 'id': reservation})
        with Path(str(prefix) + '.build.log').open('x') as log:
            command([tools / 'build', app, str(prefix) + '.build', 'debug', 'pinned'], stdout=log, stderr=subprocess.STDOUT)
        record['buildPassed'] = True
    finally:
        try:
            if reservation:
                command(['goddard-agent', 'resource', 'release', reservation, '--output', 'json'], capture_output=True)
                record['resources'].append({'action': 'release', 'id': reservation})
        finally:
            record['buildLeaseRetired'] = bool(reservation and record['resources'][-1]['action'] == 'release')
            with ownership_file.open('x') as saved:
                saved.write(json.dumps(record, indent=2) + '\n')
    # Separate prefix prevents existing build evidence from being mistaken for a
    # reused runtime result. The retained runner owns exact-guest checks/cleanup.
    command([sys.executable, root / 'tools/qualification/vite-config/qualify-retained-runtime.py',
             app, str(prefix) + '.build.json', tools / 'runtime', GUEST, str(prefix) + '.guest'])
    print('PASS fresh native probe; existing simulator preserved; build/device evidence separate')


if __name__ == '__main__':
    main()
