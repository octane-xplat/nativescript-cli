'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
const {createHash} = require('node:crypto');
function fail(code = 'invalid_input') { throw Object.assign(new Error('Canonical OTA preparation failed'), {code}); }
function inside(root, file) { const rel=path.relative(root,file); return rel !== '..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel); }
module.exports = async function(p) {
 const {projectDir,nativeDir,bundleDir,stageDir,platform,configuration,nativeConfig,architecture,destinationKind,extensionNative=[],projectStateDir,sourceFiles={},localSwiftPackages=[]}=p;
 if (![projectDir,nativeDir,bundleDir,stageDir].every(v=>typeof v==='string'&&path.isAbsolute(v)) || !inside(nativeDir,bundleDir) || !['ios','android'].includes(platform) || !['release','debug'].includes(configuration) || !nativeConfig || typeof nativeConfig!=='object') fail();
 if(projectStateDir!==undefined&&(typeof projectStateDir!=='string'||!path.isAbsolute(projectStateDir)||inside(projectStateDir,projectDir)||!inside(projectStateDir,nativeDir)||!inside(projectStateDir,stageDir)))fail();
 const req=createRequire(path.join(projectDir,'package.json'));
 let producer, fingerprintFile;
 try { producer=req.resolve('@octane-xplat/updates/prepare'); fingerprintFile=req.resolve('@octane-xplat/fingerprint'); } catch { fail('unavailable'); }
 if(JSON.parse(fs.readFileSync(path.join(path.dirname(producer),'package.json'))).version!=='0.19.0' || JSON.parse(fs.readFileSync(path.join(path.dirname(fingerprintFile),'../package.json'))).version!=='0.19.0') fail('unavailable');
 for(const [name,expected] of Object.entries(require('./canonical.json'))) { const [pkg,...parts]=name.split('/');const base=pkg==='updates'?path.dirname(producer):path.resolve(path.dirname(fingerprintFile),'..');if(createHash('sha256').update(fs.readFileSync(path.join(base,...parts))).digest('hex')!==expected)fail('unavailable'); }
 const canonical=await import(pathToFileURL(fingerprintFile).href);
 // Refuse disagreement between the build handoff and the canonical evaluator.
 const evaluated=await canonical.resolveNativeConfigAsync(projectDir);
 const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
 if(stable(evaluated)!==stable(nativeConfig)) fail('unavailable');
 for(const key of ['appPath','appResourcesPath']) { const selected=nativeConfig[key]; if(selected!==undefined&&(typeof selected!=='string'||!inside(projectDir,path.resolve(projectDir,selected))))fail('unavailable'); }
 const buildRoot=path.resolve(projectDir,nativeConfig.buildPath??'platforms');
 if(!inside(projectDir,buildRoot)||buildRoot===projectDir) fail('unavailable');
 const sourceGroups=platform==='ios'?require('../resolve/native-sources.cjs')(projectDir,nativeConfig.ios?.NativeSource):[];
 if(!sourceFiles||typeof sourceFiles!=='object'||Array.isArray(sourceFiles))fail();
 if(!Array.isArray(localSwiftPackages)||platform!=='ios'&&localSwiftPackages.length)fail();
 const localPackages=localSwiftPackages.map(f=>{
  if(!f||Object.keys(f).sort().join(',')!=='evaluation,manifest,name,path,products,sourceSHA256')fail();
  return {name:f.name,path:f.path,products:f.products,manifest:f.manifest};
 });
 const localManifests=Object.fromEntries(localSwiftPackages.map(f=>[f.manifest,{sourceSHA256:f.sourceSHA256,manifest:f.evaluation}]));
 if(platform==='ios')for(const declaration of require('../resolve/swift-packages.cjs').parse(nativeConfig.ios?.SPMPackages).filter(p=>p.path)){
  let manifest;try{manifest=path.join(fs.realpathSync(path.resolve(projectDir,declaration.path)),'Package.swift');}catch{fail();}
  if(!localPackages.some(p=>p.manifest===manifest&&declaration.products.every(product=>p.products.includes(product))))fail('unavailable');
 }
 const swiftSnapshot=localPackages.length?require('./local-spm.cjs').snapshot({projectDir,packages:localPackages,sourceFiles,manifests:localManifests,destination:path.join(stageDir,'local-swift')}):undefined;
 const sourceDigest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const checkSources=()=>{for(const group of sourceGroups)for(const file of group.files)if(sourceFiles[file.realPath]!==sourceDigest(file.realPath))fail();};
 checkSources();
 let anchor=projectDir;
 for(const group of sourceGroups){
  // Absolute external patterns retain machine-specific config values in the
  // canonical contract. Require a relative workspace path for this snapshot.
  const declaration=nativeConfig.ios.NativeSource.find(s=>s.name===group.name);
  if(path.isAbsolute(declaration.path)&&!inside(projectDir,group.logicalBase))fail('unavailable');
  if(group.base!==group.logicalBase||group.files.some(file=>inside(path.join(projectDir,'node_modules'),file.path)))fail('unavailable');
  while(!inside(anchor,group.logicalBase))anchor=path.dirname(anchor);
 }
 const snapshot=path.join(stageDir,'project');
 const view=path.join(snapshot,path.relative(anchor,projectDir));fs.mkdirSync(view,{recursive:true});
 const ignored=new Set(['node_modules','.git','.xplat','.xplat-ns']);
 const excluded=f=>inside(buildRoot,f)||inside(stageDir,f)||(projectStateDir!==undefined&&inside(projectStateDir,f));
 // Snapshot authored inputs, retaining Node's installed package lookup separately.
 const digest=root=>{const h=createHash('sha256');function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const f=path.join(dir,e.name);if(dir===root&&ignored.has(e.name)||excluded(f))continue;if(e.isSymbolicLink())fail('unavailable');h.update(path.relative(root,f));if(e.isDirectory())walk(f);else h.update(fs.readFileSync(f));}}walk(root);return h.digest('hex');};
 const before=digest(projectDir);
 const copy=(source,destination)=>{
  if(excluded(source))return;
  // Node rejects copying an ancestor of the destination even if a cp filter
  // excludes the owned state beneath it. Walk that ancestor explicitly.
  if(inside(source,stageDir)&&fs.lstatSync(source).isDirectory()){
   fs.mkdirSync(destination,{recursive:true});for(const e of fs.readdirSync(source))copy(path.join(source,e),path.join(destination,e));
  }else fs.cpSync(source,destination,{recursive:true,dereference:false,filter:source=>!excluded(source)});
 };
 for(const e of fs.readdirSync(projectDir)) {if(!ignored.has(e))copy(path.join(projectDir,e),path.join(view,e));}
 fs.symlinkSync(path.join(projectDir,'node_modules'),path.join(view,'node_modules'),'dir');
 for(const group of sourceGroups)for(const file of group.files){
  if(excluded(file.realPath)||excluded(file.path))fail('unavailable');
  const destination=path.join(snapshot,path.relative(anchor,file.path));
  if(!inside(snapshot,destination))fail();
  // Never copy through the intentionally linked installed dependency tree.
  if(inside(path.join(view,'node_modules'),destination))fail('unavailable');
  fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(file.realPath,destination);
  if(sourceDigest(destination)!==sourceFiles[file.realPath])fail();
 }
 const rebase=v=>typeof v==='string'?v.replaceAll(projectDir,view):Array.isArray(v)?v.map(rebase):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rebase(x)])):v;
 const config=rebase(nativeConfig);
 // Use the canonical collector's data-only extra-source contract. These values
 // come from verified leased inputs, never generated-state absolute paths.
 const extensionID='xplat-ns/extension-native/v1';
 const extrasToAdd=[];
 let extensionContents;
 if(!Array.isArray(extensionNative))fail();
 if(extensionNative.length){
  const seen=new Set();
  const files=extensionNative.map(f=>{
   if(!f||Object.keys(f).sort().join(',')!=='kind,owner,path,platform,sha256,version'||typeof f.owner!=='string'||!f.owner||typeof f.version!=='string'||!f.version||f.platform!==platform||!['source','resource','configuration','library','framework'].includes(f.kind)||typeof f.path!=='string'||!f.path||path.posix.isAbsolute(f.path)||path.posix.normalize(f.path)!==f.path||f.path==='..'||f.path.startsWith('../')||/[\\:\x00]/.test(f.path)||!/^([a-f0-9]{64})$/.test(f.sha256))fail();
   const key=JSON.stringify([f.owner,f.path.toLowerCase()]);if(seen.has(key))fail();seen.add(key);
   return f;
  }).sort((a,b)=>a.owner<b.owner?-1:a.owner>b.owner?1:a.path<b.path?-1:a.path>b.path?1:0);
  extensionContents=stable({format:extensionID,files});
  extrasToAdd.push({type:'contents',id:extensionID,contents:extensionContents,reasons:['extension-generated native inputs']});
 }
 if(swiftSnapshot)extrasToAdd.push({type:'contents',id:swiftSnapshot.id,contents:swiftSnapshot.contents,reasons:['selected declared local Swift package inputs']});
 if(extrasToAdd.length){
  const file=path.join(view,'fingerprint.config.json');
  const fingerprintConfig=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{};
  if(!fingerprintConfig||typeof fingerprintConfig!=='object'||Array.isArray(fingerprintConfig)||fingerprintConfig.extraSources!==undefined&&!Array.isArray(fingerprintConfig.extraSources))fail();
  const extras=fingerprintConfig.extraSources??[];
  if(extras.some(s=>s&&extrasToAdd.some(owned=>owned.id===s.id)))fail();
  fs.writeFileSync(file,JSON.stringify({...fingerprintConfig,extraSources:[...extras,...extrasToAdd]}));
 }
 const platforms=path.resolve(view,config.buildPath??'platforms');
 const native=path.join(platforms,platform);fs.mkdirSync(path.dirname(native),{recursive:true});fs.cpSync(nativeDir,native,{recursive:true,dereference:true});
 const projectName='NativeScriptApp';
 const emitted=platform==='ios'?path.join(native,projectName,'app'):path.join(native,'app/src/main/assets/app');
 if(platform==='ios'){fs.mkdirSync(path.dirname(emitted),{recursive:true});fs.cpSync(bundleDir,emitted,{recursive:true});}
 if(!fs.existsSync(path.join(emitted,'package.json')))fail('unavailable');
 if(platform==='ios'&&fs.existsSync(path.join(native,'Podfile'))&&!fs.existsSync(path.join(native,'Podfile.lock')))fail('unavailable');
 if(platform==='android'&&!Array.from(fs.globSync('**/{gradle.lockfile,dependency-locks/*.lockfile}',{cwd:native,exclude:['**/build/**','**/.gradle/**']})).length)fail('unavailable');
 const toolchain=await canonical.captureNativeToolchainAsync(projectDir,platform);
 // This helper is a fresh owned Node process; never change the embedding process argv.
 process.argv.push(destinationKind==='device'?'--for-device':'--emulator','--arch',architecture);
 await req(producer)({projectDir:view,platform,projectName,platformsDir:platforms,nativeConfig:config,toolchain,release:configuration==='release'});
 const recordFile=path.join(view,'.xplat/fingerprints',platform+'.json');
 const record=JSON.parse(fs.readFileSync(recordFile));
 const verified=await canonical.createFingerprintAsync(view,{platforms:[platform],nativeConfig:config,toolchain:record.toolchain});
 if(record.hash!==verified.hash||stable(record.sources)!==stable(verified.sources)||before!==digest(projectDir))fail();
 checkSources();
 if(swiftSnapshot){
  swiftSnapshot.recheck();
  const source=record.sources.filter(s=>s.type==='contents'&&s.id===swiftSnapshot.id);
  if(source.length!==1||source[0].hash!==swiftSnapshot.sha256)fail();
 }
 if(extensionContents!==undefined){
  const source=record.sources.filter(s=>s.type==='contents'&&s.id===extensionID);
  if(source.length!==1||source[0].hash!==createHash('sha256').update(extensionContents).digest('hex'))fail();
 }
 const stamp=JSON.parse(fs.readFileSync(path.join(emitted,'xplat-native.json')));
 if(stamp.hash!==record.hash||stamp.release!==(configuration==='release'))fail();
 // Publish all three producer outputs as one native-directory replacement.
 const output=path.join(stageDir,'native');fs.cpSync(nativeDir,output,{recursive:true,dereference:true});
 const boot=platform==='ios'?'internal/main.m':'app/src/main/java/com/tns/NativeScriptApplication.java';
 fs.copyFileSync(path.join(native,boot),path.join(output,boot));
 const outputBundle=path.join(output,path.relative(nativeDir,bundleDir));
 fs.copyFileSync(path.join(emitted,'xplat-native.json'),path.join(outputBundle,'xplat-native.json'));
 const records=path.join(output,'.xplat/fingerprints');fs.mkdirSync(records,{recursive:true});fs.copyFileSync(recordFile,path.join(records,platform+'.json'));
 return {hash:record.hash,format:record.format,release:stamp.release};
};
