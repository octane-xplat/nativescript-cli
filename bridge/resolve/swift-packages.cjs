'use strict';
const path=require('node:path');
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
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['name','repositoryURL','version','libs'].includes(k))||typeof p.name!=='string'||!p.name||names.has(p.name)||typeof p.repositoryURL!=='string'||!Array.isArray(p.libs)||!p.libs.length||p.libs.some(n=>typeof n!=='string'||!n||!/^[-A-Za-z0-9_.]+$/.test(n)))fail('invalid_input');
  names.add(p.name);
  let url;try{url=new URL(p.repositoryURL);}catch{fail('invalid_input');}
  if(url.protocol!=='https:')fail('unavailable');
  if(url.username||url.password||url.search||url.hash||!path.posix.basename(url.pathname))fail('invalid_input');
  exports.requirement(p.version);
  return {name:p.name,repositoryURL:url.href.replace(/\/$/,''),version:p.version,products:[...new Set(p.libs)].sort()};
 });
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
