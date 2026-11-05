'use strict';
const fs=require('node:fs');
const path=require('node:path');
const fail=(code)=>{throw Object.assign(new Error('Invalid NativeSource declaration'),{code});};
const inside=(root,file)=>{const rel=path.relative(root,file);return rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
// Match the pinned canonical collector's directory traversal. Explicit file
// globs still select the files they name, including otherwise ignored folders.
const ignored=new Set(['node_modules','.git','.cache','.turbo','build','dist','Pods','.gradle','DerivedData']);
module.exports=function expand(root,declarations){
 if(declarations===undefined)return [];
 if(!Array.isArray(declarations))fail('invalid_input');
 const names=new Set();
 return declarations.map(group=>{
  if(!group||typeof group!=='object'||Array.isArray(group)||Object.keys(group).some(k=>!['name','path'].includes(k))||typeof group.name!=='string'||!group.name||names.has(group.name)||typeof group.path!=='string'||!group.path||group.path.includes('\0'))fail('invalid_input');
  names.add(group.name);
  const pattern=path.resolve(root,group.path);
  const prefix=pattern.split(/[*?[\]{}]/,1)[0];
  const logicalBase=path.resolve(prefix.endsWith(path.sep)?prefix:path.dirname(prefix));
  let base;try{base=fs.realpathSync(logicalBase);}catch{fail('invalid_input');}
  const files=new Map();
  function walk(file){
   const stat=fs.lstatSync(file);
   if(stat.isSymbolicLink())fail('unavailable');
   const realPath=fs.realpathSync(file);
   if(!inside(base,realPath))fail('unavailable');
   if(stat.isDirectory()){
    for(const name of fs.readdirSync(file).sort())if(!ignored.has(name))walk(path.join(file,name));
   }else if(stat.isFile()){
    const ext=path.extname(file).toLowerCase();
    const kind=ext==='.modulemap'?'configuration':['.swift','.m','.mm','.h','.c','.cpp'].includes(ext)?'source':undefined;
    if(!kind)fail('unavailable');
    files.set(file,{path:file,realPath,kind});
   }else fail('unavailable');
  }
  try{for(const file of fs.globSync(pattern))walk(file);}catch(e){if(['invalid_input','unavailable'].includes(e.code))throw e;fail('invalid_input');}
  if(!files.size)fail('invalid_input');
  return {name:group.name,pattern,logicalBase,base,files:[...files.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)};
 });
};
