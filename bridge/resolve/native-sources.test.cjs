const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const expand=require('./native-sources.cjs');
test('configured source globs retain canonical bases and supported file membership',t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'source-glob-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'app'));fs.mkdirSync(path.join(root,'shared'));fs.writeFileSync(path.join(root,'shared','Bridge.swift'),'class Bridge {}');
 const [group]=expand(path.join(root,'app'),[{name:'Bridge',path:'../shared/**/*.swift'}]);
 assert.equal(group.logicalBase,path.join(root,'shared'));assert.equal(group.base,group.logicalBase);assert.equal(group.files.length,1);assert.equal(group.files[0].kind,'source');
 fs.writeFileSync(path.join(root,'shared','module.modulemap'),'module Fixture {}');
 const [directory]=expand(root,[{name:'Directory',path:'shared'}]);assert.equal(directory.files.length,2);assert.ok(directory.files.some(f=>f.kind==='configuration'));
 for(const declarations of [false,[{name:'Empty',path:'missing/*.swift'}],[{name:'Same',path:'shared/*.swift'},{name:'Same',path:'shared/*.swift'}]])assert.throws(()=>expand(root,declarations),e=>e.code==='invalid_input');
 fs.writeFileSync(path.join(root,'shared','unexpected.bin'),'not supported');assert.throws(()=>expand(root,[{name:'Directory',path:'shared'}]),e=>e.code==='unavailable');
});
