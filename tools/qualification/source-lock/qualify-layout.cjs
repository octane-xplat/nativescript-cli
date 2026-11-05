#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),{spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const {lookup,expectedPackage}=require('./audit.cjs');

// This private, scripts-disabled fixture checks Bun's actual nested/scoped and
// npm-alias layout. It makes no claim about original app or native acceptance.
if(process.argv.length!==4)throw new Error('usage: qualify-layout NEW_CACHE_DIR INSTALLED_TYPESCRIPT_DIR');
const directory=path.resolve(process.argv[2]),ts=require(path.resolve(process.argv[3]));
fs.mkdirSync(directory);fs.mkdirSync(path.join(directory,'packages','motion'),{recursive:true});
const manifest={name:'source-lock-layout-probe',version:'1.0.0',private:true,workspaces:['packages/*'],dependencies:{
 '@fixture/motion':'workspace:*','@nativescript-community/gesturehandler':'2.1.0',
 'gesture-alias':'npm:@nativescript-community/gesturehandler@2.1.0',
}};
fs.writeFileSync(path.join(directory,'package.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(directory,'packages','motion','package.json'),JSON.stringify({name:'@fixture/motion',version:'1.0.0',dependencies:{'@nativescript-community/gesturehandler':'2.0.45'}},null,2)+'\n');
const install=spawnSync('bun',['install','--offline','--ignore-scripts'],{cwd:directory,encoding:'utf8'});
fs.writeFileSync(path.join(directory,'install.log'),(install.stdout??'')+(install.stderr??''),{flag:'wx',mode:0o600});
if(install.error)throw install.error;
if(install.status!==0)throw new Error('Offline Bun install failed; inspect '+path.join(directory,'install.log'));
const parsed=ts.parseConfigFileTextToJson('bun.lock',fs.readFileSync(path.join(directory,'bun.lock'),'utf8'));
assert.equal(parsed.error,undefined);const lock=parsed.config;
function installed(from,name){
 for(const folder of Module._nodeModulePaths(fs.realpathSync(from))){
  const file=path.join(folder,name,'package.json');
  if(fs.existsSync(file))return {directory:fs.realpathSync(path.dirname(file)),...JSON.parse(fs.readFileSync(file,'utf8'))};
 }
 throw new Error('Missing installed lookup '+name+' from '+from);
}
const checks=[];
for(const [parent,from,name,want] of [
 ['',directory,'@nativescript-community/gesturehandler','2.1.0'],
 ['@fixture/motion',path.join(directory,'packages','motion'),'@nativescript-community/gesturehandler','2.0.45'],
 ['',directory,'gesture-alias','2.1.0'],
]){
 const locator=lookup(lock.packages,parent,name),expected=expectedPackage(lock,locator,()=>undefined),actual=installed(from,name);
 assert.equal(expected.version,want);assert.equal(actual.version,want);assert.equal(actual.name,expected.name);
 checks.push({parent,lookupName:name,locator,name:actual.name,version:actual.version,directory:actual.directory});
}
assert.notEqual(checks[0].directory,checks[1].directory);
const result={scope:'real offline Bun scoped/nested/alias lookup only; no original graph, artifact-integrity or native acceptance',bunVersion:spawnSync('bun',['--version'],{encoding:'utf8'}).stdout.trim(),checks};
fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify(result));
