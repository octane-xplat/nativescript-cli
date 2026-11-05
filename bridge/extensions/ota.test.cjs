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
 const run=async(configuration='release',extensionNative=[])=>{const stage=fs.mkdtempSync(path.join(work,'stage-'));const result=await ota({projectDir:root,nativeDir:native,bundleDir:path.join(native,'app'),stageDir:stage,platform:'ios',configuration,nativeConfig,architecture:'arm64',destinationKind:'simulator',extensionNative});return {result,stage,record:JSON.parse(fs.readFileSync(path.join(stage,'native/.xplat/fingerprints/ios.json')))};};
 const first=await run();assert.match(first.result.hash,/^[a-f0-9]{64}$/);assert.match(fs.readFileSync(path.join(first.stage,'native/internal/main.m'),'utf8'),new RegExp(first.result.hash));
 assert.ok(first.record.sources.some(s=>JSON.stringify(s).includes('Podfile.lock')));assert.ok(first.record.sources.some(s=>JSON.stringify(s).includes('Package.resolved')));
 fs.copyFileSync(path.join(first.stage,'native/internal/main.m'),boot);
 assert.deepEqual((await run()).record,first.record);
 const relocated=path.join(work,'relocated-app');fs.cpSync(root,relocated,{recursive:true,dereference:false});const relocationStage=fs.mkdtempSync(path.join(work,'relocated-stage-'));
 const relocatedResult=await ota({projectDir:relocated,nativeDir:native,bundleDir:path.join(native,'app'),stageDir:relocationStage,platform:'ios',configuration:'release',nativeConfig,architecture:'arm64',destinationKind:'simulator'});assert.equal(relocatedResult.hash,first.result.hash);
 fs.writeFileSync(path.join(root,'app/app.js'),'// js two');assert.equal((await run()).result.hash,first.result.hash);
 const generated={owner:'native',version:'1.0.0',platform:'ios',kind:'source',path:'Injected.swift',sha256:require('node:crypto').createHash('sha256').update('class Injected {}').digest('hex')};
 const withNative=await run('release',[generated]);assert.notEqual(withNative.result.hash,first.result.hash);
 assert.ok(withNative.record.sources.some(s=>s.type==='contents'&&s.id==='xplat-ns/extension-native/v1'&&/^[a-f0-9]{64}$/.test(s.hash)));
 assert.equal((await run('release',[generated])).result.hash,withNative.result.hash);
 for(const [key,value] of Object.entries({owner:'another',version:'2.0.0',kind:'configuration',path:'Other.swift',sha256:'a'.repeat(64)}))assert.notEqual((await run('release',[{...generated,[key]:value}])).result.hash,withNative.result.hash,key);
 const second={...generated,owner:'second'};assert.equal((await run('release',[generated,second])).result.hash,(await run('release',[second,generated])).result.hash);
 const extensionRelocationStage=fs.mkdtempSync(path.join(work,'extension-relocated-stage-'));
 const extensionRelocated=await ota({projectDir:relocated,nativeDir:native,bundleDir:path.join(native,'app'),stageDir:extensionRelocationStage,platform:'ios',configuration:'release',nativeConfig,architecture:'arm64',destinationKind:'simulator',extensionNative:[generated]});assert.equal(extensionRelocated.hash,withNative.result.hash);
 assert.equal((await run()).result.hash,first.result.hash); // removal restores canonical identity
 const fingerprintConfig=path.join(root,'fingerprint.config.json');
 fs.writeFileSync(fingerprintConfig,JSON.stringify({extraSources:[{type:'contents',id:'caller-owned',contents:'preserved',reasons:['fixture']}]}));
 const preserved=await run('release',[generated]);assert.ok(preserved.record.sources.some(s=>s.id==='caller-owned'));assert.equal(JSON.parse(fs.readFileSync(fingerprintConfig)).extraSources.length,1);
 fs.writeFileSync(fingerprintConfig,JSON.stringify({extraSources:[{type:'contents',id:'xplat-ns/extension-native/v1',contents:'collision',reasons:[]}]}));await assert.rejects(run('release',[generated]),e=>e.code==='invalid_input');fs.unlinkSync(fingerprintConfig);
 fs.writeFileSync(path.join(root,'.fingerprintignore'),'xplat-ns/extension-native/**\n');await assert.rejects(run('release',[generated]),e=>e.code==='invalid_input');fs.unlinkSync(path.join(root,'.fingerprintignore'));
 await assert.rejects(run('release',[generated,generated]),e=>e.code==='invalid_input');
 assert.equal((await run()).result.hash,first.result.hash);
 const owned=path.join(root,'custom-state/project-id');const ownedNative=path.join(owned,'target/native');fs.mkdirSync(path.dirname(ownedNative),{recursive:true});fs.cpSync(native,ownedNative,{recursive:true});
 const ownedStage=fs.mkdtempSync(path.join(owned,'ota-'));const customOutput=await ota({projectDir:root,projectStateDir:owned,nativeDir:ownedNative,bundleDir:path.join(ownedNative,'app'),stageDir:ownedStage,platform:'ios',configuration:'release',nativeConfig,architecture:'arm64',destinationKind:'simulator',extensionNative:[generated]});assert.equal(customOutput.hash,withNative.result.hash);
 // Authored siblings of the owned state branch still enter native collection.
 fs.mkdirSync(path.join(root,'custom-state/authored'));fs.writeFileSync(path.join(root,'custom-state/authored/value'),'keep');
 const authoredStage=fs.mkdtempSync(path.join(owned,'ota-'));await ota({projectDir:root,projectStateDir:owned,nativeDir:ownedNative,bundleDir:path.join(ownedNative,'app'),stageDir:authoredStage,platform:'ios',configuration:'release',nativeConfig,architecture:'arm64',destinationKind:'simulator'});assert.equal(fs.readFileSync(path.join(authoredStage,'project/custom-state/authored/value'),'utf8'),'keep');
 fs.rmSync(path.join(root,'custom-state'),{recursive:true});
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
