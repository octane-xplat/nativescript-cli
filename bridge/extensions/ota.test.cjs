const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const ota=require('./ota.cjs');
test('canonical adapter rejects incomplete inputs',async()=>{await assert.rejects(ota({configuration:'debug'}),e=>e.code==='invalid_input');});
test('packed canonical producer: actual Apple tool identity, fixture native pins and boot', {skip:!process.env.OTA_CONSUMER_DIR},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-ota-'));const work=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-output-'));
 try {
 const consumer=path.resolve(process.env.OTA_CONSUMER_DIR);
 fs.copyFileSync(path.join(consumer,'package.json'),path.join(root,'package.json'));fs.copyFileSync(path.join(consumer,'bun.lock'),path.join(root,'bun.lock'));
 fs.symlinkSync(path.join(consumer,'node_modules'),path.join(root,'node_modules'),'dir');
 fs.mkdirSync(path.join(root,'App_Resources/iOS'),{recursive:true});fs.mkdirSync(path.join(root,'app'));fs.writeFileSync(path.join(root,'app/app.js'),'// js one');
 const nativeConfig={id:'org.test.ota',appPath:'app',appResourcesPath:'App_Resources'};
 fs.writeFileSync(path.join(root,'nativescript.config.js'),'module.exports='+JSON.stringify(nativeConfig));
 const native=path.join(work,'native');fs.mkdirSync(path.join(native,'internal'),{recursive:true});fs.mkdirSync(path.join(native,'app'));
 const boot=path.join(native,'internal/main.m');fs.writeFileSync(boot,'int main() { NSString *baseDir = [[NSBundle mainBundle] resourcePath]; }');fs.writeFileSync(path.join(native,'app/package.json'),'{"main":"bundle.js"}');
 // These are resolution-format fixtures, not dependency-manager or native-build evidence.
 fs.writeFileSync(path.join(native,'Podfile.lock'),'PODS:\n  - Fixture (1.0.0)\n');
 fs.mkdirSync(path.join(native,'NativeScriptApp.xcworkspace/xcshareddata/swiftpm'),{recursive:true});
 fs.writeFileSync(path.join(native,'NativeScriptApp.xcworkspace/xcshareddata/swiftpm/Package.resolved'),JSON.stringify({version:2,pins:[{identity:'fixture',state:{revision:'abc',version:'1.0.0'}}]}));
 const run=async(configuration='release')=>{const stage=fs.mkdtempSync(path.join(work,'stage-'));const result=await ota({projectDir:root,nativeDir:native,bundleDir:path.join(native,'app'),stageDir:stage,platform:'ios',configuration,nativeConfig,architecture:'arm64',destinationKind:'simulator'});return {result,stage,record:JSON.parse(fs.readFileSync(path.join(stage,'native/.xplat/fingerprints/ios.json')))};};
 const first=await run();assert.match(first.result.hash,/^[a-f0-9]{64}$/);assert.match(fs.readFileSync(path.join(first.stage,'native/internal/main.m'),'utf8'),new RegExp(first.result.hash));
 assert.ok(first.record.sources.some(s=>JSON.stringify(s).includes('Podfile.lock')));assert.ok(first.record.sources.some(s=>JSON.stringify(s).includes('Package.resolved')));
 fs.copyFileSync(path.join(first.stage,'native/internal/main.m'),boot);
 assert.deepEqual((await run()).record,first.record);
 const relocated=path.join(work,'relocated-app');fs.cpSync(root,relocated,{recursive:true,dereference:false});const relocationStage=fs.mkdtempSync(path.join(work,'relocated-stage-'));
 const relocatedResult=await ota({projectDir:relocated,nativeDir:native,bundleDir:path.join(native,'app'),stageDir:relocationStage,platform:'ios',configuration:'release',nativeConfig,architecture:'arm64',destinationKind:'simulator'});assert.equal(relocatedResult.hash,first.result.hash);
 fs.writeFileSync(path.join(root,'app/app.js'),'// js two');assert.equal((await run()).result.hash,first.result.hash);
 fs.writeFileSync(path.join(native,'Podfile.lock'),'PODS:\n  - Fixture (2.0.0)\n');assert.notEqual((await run()).result.hash,first.result.hash);
 const debug=await run('debug');assert.equal(debug.result.release,false);assert.notEqual(debug.result.hash,first.result.hash);
 fs.writeFileSync(boot,'// xplat-updates:start\n incomplete');const before=fs.readFileSync(boot,'utf8');await assert.rejects(run());assert.equal(fs.readFileSync(boot,'utf8'),before);
 await assert.rejects(ota({projectDir:root,nativeDir:native,bundleDir:path.join(native,'app'),stageDir:fs.mkdtempSync(path.join(work,'fail-')),platform:'ios',configuration:'release',nativeConfig:{...nativeConfig,id:'different'},architecture:'arm64',destinationKind:'simulator'}),e=>e.code==='unavailable');
 }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(work,{recursive:true,force:true});}
});
test('Android canonical adapter: actual SDK identity and fixture Gradle pins', {skip:!process.env.OTA_CONSUMER_DIR||!process.env.ANDROID_HOME},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'android-ota-'));const work=fs.mkdtempSync(path.join(os.tmpdir(),'android-ota-output-'));
 try{
 const consumer=path.resolve(process.env.OTA_CONSUMER_DIR);for(const f of ['package.json','bun.lock'])fs.copyFileSync(path.join(consumer,f),path.join(root,f));fs.symlinkSync(path.join(consumer,'node_modules'),path.join(root,'node_modules'),'dir');
 const nativeConfig={id:'org.test.ota',buildPath:'generated'};fs.writeFileSync(path.join(root,'nativescript.config.js'),'module.exports='+JSON.stringify(nativeConfig));fs.mkdirSync(path.join(root,'App_Resources/Android'),{recursive:true});
 const native=path.join(work,'native');const java='app/src/main/java/com/tns/NativeScriptApplication.java';const assets='app/src/main/assets/app';const manifest='app/src/main/AndroidManifest.xml';
 for(const [file,content] of [[java,'class Application { void start() { com.tns.Runtime runtime = RuntimeHelper.initRuntime(this); } }'],[assets+'/package.json','{"main":"bundle.js"}'],[manifest,'<manifest><application android:name="com.tns.NativeScriptApplication"/></manifest>'],['gradle.lockfile','org.fixture:lib:1.0=debugRuntimeClasspath\n']]){fs.mkdirSync(path.dirname(path.join(native,file)),{recursive:true});fs.writeFileSync(path.join(native,file),content);}
 const run=async(configuration='release')=>{const stage=fs.mkdtempSync(path.join(work,'stage-'));const result=await ota({projectDir:root,nativeDir:native,bundleDir:path.join(native,assets),stageDir:stage,platform:'android',configuration,nativeConfig,architecture:'arm64-v8a',destinationKind:'device'});return {result,stage};};
 const first=await run();assert.match(fs.readFileSync(path.join(first.stage,'native',java),'utf8'),new RegExp(first.result.hash));fs.copyFileSync(path.join(first.stage,'native',java),path.join(native,java));assert.equal((await run()).result.hash,first.result.hash);
 fs.writeFileSync(path.join(native,'gradle.lockfile'),'org.fixture:lib:2.0=debugRuntimeClasspath\n');assert.notEqual((await run()).result.hash,first.result.hash);assert.equal((await run('debug')).result.release,false);
 fs.writeFileSync(path.join(native,manifest),'<manifest><application android:name="Custom"/></manifest>');await assert.rejects(run());fs.unlinkSync(path.join(native,'gradle.lockfile'));await assert.rejects(run(),e=>e.code==='unavailable');
 }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(work,{recursive:true,force:true});}
});
test('canonical adapter rejects wrong producer version and modified producer bytes',{skip:!process.env.OTA_CONSUMER_DIR},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ota-version-'));const work=fs.mkdtempSync(path.join(os.tmpdir(),'ota-version-output-'));
 try{
 const consumer=path.resolve(process.env.OTA_CONSUMER_DIR);fs.writeFileSync(path.join(root,'package.json'),'{}');const modules=path.join(root,'node_modules/@octane-xplat');fs.mkdirSync(modules,{recursive:true});
 fs.cpSync(path.join(consumer,'node_modules/@octane-xplat/updates'),path.join(modules,'updates'),{recursive:true});fs.symlinkSync(path.join(consumer,'node_modules/@octane-xplat/fingerprint'),path.join(modules,'fingerprint'),'dir');
 const pkg=path.join(modules,'updates/package.json');const manifest=JSON.parse(fs.readFileSync(pkg));fs.writeFileSync(pkg,JSON.stringify({...manifest,version:'0.14.0'}));
 const input={projectDir:root,nativeDir:work,bundleDir:path.join(work,'app'),stageDir:path.join(work,'stage'),platform:'ios',configuration:'release',nativeConfig:{},architecture:'arm64',destinationKind:'simulator'};
 await assert.rejects(ota(input),e=>e.code==='unavailable');fs.writeFileSync(pkg,JSON.stringify(manifest));fs.appendFileSync(path.join(modules,'updates/prepare.cjs'),'\n// modified producer');await assert.rejects(ota(input),e=>e.code==='unavailable');
 }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(work,{recursive:true,force:true});}
});
