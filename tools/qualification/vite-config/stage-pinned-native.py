#!/usr/bin/env python3
"""Stage a new source-projected iOS Build fixture; no native tools run here."""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path, help='read-only pinned Xplat source snapshot')
parser.add_argument('cli_tarball', type=Path, help='qualified published CLI0.19 tarball')
parser.add_argument('workspace', type=Path, help='new task-owned cache workspace')
args = parser.parse_args()
tools = Path(__file__).resolve().parent
workspace = args.workspace.resolve()
app = workspace / 'apps/mobile'
if workspace.exists():
    raise RuntimeError('workspace must be new')
subprocess.run([sys.executable, str(tools / 'stage-xplat.py'), str(args.cli_tarball.resolve()), str(app)], check=True)
subprocess.run(['bun', 'add', '--dev', '--offline', '--ignore-scripts', '@nativescript/ios@9.1.0', '@octane-xplat/bamboo@0.19.0', '@bamboocss/dev@1.60.1'], cwd=app, check=True)
subprocess.run([sys.executable, str(tools / 'project-pinned.py'), str(args.source.resolve()), str(workspace)], check=True)
resources = app / 'App_Resources/iOS'
resources.mkdir()
for name in ['Info.plist', 'build.xcconfig']:
    shutil.copyfile(tools.parent / 'development/app/App_Resources/iOS' / name, resources / name)
print('Staged pinned native Build fixture:', app)
