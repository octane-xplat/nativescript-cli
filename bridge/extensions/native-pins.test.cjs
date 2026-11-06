const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {spawnSync}=require('node:child_process');const ota=require('./ota.cjs');
test('canonical producer records actual local Pod, source-control SwiftPM and Gradle resolutions',{skip:!process.env.OTA_PINS_DIR||!process.env.OTA_CONSUMER_DIR},async()=>{
 const app=fs.mkdtempSync(path.join(os.tmpdir(),'ota-pin-app-'));const output=fs.mkdtempSync(path.join(os.tmpdir(),'ota-pin-output-'));
 try{
 const consumer=path.resolve(process.env.OTA_CONSUMER_DIR);for(const f of ['package.json','bun.lock'])fs.copyFileSync(path.join(consumer,f),path.join(app,f));fs.symlinkSync(path.join(consumer,'node_modules'),path.join(app,'node_modules'),'dir');
 const nativeConfig={id:'org.test.actualpins'};fs.writeFileSync(path.join(app,'nativescript.config.js'),'module.exports='+JSON.stringify(nativeConfig));fs.mkdirSync(path.join(app,'App_Resources'),{recursive:true});
 for(const platform of ['ios','android']){
 const native=path.join(output,platform);fs.cpSync(path.join(process.env.OTA_PINS_DIR,platform),native,{recursive:true,dereference:true});
 const write=(file,content)=>{fs.mkdirSync(path.dirname(path.join(native,file)),{recursive:true});fs.writeFileSync(path.join(native,file),content);};
 const boot=platform==='ios'?'internal/main.m':'app/src/main/java/com/tns/NativeScriptApplication.java';const bundle=platform==='ios'?'app':'app/src/main/assets/app';
 write(boot,platform==='ios'?'int main() { NSString *baseDir = [[NSBundle mainBundle] resourcePath]; }':'class Application { void start() { com.tns.Runtime runtime = RuntimeHelper.initRuntime(this); } }');write(bundle+'/package.json','{"main":"bundle.mjs"}');
 if(platform==='android')write('app/src/main/AndroidManifest.xml','<manifest><application android:name="com.tns.NativeScriptApplication"/></manifest>');
 const stage=fs.mkdtempSync(path.join(output,'stage-'));const result=await ota({projectDir:app,nativeDir:native,bundleDir:path.join(native,bundle),stageDir:stage,platform,configuration:'release',nativeConfig,architecture:'arm64',destinationKind:'simulator'});
 const record=JSON.parse(fs.readFileSync(path.join(stage,'native/.xplat/fingerprints',platform+'.json')));
 for(const name of platform==='ios'?['Podfile.lock','Package.resolved']:['gradle.lockfile'])assert.ok(record.sources.some(s=>JSON.stringify(s).includes(name)),name+' omitted');
 const compare=spawnSync(process.execPath,[path.join(consumer,'node_modules/@octane-xplat/fingerprint/dist/cli.js'),'--dir',path.join(stage,'project'),'--platform',platform,'--build-record',path.join(stage,'native/.xplat/fingerprints',platform+'.json'),'--diff',path.join(stage,'native/.xplat/fingerprints',platform+'.json')],{encoding:'utf8'});assert.equal(compare.status,0,compare.stderr);assert.deepEqual(JSON.parse(compare.stdout),[]);assert.equal(result.hash,record.hash);
 }
 }finally{fs.rmSync(app,{recursive:true,force:true});fs.rmSync(output,{recursive:true,force:true});}
});
