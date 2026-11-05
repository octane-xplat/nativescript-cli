'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const core=require('./core.cjs');
const descriptor={name:'nativescript-core',type:'before-checkForChanges',script:'cli-hooks/before-checkForChanges.mjs',inject:true};
const pkg={name:'@nativescript/core',version:'9.1.3',nativescript:{hooks:[descriptor]}};
test('core compatibility migration does not accept arbitrary hooks or execute code',()=>{
 let read=false;
 const input=()=>{read=true;return 'throw new Error("must never execute")';};
 assert.equal(core.supported(pkg,'/fixture',()=>{throw new Error('missing hook');}),false);
 assert.equal(core.supported(pkg,'/fixture',input),false);assert.equal(read,true);
 for(const value of [{...pkg,version:'9.1.4'},{...pkg,name:'other'},{...pkg,nativescript:{hooks:[{...descriptor,inject:false}]}},{...pkg,nativescript:{hooks:[descriptor,descriptor]}},{...pkg,nativescript:{hooks:[{...descriptor,extra:true}]}}]) {
  assert.equal(core.supported(value,'/fixture',()=>{throw new Error('unexpected read');}),false);
 }
});
test('actual independently installed core hook matches the reviewed migration',{skip:!process.env.CORE_PACKAGE_DIR},()=>{
 const dir=path.resolve(process.env.CORE_PACKAGE_DIR);
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'package.json')));
 assert.equal(core.supported(manifest,dir,file=>fs.readFileSync(file,'utf8')),true);
});
