#!/usr/bin/env python3
"""Stage a fresh, independently installed canonical native-guard fixture offline."""
import argparse, json, pathlib, re, shutil, subprocess, uuid
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('platform', choices=['ios', 'android'])
p.add_argument('updates', type=pathlib.Path)
p.add_argument('fingerprint', type=pathlib.Path)
p.add_argument('output', type=pathlib.Path)
p.add_argument('--sdk', action='store_true', help='use public SDK/core 9.1.3 baseline instead of the private guard state fixture')
p.add_argument('--sdk-installer', metavar='ORIGIN', help='iOS public createUpdates installer entry pinned to ORIGIN (implies the SDK core 9.1.3 dependency)')
a = p.parse_args()
dest = a.output.resolve()
if dest.exists():
    raise RuntimeError('output must be new; never reuse generated native trees')
source = pathlib.Path(__file__).resolve().parent / a.platform / 'app'
shutil.copytree(source, dest)
manifest = {'name': 'p91-' + a.platform + '-guard', 'version': '1.0.0', 'private': True, 'main': 'app/app.js', 'dependencies': {'@octane-xplat/updates': 'file:' + str(a.updates.resolve()), '@octane-xplat/fingerprint': 'file:' + str(a.fingerprint.resolve()), 'p91-native-' + ('health' if a.platform == 'ios' else 'android-health'): 'file:./native-plugin'}, 'devDependencies': {'@nativescript/' + a.platform: '9.1.0' if a.platform == 'ios' else '9.1.1', '@nativescript/vite': '8.0.21', 'vite': '8.3.0', 'typescript': '5.9.3'}}
if a.sdk_installer:
    if a.platform != 'ios':
        raise RuntimeError('--sdk-installer is iOS only')
    if not re.fullmatch(r'https://[a-z0-9.-]+:[0-9]+', a.sdk_installer):
        raise RuntimeError('installer origin must be an https://host:port URL')
    manifest['dependencies']['@nativescript/core']='9.1.3'
    entry=(pathlib.Path(__file__).resolve().parent/'sdk'/'ios-installer.js').read_text()
    if '__P91_OTA_ORIGIN__' not in entry:
        raise RuntimeError('installer entry placeholder missing')
    (dest/'app/app.js').write_text(entry.replace('__P91_OTA_ORIGIN__',a.sdk_installer))
elif a.sdk:
    manifest['dependencies']['@nativescript/core']='9.1.3'
    shutil.copy2(pathlib.Path(__file__).resolve().parent/'sdk'/(a.platform+'.js'),dest/'app/app.js')
(dest / 'package.json').write_text(json.dumps(manifest, indent=2) + '\n')
if a.platform == 'android':
    nonce = str(uuid.uuid4())
    f = dest / 'app/app.js'
    f.write_text(f.read_text().replace('P91_ANDROID_NONCE', nonce))
    (dest / 'nonce').write_text(nonce)
subprocess.run(['bun', 'install', '--offline', '--ignore-scripts'], cwd=dest, check=True)
for f in (dest / 'node_modules').rglob('package.json'):
    try:
        name = json.loads(f.read_text()).get('name')
    except (OSError, ValueError):
        continue
    if name in ['nativescript', '@nativescript/cli']:
        raise RuntimeError('upstream CLI installed')
print('PASS fresh installed canonical fixture:', dest)
