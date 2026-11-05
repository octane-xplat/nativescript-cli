#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {lookup,expectedPackage,declarations}=require('./audit.cjs');
const reference='b58567933b22fc6ff076f366fba61926a090f8e4';
const lockSHA256='d68b86c043e8f10732e42e96fc520ddae665c797af184624dc1ce5e979e57253';
const compilerInputs=['@nativescript/android','@nativescript/ios','@nativescript/vite','@nativescript/types','@nativescript-community/vite-octane','@octane-xplat/bamboo','@octane-xplat/cli','@octane-xplat/jsx','@octanejs/vite-plugin','@tsrx/typescript-plugin','@tsrx/content-mapper','typescript','typescript-classic','vite'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const writeNew=(file,data)=>fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
function inside(root,file){const relative=path.relative(root,file);return relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
function projection(lock,workspace,selected=compilerInputs){
 const app=workspace('apps/mobile'),queue=[app.name],folders=new Set(),seen=new Set();
 if(!lock.packages[app.name])throw new Error('App workspace lock record missing');
 for(const name of selected){
  if(!app.devDependencies?.[name])throw new Error('Missing selected compiler/runtime declaration '+name);
  const locator=lookup(lock.packages,app.name,name);if(!locator)throw new Error('Missing selected lock identity '+name);queue.push(locator);
 }
 while(queue.length){
  const locator=queue.shift();if(seen.has(locator))continue;seen.add(locator);
  const pkg=expectedPackage(lock,locator,workspace);if(!pkg)throw new Error('Unsupported locked identity '+locator);
  if(pkg.workspace)folders.add(pkg.workspace);
  const {deps,optional}=declarations(pkg.metadata,false);
  for(const name of Object.keys(deps).sort()){
   const next=lookup(lock.packages,locator,name);
   if(next)queue.push(next);else if(!optional.has(name))throw new Error('Missing required lock edge '+locator+' -> '+name);
  }
 }
 return {selectedDevInputs:selected,folders:[...folders].sort(),locators:seen.size};
}
function sourceRecords(source){
 source=fs.realpathSync(source);
 const records=[];
 function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  if(['node_modules','.git','.cache'].includes(entry.name))continue;
  const file=path.join(folder,entry.name),relative=path.relative(source,file);
  if(entry.isDirectory())walk(file);
  else if(entry.isFile())records.push({path:relative,kind:'file',sha256:hash(fs.readFileSync(file))});
  else if(entry.isSymbolicLink()){
   const target=fs.readlinkSync(file);
   if(path.isAbsolute(target)||!inside(source,fs.realpathSync(file)))throw new Error('Source symlink must stay within snapshot '+relative);
   records.push({path:relative,kind:'symlink',target});
  }else throw new Error('Unsupported source entry '+relative);
 }}
 walk(source);return records;
}
function installed(from,name){
 for(const base of Module._nodeModulePaths(fs.realpathSync(from))){
  const file=path.join(base,name,'package.json');if(fs.existsSync(file))return {directory:fs.realpathSync(path.dirname(file)),manifest:json(file)};
 }
 return undefined;
}
function main(){
 if(process.argv.length!==5)throw new Error('usage: stage-frozen ORIGINAL_SOURCE INSTALLED_TYPESCRIPT_DIR NEW_PROJECT_CACHE_DIR');
 const source=fs.realpathSync(process.argv[2]),ts=require(path.resolve(process.argv[3])),target=path.resolve(process.argv[4]);
 const cache=fs.realpathSync(path.join(__dirname,'../../../.cache'));
 const parent=fs.realpathSync(path.dirname(target));
 if(!inside(cache,target)||(parent!==cache&&!inside(cache,parent)))throw new Error('Use a new child of this repository project cache');
 if(source===target||inside(source,target)||inside(target,source))throw new Error('Source and destination trees must be separate');
 try{fs.lstatSync(target);throw new Error('Destination already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
 const originalLock=fs.readFileSync(path.join(source,'bun.lock'));
 if(hash(originalLock)!==lockSHA256)throw new Error('Expected original '+reference+' Bun lock bytes');
 const parsed=ts.parseConfigFileTextToJson('bun.lock',originalLock.toString('utf8'));
 if(parsed.error||!parsed.config?.packages)throw new Error('Installed JSONC parser did not read original lock');
 const lock=parsed.config,workspace=folder=>{
  const directory=path.resolve(source,folder);
  if(directory!==source&&!inside(source,directory))throw new Error('Workspace escapes source');
  return json(path.join(directory,'package.json'));
 };
 const root=workspace(''),app=workspace('apps/mobile');
 if(root.name!=='@xplat/workspace'||app.name!=='@xplat/mobile'||app.devDependencies?.nativescript!=='9.1.1')throw new Error('Original workspace manifests differ');
 const selection=projection(lock,workspace),records=sourceRecords(source);
 const excluded={name:'nativescript',version:app.devDependencies.nativescript,reason:'upstream executable excluded from rewrite qualification'};
 delete app.devDependencies.nativescript;delete lock.workspaces['apps/mobile'].devDependencies.nativescript;
 const originalRootLockName=lock.workspaces[''].name;lock.workspaces[''].name=root.name;
 fs.mkdirSync(target,{mode:0o700});
 fs.cpSync(source,target,{recursive:true,verbatimSymlinks:true,mode:fs.constants.COPYFILE_FICLONE,filter:file=>!['node_modules','.git','.cache'].includes(path.basename(file))});
 fs.writeFileSync(path.join(target,'apps/mobile/package.json'),JSON.stringify(app,null,2)+'\n');
 const projectedLock=Buffer.from(JSON.stringify(lock,null,2)+'\n');fs.writeFileSync(path.join(target,'bun.lock'),projectedLock);
 writeNew(path.join(target,'stage-inputs.json'),{scope:'private frozen source fixture, not original install/layout or native acceptance',reference,originalLockSHA256:lockSHA256,projectedLockSHA256:hash(projectedLock),excluded,originalRootLockName,projectedRootLockName:root.name,...selection});
 const filters=selection.folders.flatMap(folder=>['--filter',lock.workspaces[folder].name]);
 const command=['install',...filters,'--linker=isolated','--frozen-lockfile','--offline','--ignore-scripts','--no-env-file','--backend='+(process.platform==='darwin'?'clonefile':'copyfile')];
 const fd=fs.openSync(path.join(target,'install.log'),'wx',0o600);
 let result;try{result=spawnSync('bun',command,{cwd:target,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}
 const lockUnchanged=projectedLock.equals(fs.readFileSync(path.join(target,'bun.lock')));
 writeNew(path.join(target,'install-result.json'),{command:['bun',...command],exitCode:result.status,signal:result.signal,error:result.error?.message,lockUnchanged});
 if(result.error)throw result.error;
 if(result.status!==0||!lockUnchanged)throw new Error('Frozen install failed; retained install.log/install-result.json');
 const appDir=path.join(target,'apps/mobile');
 if(installed(appDir,'nativescript')||fs.readdirSync(path.join(target,'node_modules/.bun')).some(name=>name.startsWith('nativescript@')))throw new Error('Upstream CLI unexpectedly installed');
 const audio=installed(path.join(target,'packages/sounds'),'@nativescript/audio-context'),audioLocator=lookup(lock.packages,'@octane-xplat/sounds','@nativescript/audio-context'),expectedAudio=expectedPackage(lock,audioLocator,workspace);
 if(!audio||audio.manifest.name!==expectedAudio?.name||audio.manifest.version!==expectedAudio.version||!inside(target,audio.directory))throw new Error('Unexpected audio-context producer lookup');
 const placement=path.join(appDir,'node_modules/@nativescript/audio-context');let created=false;
 try{fs.lstatSync(placement);if(fs.realpathSync(placement)!==audio.directory)throw new Error('Producer placement conflicts with installed input');}
 catch(error){if(error.code!=='ENOENT')throw error;fs.symlinkSync(path.relative(path.dirname(placement),audio.directory),placement,'dir');created=true;}
 if(!fs.statSync(path.join(placement,'platforms/ios/NativeScriptV8/Package.swift')).isFile())throw new Error('Producer local SPM manifest missing');
 const changed=[];
 for(const record of records){
  const file=path.join(target,record.path);
  if(record.kind==='symlink'){
   if(!fs.lstatSync(file).isSymbolicLink()||fs.readlinkSync(file)!==record.target||!inside(target,fs.realpathSync(file)))throw new Error('Staged symlink identity differs '+record.path);
  }else if(hash(fs.readFileSync(file))!==record.sha256)changed.push(record.path);
 }
 if(JSON.stringify(changed.sort())!==JSON.stringify(['apps/mobile/package.json','bun.lock']))throw new Error('Unexpected source byte changes '+JSON.stringify(changed));
 if(JSON.stringify(sourceRecords(source))!==JSON.stringify(records))throw new Error('Original source changed during staging');
 const proof={scope:'source bytes, link text, frozen projected lock and input placement; no full edge/compiler/integrity/patch/bundle/native acceptance',reference,...selection,originalLockSHA256:lockSHA256,projectedLockSHA256:hash(projectedLock),unchangedPackageLockRecords:Object.keys(lock.packages).length,sourceFilesCompared:records.filter(r=>r.kind==='file').length,relativeSymlinksPreserved:records.filter(r=>r.kind==='symlink').length,changed,upstreamCLIAbsent:true,producerPlacement:{lookupFrom:'packages/sounds',lookupName:audio.manifest.name,version:audio.manifest.version,directory:audio.directory,path:placement,created},records};
 writeNew(path.join(target,'stage-proof.json'),proof);
 console.log(JSON.stringify({scope:proof.scope,directory:target,sourceFilesCompared:proof.sourceFilesCompared,relativeSymlinksPreserved:proof.relativeSymlinksPreserved,unchangedPackageLockRecords:proof.unchangedPackageLockRecords,workspaceFilters:selection.folders.length,lockUnchanged}));
}
module.exports={projection,sourceRecords,inside};
if(require.main===module)main();
