#!/usr/bin/env python3
"""Build private canonical OTA tarballs from an explicit local reference Git store.
No fetch, checkout changes, publication, or runtime reference dependency.
"""
import argparse, json, os, pathlib, subprocess, tarfile
REVISION = 'b58567933b22fc6ff076f366fba61926a090f8e4'
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('reference', type=pathlib.Path)
p.add_argument('output', type=pathlib.Path, help='new task-owned staging directory')
a = p.parse_args()
out = a.output.resolve()
out.mkdir(parents=True, exist_ok=False)
env = dict(os.environ, GIT_NO_LAZY_FETCH='1')
packages = ['fingerprint', 'updates', 'platform', 'jsx', 'lib', 'tsrx-typegen']
# A bounded archive avoids lazy-fetching unrelated monorepo assets.
archive = subprocess.check_output(['git', '-C', str(a.reference), 'archive', REVISION,
    'package.json', 'tsconfig.base.json', 'LICENSE'] + ['packages/'+n for n in packages], env=env)
import io
with tarfile.open(fileobj=io.BytesIO(archive)) as t:
    t.extractall(out, filter='data')
root = json.loads((out/'package.json').read_text())
(out/'package.json').write_text(json.dumps({'private':True,'type':'module','workspaces':{
    'packages':['packages/'+n for n in packages], 'catalog':root['workspaces']['catalog']}}))
for name in ['fingerprint','updates']:
    (out/'packages'/name/'LICENSE').write_bytes((out/'LICENSE').read_bytes())
subprocess.run(['bun','install','--ignore-scripts'],cwd=out,check=True)
for name in ['fingerprint','updates']:
    subprocess.run(['bun','pm','pack','--destination',str(out/'packed')],cwd=out/'packages'/name,check=True)
(out/'provenance.json').write_text(json.dumps({'sourceRevision':REVISION,
    'packages':['@octane-xplat/fingerprint@0.19.0','@octane-xplat/updates@0.19.0'],
    'packaging':'official Bun prepack, catalog/workspace resolution, root MIT license copied'},indent=2)+'\n')
