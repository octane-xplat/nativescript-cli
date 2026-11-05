'use strict';
// Canonical data-only identity for selected plugin NativeSource declarations.
// Absolute paths are private freshness inputs, never fingerprint contents.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const expand=require('../resolve/native-sources.cjs');
const id='xplat-ns/plugin-native-source/v1';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const stable=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)):item);
const fail=code=>{throw Object.assign(new Error('Selected plugin native sources are not qualified'),{code});};
const relative=(owner,file)=>path.relative(owner,file).split(path.sep).join('/');
function collect({groups,sourceFiles}){
 if(!Array.isArray(groups)||!sourceFiles||typeof sourceFiles!=='object'||Array.isArray(sourceFiles))fail('invalid_input');
 const selected=[],inputs=new Map();
 const read=file=>{
  const bytes=fs.readFileSync(file),digest=sha(bytes);
  if(sourceFiles[file]!==digest)fail('invalid_input');
  inputs.set(file,digest);return bytes;
 };
 for(const group of groups){
  if(!group||typeof group!=='object'||typeof group.name!=='string'||!group.name||
     !['packageDirectory','path','root'].every(key=>typeof group[key]==='string'&&path.isAbsolute(group[key]))||
     !Array.isArray(group.files)||group.files.some(file=>typeof file!=='string'||!path.isAbsolute(file)))fail('invalid_input');
  const owner=group.packageDirectory;
  if(fs.realpathSync(owner)!==owner)fail('unavailable');
  if(typeof group.selector!=='string'||!group.selector||path.isAbsolute(group.selector)||/[\\\r\n\0]/.test(group.selector))fail('unavailable');
  if(path.resolve(owner,group.selector)!==group.path)fail('invalid_input');
  const pattern=relative(owner,group.path);
  // A package-relative selector can leave its owner for shared workspace
  // sources; the absolute machine root never enters the data-only descriptor.
  if(!pattern||/[\\\r\n\0]/.test(pattern))fail('unavailable');
  const pkg=JSON.parse(read(path.join(owner,'package.json')));
  if(typeof pkg.name!=='string'||!pkg.name||typeof pkg.version!=='string'||!pkg.version||!pkg.nativescript)fail('invalid_input');
  const configs=['ts','js','cjs','mjs','json'].map(ext=>path.join(owner,'nativescript.config.'+ext)).filter(fs.existsSync);
  if(!configs.length)fail('invalid_input');
  for(const file of configs)read(file);
  const current=expand(owner,[{name:group.name,path:group.path}])[0];
  if(current.logicalBase!==current.base)fail('unavailable');
  const files=current.files.map(file=>file.realPath).sort();
  if(group.root!==current.base||group.files.length!==files.length||[...group.files].sort().some((file,i)=>file!==files[i]))fail('invalid_input');
  selected.push({owner:{name:pkg.name,version:pkg.version},name:group.name,pattern,
   files:files.map(file=>({path:relative(owner,file),sha256:sha(read(file))}))});
 }
 // Preserve multiplicity for separate physical package instances, even when
 // their portable descriptors are identical. Order is not semantic.
 selected.sort((a,b)=>Buffer.compare(Buffer.from(stable(a)),Buffer.from(stable(b))));
 const contents=stable({format:id,groups:selected});
 return {id,contents,sha256:sha(contents),inputs:[...inputs].map(([path,sha256])=>({path,sha256}))};
}
function verified(request){
 const result=collect(request);
 return {...result,recheck(){if(collect(request).contents!==result.contents)fail('invalid_input');}};
}
module.exports={collect,verified};
