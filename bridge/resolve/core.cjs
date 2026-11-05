// Explicit migration of the published core 9.1.3 CLI compatibility check.
// This hook only checks upstream CLI/Angular-webpack versions; this backend
// owns runtime qualification and Vite instead. Never execute or broadly ignore hooks.
'use strict';
const crypto=require('node:crypto');
const path=require('node:path');
exports.supported=(pkg,dir,read)=>{
 if(pkg.name!=='@nativescript/core'||pkg.version!=='9.1.3')return false;
 const hooks=pkg.nativescript?.hooks;
 const h=Array.isArray(hooks)&&hooks.length===1&&hooks[0];
 if(!h||Object.keys(h).sort().join(',')!=='inject,name,script,type'||h.name!=='nativescript-core'||h.type!=='before-checkForChanges'||h.script!=='cli-hooks/before-checkForChanges.mjs'||h.inject!==true)return false;
 let source;try{source=read(path.join(dir,h.script));}catch{return false;}
 return crypto.createHash('sha256').update(source).digest('hex')==='97baeb497a77db8909e7fd39f58dd5f3390516aadf9cb85bd30db58009c7bdd7';
};
