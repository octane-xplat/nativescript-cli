'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const resolve=require('./index.cjs');
// Upstream applies each native package name once, keeping the install closest
// to the app root; a duplicate nested version cannot contribute a second copy
// of the same native code.
test('duplicate installed plugin versions contribute only the app-root-resolvable install',async t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'duplicate-plugin-')));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'app',version:'1.0.0',dependencies:{dupe:'1.0.0',parent:'1.0.0'}}));
 fs.writeFileSync(path.join(root,'nativescript.config.js'),'module.exports={id:"org.example.dup"}');
 fs.mkdirSync(path.join(root,'app'));fs.mkdirSync(path.join(root,'App_Resources'));
 const plugin=(dir,version)=>{
  fs.mkdirSync(path.join(dir,'platforms','ios','src'),{recursive:true});
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'dupe',version,nativescript:{platforms:{ios:'9.0.0'}}}));
  fs.writeFileSync(path.join(dir,'platforms','ios','src','Code.m'),`@implementation Dupe${version.replace(/\D/g,'')} @end`);
 };
 const top=path.join(root,'node_modules','dupe');fs.mkdirSync(top,{recursive:true});plugin(top,'2.0.0');
 const parent=path.join(root,'node_modules','parent');fs.mkdirSync(path.join(parent,'node_modules'),{recursive:true});
 fs.writeFileSync(path.join(parent,'package.json'),JSON.stringify({name:'parent',version:'1.0.0',dependencies:{dupe:'1.0.0'}}));
 const nested=path.join(parent,'node_modules','dupe');fs.mkdirSync(nested,{recursive:true});plugin(nested,'1.0.0');
 const result=await resolve({projectDir:root});
 const ios=result.contributions.filter(c=>c.platform==='ios');
 assert.ok(ios.length>0);
 // The nested copy stays in the resolved graph but contributes nothing.
 assert.ok(result.packages.some(p=>p.directory===nested&&p.version==='1.0.0'));
 assert.ok(ios.every(c=>c.packageDirectory===top&&c.path.startsWith(top)));
});
