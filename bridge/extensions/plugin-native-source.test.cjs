const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {collect,verified}=require('./plugin-native-source.cjs');
const expand=require('../resolve/native-sources.cjs');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function fixture(t){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'plugin-native-source-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const groups=[],sourceFiles={};
 const refresh=owner=>{for(const file of [path.join(owner,'package.json'),path.join(owner,'nativescript.config.cjs'),...expand(owner,[{name:'Shared',path:'src/*.swift'}])[0].files.map(f=>f.realPath)])sourceFiles[file]=sha(file);};
 function add(name){
  const owner=path.join(root,name);fs.mkdirSync(path.join(owner,'src'),{recursive:true});
  fs.writeFileSync(path.join(owner,'package.json'),JSON.stringify({name,version:'1.0.0',nativescript:{platforms:{ios:'8'}}}));
  fs.writeFileSync(path.join(owner,'nativescript.config.cjs'),"module.exports={ios:{NativeSource:[{name:'Shared',path:'src/*.swift'}]}}");
  fs.writeFileSync(path.join(owner,'src/Bridge.swift'),'class Bridge {}');
  select(owner);return owner;
 }
 function select(owner){const group=expand(owner,[{name:'Shared',path:'src/*.swift'}])[0];
  const next={name:group.name,path:group.pattern,root:group.base,files:group.files.map(f=>f.realPath),packageDirectory:owner,selector:'src/*.swift'};
  const index=groups.findIndex(g=>g.packageDirectory===owner);if(index<0)groups.push(next);else groups[index]=next;refresh(owner);
 }
 return {root,groups,sourceFiles,add,select,refresh,read(){return collect({groups,sourceFiles});}};
}
test('plugin descriptors retain scoped names, portable contents, ordering and instance multiplicity',t=>{
 const f=fixture(t);f.add('one');f.add('two');const first=f.read();
 assert.ok(!first.contents.includes(f.root));assert.equal(first.inputs.length,6);
 f.groups.reverse();assert.equal(f.read().contents,first.contents);
 const copy=fixture(t);copy.add('two');copy.add('one');assert.equal(copy.read().contents,first.contents);
 const single=collect({groups:[f.groups[0]],sourceFiles:f.sourceFiles});
 assert.notEqual(collect({groups:[f.groups[0],f.groups[0]],sourceFiles:f.sourceFiles}).sha256,single.sha256);
});
test('selected bytes, membership, config and owner version stay bound to leased inputs',t=>{
 const f=fixture(t),owner=f.add('native'),first=f.read(),file=path.join(owner,'src/Bridge.swift');
 const guard=verified(f);fs.writeFileSync(file,'class Changed {}');assert.throws(()=>f.read(),e=>e.code==='invalid_input');
 f.refresh(owner);assert.notEqual(f.read().sha256,first.sha256);assert.throws(()=>guard.recheck(),e=>e.code==='invalid_input');
 fs.writeFileSync(path.join(owner,'src/Added.swift'),'class Added {}');f.refresh(owner);assert.throws(()=>f.read(),e=>e.code==='invalid_input');
 f.select(owner);const added=f.read();assert.notEqual(added.sha256,first.sha256);
 fs.rmSync(path.join(owner,'src/Added.swift'));assert.throws(()=>f.read(),e=>e.code==='invalid_input');f.select(owner);
 fs.appendFileSync(path.join(owner,'nativescript.config.cjs'),'\n// changed config');assert.throws(()=>f.read(),e=>e.code==='invalid_input');f.refresh(owner);
 const pkg=path.join(owner,'package.json');fs.writeFileSync(pkg,fs.readFileSync(pkg,'utf8').replace('1.0.0','2.0.0'));assert.throws(()=>f.read(),e=>e.code==='invalid_input');f.refresh(owner);assert.equal(JSON.parse(f.read().contents).groups[0].owner.version,'2.0.0');
});
test('unmatched files stay irrelevant while symlinks, absolute selectors and stale membership fail closed',t=>{
 const f=fixture(t),owner=f.add('native'),first=f.read();
 fs.writeFileSync(path.join(owner,'src/ignored.txt'),'unmatched');assert.equal(f.read().contents,first.contents);
 const group=f.groups[0],selector=group.selector;group.selector=group.path;assert.throws(()=>f.read(),e=>e.code==='unavailable');group.selector=selector;
 group.files=[];assert.throws(()=>f.read(),e=>e.code==='invalid_input');f.select(owner);
 const source=path.join(owner,'src/Bridge.swift');fs.renameSync(source,source+'.saved');fs.symlinkSync(source+'.saved',source);assert.throws(()=>f.read(),e=>e.code==='unavailable');
});
