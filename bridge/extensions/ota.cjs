'use strict';
// Explicit adapter for the installed 0.14 startup contract. This is a built-in
// helper operation, never an external extension transport or upstream CLI hook.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {createRequire} = require('node:module');
module.exports = async function({projectDir,nativeDir,platform,configuration,appResourcesPath,fingerprint}) {
 if(fingerprint)throw Object.assign(new Error('canonical fingerprint producer unavailable'),{code:'unavailable'});
 if(configuration!=='release')return {files:[],skipped:true};
 if(![projectDir,nativeDir,appResourcesPath].every(v=>typeof v==='string'&&path.isAbsolute(v))||!['ios','android'].includes(platform))throw Object.assign(new Error(),{code:'invalid_input'});
 const req=createRequire(path.join(projectDir,'package.json'));
 let file;try{file=req.resolve('@octane-xplat/updates/prepare');}catch{throw Object.assign(new Error(),{code:'unavailable'});}
 const pkg=JSON.parse(fs.readFileSync(path.join(path.dirname(file),'package.json'),'utf8'));
 if(pkg.version!=='0.14.0')throw Object.assign(new Error(),{code:'unavailable'});
 const rel=platform==='ios'?'internal/main.m':'app/src/main/java/com/tns/NativeScriptApplication.java';
 const shim=fs.mkdtempSync(path.join(os.tmpdir(),'nativescript-ota-'));
 try {
 // Run the legacy package against a private copy. Failed patches never publish.
 const native=path.join(shim,'platforms',platform);fs.mkdirSync(path.dirname(native),{recursive:true});fs.cpSync(nativeDir,native,{recursive:true,dereference:true});
 fs.symlinkSync(appResourcesPath,path.join(shim,'App_Resources'),'dir');
 await req(file)({projectDir:shim,platform});
 return {files:[{path:rel,content:fs.readFileSync(path.join(native,rel),'utf8')}],skipped:false};
 }finally{fs.rmSync(shim,{recursive:true,force:true});}
};
