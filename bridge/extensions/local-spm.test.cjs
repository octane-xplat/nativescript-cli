const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {collect,snapshot}=require('./local-spm.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(t){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'canonical-local-spm-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const projectDir=path.join(root,'app');fs.mkdirSync(projectDir);
 const packages=[],sourceFiles={},manifests={};
 function add(name,products=[name]){
  const directory=path.join(root,name);fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'Package.swift'),'// owned manifest');fs.writeFileSync(path.join(directory,'Bridge.swift'),'class Bridge {}');
  const manifest=path.join(directory,'Package.swift');packages.push({name,path:'../'+name,manifest,products});
  manifests[manifest]={sourceSHA256:sha(fs.readFileSync(manifest)),manifest:{name,packageKind:{root:[directory]},dependencies:[],targets:[{name,type:'regular',path:'.'}],products:products.map(name=>({name,type:{library:['automatic']}}))}};
  refresh(directory);return directory;
 }
 function refresh(directory){for(const file of fs.readdirSync(directory)){const full=path.join(directory,file);if(fs.lstatSync(full).isFile())sourceFiles[full]=sha(fs.readFileSync(full));}}
 return {root,projectDir,packages,sourceFiles,manifests,add,refresh,read(){return collect({projectDir,packages,sourceFiles,manifests});}};
}

test('selected package descriptor preserves package/product order independence and excludes host roots',t=>{
 const f=fixture(t),a=f.add('A',['Second','First']),b=f.add('B');const first=f.read();
 f.packages.reverse();f.packages.find(p=>p.name==='A').products.reverse();assert.equal(f.read().contents,first.contents);
 assert.ok(!first.contents.includes(f.root));assert.equal(first.inputs.length,4);
 const copy=fixture(t);copy.add('A',['Second','First']);copy.add('B');assert.equal(copy.read().contents,first.contents);
 fs.writeFileSync(path.join(a,'Bridge.swift'),'class Changed {}');assert.throws(()=>f.read(),error=>error.code==='invalid_input');f.refresh(a);assert.notEqual(f.read().sha256,first.sha256);
});
test('membership, manifest evaluation and selected products remain bound to current leased sources',t=>{
 const f=fixture(t),directory=f.add('Local'),first=f.read();
 fs.writeFileSync(path.join(directory,'New.swift'),'class Added {}');assert.throws(()=>f.read(),error=>error.code==='invalid_input');f.refresh(directory);assert.notEqual(f.read().sha256,first.sha256);
 fs.rmSync(path.join(directory,'New.swift'));assert.throws(()=>f.read(),error=>error.code==='invalid_input');delete f.sourceFiles[path.join(directory,'New.swift')];assert.equal(f.read().sha256,first.sha256);
 f.manifests[f.packages[0].manifest].manifest.targets[0].settings=[{kind:{define:{_0:'NATIVE_OPTION'}}}];assert.notEqual(f.read().sha256,first.sha256);
 const packageFile=f.packages[0].manifest;fs.appendFileSync(packageFile,'// changed declaration');f.refresh(directory);assert.throws(()=>f.read(),error=>error.code==='invalid_input');f.manifests[packageFile].sourceSHA256=f.sourceFiles[packageFile];
 f.packages[0].products=['missing'];assert.throws(()=>f.read(),error=>error.code==='invalid_input');
});
test('tool caches and unselected roots stay outside selected canonical identities',t=>{
 const f=fixture(t),selected=f.add('Selected'),losing=f.add('Losing');f.packages=f.packages.filter(p=>p.name==='Selected');
 const read=()=>collect({projectDir:f.projectDir,packages:f.packages,sourceFiles:f.sourceFiles,manifests:f.manifests}),before=read();
 fs.writeFileSync(path.join(losing,'Bridge.swift'),'class LosingChanged {}');assert.equal(read().contents,before.contents);
 fs.mkdirSync(path.join(selected,'.build'));fs.writeFileSync(path.join(selected,'.build','cache'),'tool state');assert.equal(read().contents,before.contents);
});
test('symlinks, transitive dependencies, plugins and external evaluated paths remain unavailable',t=>{
 const f=fixture(t),directory=f.add('Local'),manifest=f.manifests[f.packages[0].manifest].manifest;
 fs.symlinkSync(path.join(directory,'Bridge.swift'),path.join(directory,'Alias.swift'));assert.throws(()=>f.read(),error=>error.code==='unavailable');fs.rmSync(path.join(directory,'Alias.swift'));
 manifest.dependencies=[{fileSystem:[{path:'../Other'}]}];assert.throws(()=>f.read(),error=>error.code==='unavailable');manifest.dependencies=[];
 manifest.targets[0].type='plugin';assert.throws(()=>f.read(),error=>error.code==='unavailable');manifest.targets[0].type='regular';
 manifest.targets[0].path=directory+'-outside';assert.throws(()=>f.read(),error=>error.code==='unavailable');manifest.targets[0].path='.';
 manifest.targets[0].settings=['-I'+directory+'-outside'];assert.throws(()=>f.read(),error=>error.code==='unavailable');
 manifest.targets[0].settings=[{kind:{headerSearchPath:{_0:'../outside'}}}];assert.throws(()=>f.read(),error=>error.code==='unavailable');
 manifest.targets[0].settings=[{kind:{unsafeFlags:{_0:['-DOPTION']}}}];assert.throws(()=>f.read(),error=>error.code==='unavailable');
});

