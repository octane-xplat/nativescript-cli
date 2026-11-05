#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');

function ancestors(locator){
 const words=locator.split('/'),parts=[];
 for(let i=0;i<words.length;i++)parts.push(words[i].startsWith('@')?words[i]+'/'+words[++i]:words[i]);
 return parts.map((_,i)=>parts.slice(0,parts.length-i).join('/'));
}
function lookup(packages,parent,name){
 for(const prefix of ancestors(parent))if(Object.hasOwn(packages,prefix+'/'+name))return prefix+'/'+name;
 return Object.hasOwn(packages,name)?name:undefined;
}
function expectedPackage(lock,locator,workspace){
 const entry=lock.packages[locator];
 if(!Array.isArray(entry)||typeof entry[0]!=='string')return undefined;
 const descriptor=entry[0],marker=descriptor.indexOf('@workspace:');
 if(marker>=0){
  const folder=descriptor.slice(marker+'@workspace:'.length),manifest=workspace(folder);
  return manifest&&{name:manifest.name,version:manifest.version,metadata:manifest,workspace:folder};
 }
 const split=descriptor.lastIndexOf('@'),name=descriptor.slice(0,split),version=descriptor.slice(split+1);
 if(!/^(?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+$/.test(name)||!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9_.-]+)?$/.test(version))return undefined;
 return {name,version,metadata:entry[2]??{}};
}
function declarations(metadata,root){
 const deps={...metadata.peerDependencies,...metadata.dependencies,...metadata.optionalDependencies};
 if(root)for(const name of ['@nativescript/ios','@nativescript/android'])if(metadata.devDependencies?.[name])deps[name]=metadata.devDependencies[name];
 const optional=new Set(Object.keys(metadata.optionalDependencies??{}));
 for(const name of Object.keys(metadata.peerDependencies??{}))if(metadata.peerDependenciesMeta?.[name]?.optional||(metadata.optionalPeers??[]).includes(name)){
  if(!Object.hasOwn(metadata.dependencies??{},name))optional.add(name);
 }
 return {deps,optional};
}
function peerOnly(metadata,name){
 return Object.hasOwn(metadata.peerDependencies??{},name)&&!Object.hasOwn(metadata.dependencies??{},name)&&!Object.hasOwn(metadata.optionalDependencies??{},name);
}
function peerProviders(lock,node,parent,child,workspace){
 const target=expectedPackage(lock,child,workspace),providers={};
 if(!target)return providers;
 const owned={...parent.metadata.dependencies,...parent.metadata.optionalDependencies,...(parent.workspace?parent.metadata.devDependencies:{})};
 for(const name of Object.keys(target.metadata.peerDependencies??{}).sort()){
  if(!peerOnly(target.metadata,name))continue;
  let locator,kind;
  if(Object.hasOwn(owned,name)){locator=lookup(lock.packages,node.locator,name);kind='consumer-dependency';}
  else if(name===node.lookupName){locator=node.locator;kind='consumer-self';}
  else if(peerOnly(parent.metadata,name)){locator=node.providers[name]?.locator??lookup(lock.packages,node.locator,name);kind='consumer-peer';}
  if(locator)providers[name]={locator,fromLocator:node.locator,kind};
 }
 return providers;
}

