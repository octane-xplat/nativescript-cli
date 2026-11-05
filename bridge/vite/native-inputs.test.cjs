const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const nativeInputs = require('./native-inputs.cjs');

test('native input identity ignores metadata/cache notifications and detects source changes',t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'native-inputs-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const manifest = path.join(root,'Package.swift');
  const source = path.join(root,'Native.swift');
  fs.writeFileSync(manifest,'// package');
  fs.writeFileSync(source,'// native source');
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const changed = nativeInputs([root],[manifest,source].map(Path => ({Path,Digest:hash(Path)})));
  fs.utimesSync(source,new Date(),new Date());
  assert.equal(changed(source),false);
  fs.mkdirSync(path.join(root,'.build'));
  fs.writeFileSync(path.join(root,'.build','compiler-cache'),'cache');
  assert.equal(changed(path.join(root,'.build','compiler-cache')),false);
  assert.equal(changed(root),false);
  fs.writeFileSync(source,'// native source changed');
  assert.equal(changed(source),true);
  fs.writeFileSync(source,'// native source');
  fs.writeFileSync(path.join(root,'Added.swift'),'// new source');
  assert.equal(changed(path.join(root,'Added.swift')),true);
  fs.rmSync(source);
  assert.equal(changed(source),true);
});

test('configured globs detect membership edits and ignore unmatched/generated siblings',t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'configured-inputs-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'Bridge.swift');fs.writeFileSync(source,'class Bridge {}');
 const Path=fs.realpathSync(source),Digest=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
 const group={name:'Bridge',path:path.join(root,'*.swift'),root:fs.realpathSync(root),files:[Path]};
 const changed=nativeInputs([Path],[{Path,Digest}],[group],root);
 assert.equal(changed(),false);
 const unrelated=path.join(root,'unrelated.txt');fs.writeFileSync(unrelated,'unmatched');assert.equal(changed(unrelated),false);assert.equal(changed(group.root),false);
 fs.mkdirSync(path.join(root,'state'));fs.writeFileSync(path.join(root,'state','generation.json'),'{}');assert.equal(changed(path.join(root,'state')),false);
 const added=path.join(root,'Second.swift');fs.writeFileSync(added,'class Second {}');assert.equal(changed(added),true);assert.equal(changed(group.root),true);
 fs.rmSync(added);assert.equal(changed(group.root),false);
 fs.writeFileSync(source,'class Changed {}');assert.equal(changed(Path),true);
 fs.rmSync(source);assert.equal(changed(Path),true);
});

test('plugin Gradle root caches do not restart while authored assets still do',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gradle-inputs-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const platforms=path.join(root,'platforms'),android=path.join(platforms,'android');fs.mkdirSync(android,{recursive:true});
 const source=path.join(android,'Binding.java');fs.writeFileSync(source,'class Binding {}');
 const changed=nativeInputs([platforms],[{Path:source,Digest:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')}]);
 const cache=path.join(android,'.gradle'),file=path.join(cache,'6.4','cache.bin');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'tool cache');
 assert.equal(changed(file),false);assert.equal(changed(platforms),false);
 fs.writeFileSync(file,'changed tool cache');assert.equal(changed(file),false);
 fs.rmSync(cache,{recursive:true});assert.equal(changed(cache),false);assert.equal(changed(platforms),false);
 const asset=path.join(android,'assets','.gradle','owned.bin');fs.mkdirSync(path.dirname(asset),{recursive:true});fs.writeFileSync(asset,'authored asset');
 assert.equal(changed(asset),true);assert.equal(changed(platforms),true);
 fs.rmSync(path.join(android,'assets'),{recursive:true});
 fs.symlinkSync(root,cache,'dir');assert.throws(()=>changed(cache),/symlink/);
});
