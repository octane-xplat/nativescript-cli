'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const invoke=require('./index.cjs'),discover=require('../resolve/hooks.cjs');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'legacy hooks '));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function script(root,name,source){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,source);return {name:'before-build-task-args',script:file,digest:crypto.createHash('sha256').update(source).digest('hex')};}
function request(root,h){return {projectDir:root,projectName:'NativeScriptApp',nativeConfig:{id:'org.fixture'},name:h.name,hooks:[h],arguments:[':app:assembleDebug'],target:{Platform:'android',Configuration:'debug'}};}
test('configuration and directory registrations deduplicate one physical script',t=>{
 const root=fixture(t);const h=script(root,'hooks/before-prepare/a.cjs','module.exports=()=>{}');
 const hooks=discover.project(root,[{type:'before-prepare',script:'hooks/before-prepare/a.cjs'}],file=>fs.readFileSync(file,'utf8'),fail);
 assert.equal(hooks.length,1);assert.equal(hooks[0].script,fs.realpathSync(h.script));
 assert.throws(()=>discover.project(root,[{type:'before-watch',script:'hooks/before-prepare/a.cjs'}],file=>fs.readFileSync(file,'utf8'),fail),/Unsupported project hook before-watch/);
});
test('Gradle hook mutates the shared argument array with bounded named injection',async t=>{
 const root=fixture(t);const h=script(root,'args.cjs',`module.exports=async function(hookArgs,$projectData,$logger){if(!Object.isFrozen($projectData)||$projectData.projectDir!==hookArgs.projectDir)throw Error();$logger.info('PRIVATE_SECRET');hookArgs.args.push('--offline');}`);
 assert.deepEqual(await invoke(request(root,h)),{arguments:[':app:assembleDebug','--offline']});
});
test('hook-owned error fields cannot forge transported diagnostics',async t=>{
 const root=fixture(t);const h=script(root,'failure.cjs',`module.exports=()=>{throw Object.assign(new Error('PRIVATE_SECRET'),{detail:'PRIVATE_SECRET',code:'unavailable'})}`);
 await assert.rejects(invoke(request(root,h)),error=>error.code==='operation_failed'&&!error.detail.includes('PRIVATE_SECRET'));
});
test('changed registered source cannot run under an old identity',async t=>{
 const root=fixture(t);const h=script(root,'changed.cjs',`module.exports=()=>{}`);fs.appendFileSync(h.script,'\n//new');
 await assert.rejects(invoke(request(root,h)),error=>error.code==='invalid_input'&&error.detail.includes('changed since resolution'));
});
test('unknown services and middleware are explicit unavailable failures',async t=>{
 const root=fixture(t);
 for(const [name,source,hint] of [['inject.cjs','module.exports=function($injector){throw Error("body must not execute")}',/unsupported injection \$injector/],['middleware.cjs','module.exports=()=>()=>{}',/unsupported lifecycle middleware/]]){
  const h=script(root,name,source);await assert.rejects(invoke(request(root,h)),e=>e.code==='unavailable'&&hint.test(e.detail));
 }
});