// This compares identities and lookup edges, not artifact integrity or native
// behavior. A divergent parent's children remain unverified: comparing them to
// another version's dependency graph would manufacture additional drift claims.
function audit({lock,project,workspace}){
 const packages=new Map(project.Packages.map(p=>[p.Directory,p]));
 const root=packages.get(project.Directory);
 if(!root||!lock.packages[root.Name])throw new Error('Actual app root has no original lock locator');
 const edges=new Map();
 for(const edge of project.Dependencies){const list=edges.get(edge.From)??[];list.push(edge);edges.set(edge.From,list);}
 const queue=[{directory:root.Directory,locator:root.Name,lookupName:root.Name,providers:{}}],seen=new Set(),records=[],rootInjections=[],unverifiedParents=[],workspaceManifests=[];
 const reached=new Set(),workspacesSeen=new Set();
 while(queue.length){
  const node=queue.shift(),pair=JSON.stringify([node.directory,node.locator,node.lookupName,Object.entries(node.providers).map(([name,p])=>[name,p.locator])]);
  if(seen.has(pair))continue;seen.add(pair);reached.add(node.directory);
  const actual=packages.get(node.directory),expected=expectedPackage(lock,node.locator,workspace);
  if(!actual||!expected){unverifiedParents.push({...node,reason:'unsupported-parent-descriptor'});continue;}
  if(actual.Name!==expected.name||actual.Version!==expected.version){
   unverifiedParents.push({...node,actualName:actual.Name,actualVersion:actual.Version,expectedName:expected.name,expectedVersion:expected.version,reason:'parent-identity-differs'});continue;
  }
  if(expected.workspace&&!workspacesSeen.has(node.directory+'\0'+node.locator)){
   workspacesSeen.add(node.directory+'\0'+node.locator);
   workspaceManifests.push({directory:node.directory,locator:node.locator,workspace:expected.workspace});
  }
  const isRoot=node.directory===root.Directory,{deps,optional}=declarations(expected.metadata,isRoot);
  const actualEdges=edges.get(node.directory)??[],byName=new Map(actualEdges.map(edge=>[edge.Name,edge]));
  for(const name of Object.keys(deps).sort()){
   const edge=byName.get(name),provider=peerOnly(expected.metadata,name)&&!(expected.workspace&&Object.hasOwn(expected.metadata.devDependencies??{},name))?node.providers[name]:undefined;
   const targetLocator=provider?.locator??lookup(lock.packages,node.locator,name);
   const base={fromLocator:node.locator,fromDirectory:node.directory,lookupName:name,expectedLocator:targetLocator??null};
   if(provider)base.peerProvider=provider;
   if(!edge){records.push({...base,status:optional.has(name)?'absent-optional-edge':'missing-actual-edge'});continue;}
   const target=targetLocator&&expectedPackage(lock,targetLocator,workspace),installed=packages.get(edge.Directory);
   if(!target||!installed){records.push({...base,actualDirectory:edge.Directory,status:'unverified-target'});continue;}
   const matches=target.name===installed.Name&&target.version===installed.Version;
   records.push({...base,actualDirectory:edge.Directory,expectedName:target.name,expectedVersion:target.version,actualName:installed.Name,actualVersion:installed.Version,status:matches?'identity-match':'identity-drift'});
   queue.push({directory:edge.Directory,locator:targetLocator,lookupName:name,providers:peerProviders(lock,node,expected,targetLocator,workspace)});
  }
  for(const edge of actualEdges)if(!Object.hasOwn(deps,edge.Name)){
   const record={fromLocator:node.locator,fromDirectory:node.directory,lookupName:edge.Name,actualDirectory:edge.Directory,status:isRoot?'staging-root-injection':'unexpected-actual-edge'};
   if(isRoot)rootInjections.push(record);else records.push(record);
  }
 }
 const counts={};for(const row of records)counts[row.status]=(counts[row.status]??0)+1;
 return {scope:'per-parent original Bun lock identity/edge audit; no artifact-integrity, frozen-lock or native acceptance',counts,
  stagingRootInjections:rootInjections,unverifiedParents,unreachedActualPackages:project.Packages.filter(p=>!reached.has(p.Directory)).map(p=>({name:p.Name,version:p.Version,directory:p.Directory})),workspaceManifests,records};
}

function main(){
 if(process.argv.length!==6)throw new Error('usage: audit ORIGINAL_SOURCE INSTALLED_TYPESCRIPT_DIR PUBLIC_PROJECT_JSON NEW_OUTPUT_JSON');
 const source=fs.realpathSync(process.argv[2]),ts=require(path.resolve(process.argv[3])),actual=path.resolve(process.argv[4]),output=path.resolve(process.argv[5]);
 if(typeof ts.parseConfigFileTextToJson!=='function')throw new Error('Installed compiler lacks its JSONC parser API');
 const text=fs.readFileSync(path.join(source,'bun.lock'),'utf8'),parsed=ts.parseConfigFileTextToJson('bun.lock',text);
 if(parsed.error||!parsed.config?.packages)throw new Error('Original Bun lock is not valid supported JSONC');
 const workspace=folder=>{
  const dir=path.resolve(source,folder),relative=path.relative(source,dir);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Workspace locator escapes original source');
  return JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));
 };
 const report=audit({lock:parsed.config,project:JSON.parse(fs.readFileSync(actual,'utf8')),workspace});
 const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
 report.inputSHA256={originalLock:hash(text),publicProject:hash(fs.readFileSync(actual))};
 for(const row of report.workspaceManifests){
  const expected=fs.readFileSync(path.join(source,row.workspace,'package.json')),installed=fs.readFileSync(path.join(row.directory,'package.json'));
  row.originalManifestSHA256=hash(expected);row.actualManifestSHA256=hash(installed);row.exactManifestBytes=row.originalManifestSHA256===row.actualManifestSHA256;
 }
 const fd=fs.openSync(output,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(report,null,2)+'\n');}finally{fs.closeSync(fd);}
 console.log(JSON.stringify({scope:report.scope,counts:report.counts,stagingRootInjections:report.stagingRootInjections.length,unverifiedParents:report.unverifiedParents.length,unreachedActualPackages:report.unreachedActualPackages.length,output}));
 if(Object.entries(report.counts).some(([key,count])=>count&&!['identity-match','absent-optional-edge'].includes(key))||report.unverifiedParents.length)process.exitCode=1;
}
module.exports={ancestors,lookup,expectedPackage,declarations,peerOnly,peerProviders,audit};
if(require.main===module)main();
