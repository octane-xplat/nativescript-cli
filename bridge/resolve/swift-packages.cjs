'use strict';
const path=require('node:path');
const fs=require('node:fs');
const fail=code=>{throw Object.assign(new Error('Invalid Swift package declaration'),{code});};
const version='(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?';
exports.key=url=>url.replace(/\/$/,'').replace(/\.git$/,'');
exports.requirement=value=>{
 if(typeof value!=='string'||!value)fail('invalid_input');
 if(/^#[a-fA-F0-9]{40}$/.test(value))return {kind:'revision',revision:value.slice(1).toLowerCase()};
 if(new RegExp('^'+version+'$').test(value))return {kind:'exactVersion',version:value};
 if(new RegExp('^[\\^~]'+version+'$').test(value))return {kind:value[0]==='^'?'upToNextMajorVersion':'upToNextMinorVersion',minimumVersion:value.slice(1)};
 if(/^[A-Za-z_][A-Za-z0-9_.\/-]*$/.test(value)&&!value.includes('..')&&!value.endsWith('/')&&!value.endsWith('.lock'))return {kind:'branch',branch:value};
 fail('unavailable');
};
exports.parse=declarations=>{
 if(declarations===undefined)return [];
 if(!Array.isArray(declarations))fail('invalid_input');
 const names=new Set();
 return declarations.map(p=>{
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['name','repositoryURL','version','libs','path'].includes(k))||typeof p.name!=='string'||!p.name||names.has(p.name)||!Array.isArray(p.libs)||!p.libs.length||p.libs.some(n=>typeof n!=='string'||!n||!/^[-A-Za-z0-9_.]+$/.test(n)))fail('invalid_input');
  names.add(p.name);
  const products=[...new Set(p.libs)].sort();
  if(p.path!==undefined){
   if(typeof p.path!=='string'||!p.path.trim()||/[\r\n\0]/.test(p.path)||p.repositoryURL!==undefined||p.version!==undefined)fail('invalid_input');
   return {name:p.name,path:p.path,products};
  }
  if(typeof p.repositoryURL!=='string')fail('invalid_input');
  let url;try{url=new URL(p.repositoryURL);}catch{fail('invalid_input');}
  if(url.protocol!=='https:')fail('unavailable');
  if(url.username||url.password||url.search||url.hash||!path.posix.basename(url.pathname))fail('invalid_input');
  exports.requirement(p.version);
  return {name:p.name,repositoryURL:url.href.replace(/\/$/,''),version:p.version,products};
 });
};

exports.local=(projectDir,declaration,read)=>{
 let directory;
 try{directory=fs.realpathSync(path.resolve(projectDir,declaration.path));}catch{fail('invalid_input');}
 const manifest=path.join(directory,'Package.swift');
 if(!fs.statSync(directory).isDirectory()||!fs.existsSync(manifest)||!fs.lstatSync(manifest).isFile())fail('invalid_input');
 const hash=folder=>{for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
  if(entry.isDirectory()&&['.build','.swiftpm'].includes(entry.name))continue;
  const file=path.join(folder,entry.name);
  if(entry.isSymbolicLink())fail('unavailable');
  if(entry.isDirectory())hash(file);else if(entry.isFile())read(file);else fail('unavailable');
 }};
 hash(directory);
 return manifest;
};

// Local declarations use the producer's app-first, then first-plugin rule by
// declared name. All trees retain source identities even when not selected.
// Remove automatic membership for declared roots so it cannot re-add a losing
// shim or compile its sources directly into the application.
exports.mergeLocal=(contributions,app)=>{
 const declared=contributions.filter(c=>c.kind==='spm'&&c.spm?.path);
 const roots=declared.map(c=>path.dirname(c.path));
 const inside=(root,file)=>{const relative=path.relative(root,file);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
 const names=new Map();
 for(const c of declared){
  const previous=names.get(c.spm.name);
  if(!previous||c.packageDirectory===app&&previous.packageDirectory!==app)names.set(c.spm.name,c);
 }
 const paths=new Map(),products=new Map();
 for(const c of names.values()){
  const previous=paths.get(c.path);
  paths.set(c.path,previous?{...previous,spm:{...previous.spm,products:[...new Set([...previous.spm.products,...c.spm.products])].sort()}}:c);
 }
 for(const c of paths.values())for(const product of c.spm.products){
  if(products.has(product)&&products.get(product)!==c.path)fail('invalid_input');
  products.set(product,c.path);
 }
 for(const c of contributions)if(c.kind==='spm-remote'&&(names.has(c.spm.name)||c.spm.products.some(p=>products.has(p))))fail('invalid_input');
 return [...contributions.filter(c=>c.platform!=='ios'||!roots.some(root=>inside(root,c.path))),...paths.values()];
};
// Explicit app versions override the same repository's plugin defaults. All
// requested products remain linked; conflicting plugin versions require an app
// choice. Repository/name/SwiftPM-identity collisions never depend on visit order.
exports.merge=(contributions,app)=>{
 const repos=new Map(),names=new Map(),identities=new Map(),products=new Map();
 for(const c of contributions){
  if(c.kind!=='spm-remote')continue;
  const p=c.spm,key=exports.key(p.repositoryURL);
  const identity=path.posix.basename(new URL(key).pathname).toLowerCase();
  if(names.has(p.name)&&names.get(p.name)!==key||identities.has(identity)&&identities.get(identity)!==key)fail('invalid_input');
  names.set(p.name,key);identities.set(identity,key);
  for(const product of p.products){if(products.has(product)&&products.get(product)!==key)fail('invalid_input');products.set(product,key);}
  const entry=repos.get(key)??[];entry.push(c);repos.set(key,entry);
 }
 const merged=[];
 for(const entries of repos.values()){
  entries.sort((a,b)=>(b.packageDirectory===app)-(a.packageDirectory===app)||(a.packageDirectory<b.packageDirectory?-1:a.packageDirectory>b.packageDirectory?1:0)||(a.spm.name<b.spm.name?-1:a.spm.name>b.spm.name?1:0)||(a.spm.repositoryURL<b.spm.repositoryURL?-1:a.spm.repositoryURL>b.spm.repositoryURL?1:0));
  const selected=entries[0],versions=new Set(entries.map(c=>c.spm.version));
  if(new Set(entries.filter(c=>c.packageDirectory===app).map(c=>c.spm.version)).size>1)fail('invalid_input');
  if(versions.size>1&&selected.packageDirectory!==app)fail('invalid_input');
  const products=[...new Set(entries.flatMap(c=>c.spm.products))].sort();
  merged.push({...selected,spm:{...selected.spm,products}});
 }
 return merged.sort((a,b)=>a.spm.repositoryURL<b.spm.repositoryURL?-1:a.spm.repositoryURL>b.spm.repositoryURL?1:0);
};
