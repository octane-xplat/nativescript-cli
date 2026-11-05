#!/usr/bin/env node
'use strict';
// Probe the pinned canonical collector without Swift/native compilation. A
// coverage gap exits nonzero; successful control hashing is not OTA acceptance.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function main(){
 if(process.argv.length!==5||!process.argv.slice(2).every(path.isAbsolute))throw Error('usage: canonical-coverage ABSOLUTE_INSTALLED_CONSUMER ABSOLUTE_NEW_CACHE ABSOLUTE_NEW_REPORT');
 const [consumer,cache,report]=process.argv.slice(2);
 for(const file of [cache,report]){try{fs.lstatSync(file);throw Error('Cache/report must be new');}catch(error){if(error.code!=='ENOENT')throw error;}}
 const req=createRequire(path.join(consumer,'package.json')),entry=req.resolve('@octane-xplat/fingerprint'),packageRoot=path.resolve(path.dirname(entry),'..');
 if(JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'))).version!=='0.19.0')throw Error('Expected canonical producer0.19.0');
 const reviewed=require('../../../bridge/extensions/canonical.json'),producerSHA256={};
 for(const [name,expected] of Object.entries(reviewed)){
  if(!name.startsWith('fingerprint/'))continue;
  const file=path.join(packageRoot,name.slice('fingerprint/'.length)),actual=hash(fs.readFileSync(file));
  if(actual!==expected)throw Error('Canonical collector payload differs');producerSHA256[name]=actual;
 }
 const canonical=await import(pathToFileURL(entry).href);
 fs.mkdirSync(cache,{mode:0o700});const app=path.join(cache,'app');fs.mkdirSync(app);
 const inputSHA256={};
 for(const name of ['package.json','bun.lock']){const bytes=fs.readFileSync(path.join(consumer,name));inputSHA256[name]=hash(bytes);fs.writeFileSync(path.join(app,name),bytes,{flag:'wx',mode:0o600});}
 fs.symlinkSync(path.join(consumer,'node_modules'),path.join(app,'node_modules'),'dir');
 fs.mkdirSync(path.join(app,'app'));fs.writeFileSync(path.join(app,'app/app.js'),'// host-only coverage fixture\n');fs.mkdirSync(path.join(app,'App_Resources/iOS'),{recursive:true});
 const groups=[];
 const swiftManifest='// swift-tools-version:5.9\nimport PackageDescription\nlet package = Package(name:"Local",products:[.library(name:"Local",targets:["Local"])],targets:[.target(name:"Local")])\n';
 for(const placement of ['workspace-relative','app-relative']){
  const relative=placement==='workspace-relative'?'../Library':'Local';const library=path.resolve(app,relative);
  fs.mkdirSync(path.join(library,'Sources/Local'),{recursive:true});fs.writeFileSync(path.join(library,'Package.swift'),swiftManifest);
  const source=path.join(library,'Sources/Local/Local.swift');fs.writeFileSync(source,'public func value()->Int {111}\n');
  const nativeConfig={id:'org.example.localcanonical',appPath:'app',appResourcesPath:'App_Resources',ios:{SPMPackages:[{name:'Local',path:relative,libs:['Local']}]}};
  fs.writeFileSync(path.join(app,'nativescript.config.cjs'),'module.exports='+JSON.stringify(nativeConfig));
  const options={platforms:['ios'],nativeConfig,toolchain:{qualification:'FIXTURE-HOST-ONLY-local-SPM-coverage'}};
  const records=[];async function capture(name,extra={}){const result=await canonical.createFingerprintAsync(app,{...options,...extra});records.push({name,hash:result.hash,sources:result.sources});return result.hash;}
  const base=await capture('base');fs.writeFileSync(source,'public func value()->Int {222}\n');const changed=await capture('source-changed');
  fs.writeFileSync(path.join(library,'Package.swift'),swiftManifest+'// changed manifest\n');const manifest=await capture('manifest-changed');
  let extraDirectoryError,control;
  if(placement==='workspace-relative'){
   try{await capture('explicit-workspace-directory',{extraSources:[{type:'dir',filePath:relative,reasons:['host-only local SPM coverage']}]});}catch(error){extraDirectoryError=String(error.message);}
  }else{
   const extraSources=[{type:'dir',filePath:relative,reasons:['host-only local SPM coverage control']}];
   const before=await capture('explicit-app-directory',{extraSources});fs.writeFileSync(source,'public func value()->Int {333}\n');const after=await capture('explicit-app-directory-changed',{extraSources});control={sourceChangeAffectsHash:before!==after};
  }
  groups.push({placement,path:relative,sourceChangeAffectsHash:base!==changed,manifestChangeAffectsHash:changed!==manifest,extraDirectoryError,control,records});
 }
 for(const [name,expected] of Object.entries(producerSHA256))if(hash(fs.readFileSync(path.join(packageRoot,name.slice('fingerprint/'.length))))!==expected)throw Error('Canonical producer changed during observation');
 for(const [name,expected] of Object.entries(inputSHA256))if(hash(fs.readFileSync(path.join(consumer,name)))!==expected)throw Error('Consumer input changed');
 const coverageComplete=groups.every(group=>group.sourceChangeAffectsHash&&group.manifestChangeAffectsHash);
 const result={scope:'actual pinned canonical API coverage for declared local Swift source/manifest changes with a synthetic toolchain; no native build, ABI, startup, fingerprint publication or gate acceptance',coverageComplete,controlsVerified:groups.every(group=>!group.control||group.control.sourceChangeAffectsHash),producerVersion:'0.19.0',producerSHA256,inputSHA256,groups};
 fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({coverageComplete,controlsVerified:result.controlsVerified,groups:groups.map(({placement,sourceChangeAffectsHash,manifestChangeAffectsHash,extraDirectoryError})=>({placement,sourceChangeAffectsHash,manifestChangeAffectsHash,extraDirectoryError}))}));
 if(!coverageComplete||!result.controlsVerified)process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