test('owned snapshots preserve external and installed package identities without writing through dependency links',t=>{
 const f=fixture(t),installed=f.add('Installed'),external=f.add('External');
 fs.mkdirSync(path.join(f.projectDir,'node_modules'));const alias=path.join(f.projectDir,'node_modules/Installed');fs.symlinkSync(installed,alias,'dir');f.packages[0].path='node_modules/Installed';
 fs.mkdirSync(path.join(installed,'.build'));fs.writeFileSync(path.join(installed,'.build','cache'),'unowned tool cache');
 const request={projectDir:f.projectDir,packages:f.packages,sourceFiles:f.sourceFiles,manifests:f.manifests,destination:path.join(f.root,'owned')};
 const before=f.read(),owned=snapshot(request);
 assert.equal(owned.contents,before.contents);assert.equal(owned.sha256,before.sha256);owned.recheck();
 assert.equal(fs.readlinkSync(alias),installed);assert.equal(fs.readFileSync(path.join(installed,'Bridge.swift'),'utf8'),'class Bridge {}');
 assert.equal(fs.existsSync(path.join(request.destination,'0/.build')),false);
 assert.equal(fs.readFileSync(path.join(request.destination,'1/Bridge.swift'),'utf8'),'class Bridge {}');
 fs.writeFileSync(path.join(external,'Bridge.swift'),'class ChangedAfterSnapshot {}');f.refresh(external);
 assert.throws(()=>owned.recheck(),error=>error.code==='invalid_input');
});

test('owned snapshot mutation and membership changes reject without replacing existing destinations',t=>{
 const f=fixture(t);f.add('Selected');const destination=path.join(f.root,'owned');
 const request={projectDir:f.projectDir,packages:f.packages,sourceFiles:f.sourceFiles,manifests:f.manifests,destination};
 const owned=snapshot(request),file=path.join(destination,'0/Bridge.swift');
 const bytes=fs.readFileSync(file);fs.writeFileSync(file,'class SnapshotChanged {}');assert.throws(()=>owned.recheck(),error=>error.code==='invalid_input');fs.writeFileSync(file,bytes);owned.recheck();
 const added=path.join(destination,'0/Added.swift');fs.writeFileSync(added,'class Added {}');assert.throws(()=>owned.recheck(),error=>error.code==='invalid_input');fs.rmSync(added);owned.recheck();
 assert.throws(()=>snapshot(request),error=>error.code==='invalid_input');assert.deepEqual(fs.readFileSync(file),bytes);
 assert.throws(()=>snapshot({...request,destination:path.join(f.root,'Selected/snapshot')}),error=>error.code==='unavailable');
 assert.equal(fs.existsSync(path.join(f.root,'Selected/snapshot')),false);
});
