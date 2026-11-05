'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {projection,sourceRecords,inside,requireSpace,selectedCache}=require('./stage-frozen.cjs');
function fixture(){
 const app={name:'app',version:'1.0.0',dependencies:{'source-plugin':'workspace:*'},devDependencies:{compiler:'1',nativescript:'9.1.1'}};
 const lock={packages:{app:['app@workspace:apps/mobile'],'source-plugin':['source-plugin@workspace:packages/plugin'],compiler:['compiler@1.0.0'],peer:['peer@1.0.0']}};
 const manifests={'apps/mobile':app,'packages/plugin':{name:'source-plugin',version:'1.0.0',peerDependencies:{peer:'1',absent:'1'},peerDependenciesMeta:{absent:{optional:true}}}};
 return {app,lock,workspace:folder=>manifests[folder]};
}
test('filtered workspace selection retains production peers and explicit compiler inputs without changing declarations',()=>{
 const f=fixture(),before=JSON.stringify(f);
 assert.deepEqual(projection(f.lock,f.workspace,['compiler']),{selectedDevInputs:['compiler'],folders:['apps/mobile','packages/plugin'],locators:4});
 assert.equal(JSON.stringify(f),before);assert.equal(f.app.devDependencies.nativescript,'9.1.1');
});
test('selection refuses missing required lock edges and unsupported identities',()=>{
 const f=fixture();delete f.lock.packages.peer;
 assert.throws(()=>projection(f.lock,f.workspace,['compiler']),/Missing required lock edge/);
 f.lock.packages.peer=['peer@unsupported'];assert.throws(()=>projection(f.lock,f.workspace,['compiler']),/Unsupported locked identity/);
 assert.throws(()=>projection(f.lock,f.workspace,['missing']),/Missing selected compiler/);
});
test('source inventory preserves internal link text and detects source identity changes',t=>{
 const container=fs.mkdtempSync(path.join(os.tmpdir(),'ns-stage-source-'));t.after(()=>fs.rmSync(container,{recursive:true,force:true}));
 const root=path.join(container,'source');fs.mkdirSync(root);
 fs.mkdirSync(path.join(root,'assets'));fs.writeFileSync(path.join(root,'assets/font'),'original');fs.symlinkSync('assets/font',path.join(root,'font'));
 const first=sourceRecords(root);assert.deepEqual(first.find(r=>r.kind==='symlink'),{path:'font',kind:'symlink',target:'assets/font'});
 fs.writeFileSync(path.join(root,'assets/font'),'changed');assert.notDeepEqual(sourceRecords(root),first);
 fs.symlinkSync('../outside',path.join(root,'escape'));fs.writeFileSync(path.join(container,'outside'),'outside');
 assert.throws(()=>sourceRecords(root),/Source symlink must stay/);
});
test('cache containment excludes the cache root and similarly prefixed siblings',()=>{
 assert.equal(inside('/cache','/cache/fresh'),true);assert.equal(inside('/cache','/cache'),false);assert.equal(inside('/cache','/cache-other/fresh'),false);assert.equal(inside('/cache','/outside'),false);
});

test('frozen install refuses insufficient space before staging',()=>{
 assert.throws(()=>requireSpace(3*1024**3-1),/at least 3 GiB/);
 assert.doesNotThrow(()=>requireSpace(3*1024**3));
});

test('alternate host cache is explicit and private; project cache remains the default',t=>{
 const container=fs.mkdtempSync(path.join(os.tmpdir(),'ns-host-cache-'));t.after(()=>fs.rmSync(container,{recursive:true,force:true}));
 const cache=fs.realpathSync(container),base=['source','typescript','destination'];
 assert.deepEqual(selectedCache(base,cache),{cache,hostOnly:false});
 assert.deepEqual(selectedCache([...base,'--host-cache-root',cache],'/unused'),{cache,hostOnly:true});
 assert.throws(()=>selectedCache([...base,'--other',cache],cache),/Unknown cache option/);
 fs.chmodSync(cache,0o755);assert.throws(()=>selectedCache([...base,'--host-cache-root',cache],cache),/caller-owned private/);
});
