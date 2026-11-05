'use strict';
// Build canonical extra-source contents from already selected R1 packages.
// Evaluated Swift manifests must be supplied by owned native preparation; this
// formatter neither invokes Swift nor resolves/fetches package dependencies.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const fail=code=>{throw Object.assign(new Error('Local Swift canonical inputs are not qualified'),{code});};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const stable=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)):item);
const inside=(root,file)=>{const rel=path.relative(root,file);return rel===''||rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
const id='xplat-ns/local-spm/v1';
function collect({projectDir,packages,sourceFiles,manifests}){
 if(!path.isAbsolute(projectDir||'')||!Array.isArray(packages)||!sourceFiles||typeof sourceFiles!=='object'||Array.isArray(sourceFiles)||!manifests||typeof manifests!=='object'||Array.isArray(manifests))fail('invalid_input');
 const names=new Set(),roots=new Set(),products=new Set(),selected=[],inputs=[];
 for(const pkg of packages){
  if(!pkg||Object.keys(pkg).sort().join(',')!=='manifest,name,path,products'||typeof pkg.name!=='string'||!pkg.name||names.has(pkg.name)||typeof pkg.path!=='string'||!pkg.path||path.isAbsolute(pkg.path)||/[\\\r\n\0]/.test(pkg.path)||!path.isAbsolute(pkg.manifest||'')||!Array.isArray(pkg.products)||!pkg.products.length||pkg.products.some(product=>typeof product!=='string'||!/^[-A-Za-z0-9_.]+$/.test(product)))fail('invalid_input');
  const directory=fs.realpathSync(path.resolve(projectDir,pkg.path)),manifest=path.join(directory,'Package.swift');
  if(manifest!==pkg.manifest||roots.has(directory))fail('invalid_input');
  names.add(pkg.name);roots.add(directory);
  const libs=[...new Set(pkg.products)].sort();
  for(const name of libs){if(products.has(name))fail('invalid_input');products.add(name);}
  const files=[];
  function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
   if(entry.isDirectory()&&['.build','.swiftpm'].includes(entry.name))continue;
   const file=path.join(folder,entry.name);
   if(entry.isSymbolicLink())fail('unavailable');
   if(entry.isDirectory())walk(file);
   else if(entry.isFile()){
    const hash=sha(fs.readFileSync(file));if(sourceFiles[file]!==hash)fail('invalid_input');
    files.push({path:path.relative(directory,file).split(path.sep).join('/'),sha256:hash});
    inputs.push({path:file,sha256:hash});
   }else fail('unavailable');
  }}
  walk(directory);
  if(!files.some(file=>file.path==='Package.swift'))fail('invalid_input');
  const expected=Object.keys(sourceFiles).filter(file=>inside(directory,file));
  if(expected.length!==files.length)fail('invalid_input');
  const evaluation=manifests[manifest];
  if(!evaluation||evaluation.sourceSHA256!==sourceFiles[manifest])fail('invalid_input');
  const evaluated=evaluation.manifest;
  // Transitive local/remote dependencies and executable build plugins require
  // their own complete input/pin contract, never a partial native fingerprint.
  const unsafe=value=>value&&typeof value==='object'&&(Object.hasOwn(value,'unsafeFlags')||Object.values(value).some(unsafe));
  if(!evaluated||unsafe(evaluated)||!Array.isArray(evaluated.dependencies)||evaluated.dependencies.length||!Array.isArray(evaluated.targets)||evaluated.targets.some(target=>!['regular','test'].includes(target.type))||!Array.isArray(evaluated.products))fail('unavailable');
  for(const name of libs){const product=evaluated.products.find(product=>product.name===name);if(!product?.type?.library)fail('invalid_input');}
  function logical(value){
   if(typeof value==='string'){
    if(path.isAbsolute(value)){if(!inside(directory,value))fail('unavailable');return {packageRelativePath:path.relative(directory,value).split(path.sep).join('/')||'.'};}
    if(value.includes(directory))fail('unavailable');
    if(/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(value))fail('unavailable');
    if(/(?:^|[= ])(?:\/|[A-Za-z]:[\\/])/.test(value)||/(?:^|[= ])-[ILF]\//.test(value))fail('unavailable');
    return value;
   }
   if(Array.isArray(value))return value.map(logical);
   if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,logical(item)]));
   if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
   fail('invalid_input');
  }
  files.sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)));
  selected.push({name:pkg.name,products:libs,manifestSHA256:sha(stable(logical(evaluated))),files});
 }
 selected.sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name)));
 const contents=stable({format:id,packages:selected});
 return {id,contents,sha256:sha(contents),inputs};
}
// Copy verified selected bytes outside the linked installed dependency tree.
// Re-evaluate neither Swift nor selection; retain the preparation producer fact.
function snapshot({destination,...request}){
 if(!path.isAbsolute(destination||'')||fs.existsSync(destination)||fs.realpathSync(path.dirname(destination))!==path.dirname(destination))fail('invalid_input');
 const descriptor=collect(request);
 const roots=request.packages.map(pkg=>path.dirname(pkg.manifest));
 if(roots.some(root=>inside(root,destination)||inside(destination,root)))fail('unavailable');
 fs.mkdirSync(destination);
 const packages=[],sourceFiles={},manifests={};
 for(const [index,pkg] of request.packages.entries()){
  const root=path.dirname(pkg.manifest),copy=path.join(destination,String(index));fs.mkdirSync(copy);
  const selected=JSON.parse(descriptor.contents).packages.find(item=>item.name===pkg.name);
  for(const file of selected.files){
   const source=path.join(root,file.path),target=path.join(copy,file.path);
   let fd,bytes;
   try{fd=fs.openSync(source,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);if(!fs.fstatSync(fd).isFile())fail('invalid_input');bytes=fs.readFileSync(fd);}finally{if(fd!==undefined)fs.closeSync(fd);}
   if(sha(bytes)!==file.sha256)fail('invalid_input');
   fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});sourceFiles[target]=file.sha256;
  }
  const rebase=value=>typeof value==='string'&&path.isAbsolute(value)&&inside(root,value)?path.join(copy,path.relative(root,value)):Array.isArray(value)?value.map(rebase):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rebase(item)])):value;
  const manifest=path.join(copy,'Package.swift');
  packages.push({...pkg,path:String(index),manifest});
  manifests[manifest]={sourceSHA256:request.manifests[pkg.manifest].sourceSHA256,manifest:rebase(request.manifests[pkg.manifest].manifest)};
 }
 const copied={projectDir:destination,packages,sourceFiles,manifests};
 const recheck=()=>{if(collect(request).contents!==descriptor.contents||collect(copied).contents!==descriptor.contents)fail('invalid_input');};
 recheck();
 return {...descriptor,recheck};
}
module.exports={collect,snapshot,id};
