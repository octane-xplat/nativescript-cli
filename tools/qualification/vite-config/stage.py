#!/usr/bin/env python3
"""Stage a fresh locked app for selected-config native Build qualification."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path, help='new task-owned project cache app')
args = parser.parse_args()
destination = args.output.resolve()
source = Path(__file__).resolve().parents[1] / 'development/app'
shutil.copytree(source, destination)
(destination / 'app/app.ts').write_text("console.log('G4 selected project config', __PROJECT_CONFIG_VALUE__);\n")
(destination / 'app/value.ts').unlink()
(destination / 'nativescript.config.ts').write_text("export default {id:'org.example.viteconfiguration',appPath:'app',appResourcesPath:'App_Resources',cli:{packageManager:'bun'},bundler:'vite',bundlerConfigPath:'vite.config.mts'};\n")
(destination / 'vite.config.mts').write_text("""import {typescriptConfig} from '@nativescript/vite/typescript';
export default async ({mode,command})=>{
 const config=typescriptConfig({mode},{typeCheck:false});
 const value='PROJECT_VITE_NATIVE_20261105';
 return {...config,define:{...config.define,__PROJECT_CONFIG_VALUE__:JSON.stringify(value)},
 plugins:[...config.plugins,{name:'project-config-native-proof',generateBundle(){
 this.emitFile({type:'asset',fileName:'project-config.json',source:JSON.stringify({mode,command,value,bundlerEnv:JSON.parse(process.env.NATIVESCRIPT_BUNDLER_ENV),debug:process.env.DEBUG??null})});
 }}]};
};
""")
subprocess.run(['bun', 'install', '--offline', '--frozen-lockfile', '--ignore-scripts'], cwd=destination, check=True)
for manifest in (destination / 'node_modules').rglob('package.json'):
    try:
        name = json.loads(manifest.read_text()).get('name')
    except (OSError, ValueError):
        continue
    if name in ('nativescript', '@nativescript/cli'):
        raise RuntimeError('upstream CLI installed')
if (destination / 'state').exists() or (destination / 'platforms').exists():
    raise RuntimeError('native tree exists before qualification')
print('Staged fresh selected-config app:', destination)
