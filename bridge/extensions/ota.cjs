'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
const {createHash} = require('node:crypto');
function fail(code = 'invalid_input') { throw Object.assign(new Error('Canonical OTA preparation failed'), {code}); }
function inside(root, file) { const rel=path.relative(root,file); return rel !== '..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel); }
module.exports = async function(p) {
 const {projectDir,nativeDir,bundleDir,stageDir,platform,configuration,nativeConfig,architecture,destinationKind}=p;
 if (![projectDir,nativeDir,bundleDir,stageDir].every(v=>typeof v==='string'&&path.isAbsolute(v)) || !inside(nativeDir,bundleDir) || !['ios','android'].includes(platform) || !['release','debug'].includes(configuration) || !nativeConfig || typeof nativeConfig!=='object') fail();
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
 const view=path.join(stageDir,'project'); fs.mkdirSync(view);
 const ignored=new Set(['node_modules','.git','.xplat','.xplat-ns']);
 // Snapshot authored inputs, retaining Node's installed package lookup separately.
 const digest=root=>{const h=createHash('sha256');function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const f=path.join(dir,e.name);if(dir===root&&ignored.has(e.name)||inside(buildRoot,f)||inside(stageDir,f))continue;if(e.isSymbolicLink())fail('unavailable');h.update(path.relative(root,f));if(e.isDirectory())walk(f);else h.update(fs.readFileSync(f));}}walk(root);return h.digest('hex');};
 const before=digest(projectDir);
 for(const e of fs.readdirSync(projectDir)) {const f=path.join(projectDir,e);if(ignored.has(e)||inside(buildRoot,f)||inside(stageDir,f))continue;fs.cpSync(f,path.join(view,e),{recursive:true,dereference:false,filter:source=>!inside(buildRoot,source)&&!inside(stageDir,source)});}
 fs.symlinkSync(path.join(projectDir,'node_modules'),path.join(view,'node_modules'),'dir');
 const rebase=v=>typeof v==='string'?v.replaceAll(projectDir,view):Array.isArray(v)?v.map(rebase):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rebase(x)])):v;
 const config=rebase(nativeConfig);
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
