'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const xcode=require('xcode');const bplistCreate=require('bplist-creator');const prepare=require('./index.cjs');
test('runtime graph membership, stable regeneration, removal and pin preservation',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p1 graph ')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const runtime=path.resolve('internal/ios/prepare/testdata/runtime');
 const contributions=[];
 for(const [name,kind,text] of [['Binding.swift','source','class Binding {}'],['Native.h','source','void example(void);'],['libNative.a','framework','fixture'],['Picture.png','resource','fixture'],['Compiled.metallib','resource','MTLB component fixture']]) {
  const file=path.join(dir,name);fs.writeFileSync(file,text);contributions.push({path:file,kind,platform:'ios',packageDirectory:dir});
 }
 const resources=path.join(dir,'App_Resources','iOS');fs.mkdirSync(resources,{recursive:true});
 for(const [name,text] of [['build.xcconfig','EXAMPLE = 1'],['Info.plist','<?xml version="1.0"?><plist version="1.0"><dict><key>NSCameraUsageDescription</key><string>Camera</string></dict></plist>']]) {
  const file=path.join(resources,name);fs.writeFileSync(file,text);contributions.push({path:file,kind:'configuration',platform:'ios',packageDirectory:dir});
 }
 for (const [name,dynamic] of [['Dynamic',true],['Static',false]]) {
  const framework=path.join(dir,name+'.framework');fs.mkdirSync(framework);
  const bytes=Buffer.alloc(32);if(dynamic){bytes.writeUInt32LE(0xfeedfacf,0);bytes.writeUInt32LE(6,12);}else bytes.write('!<arch>\n');
  fs.writeFileSync(path.join(framework,name),bytes);contributions.push({path:framework,kind:'framework',platform:'ios',packageDirectory:dir});
 }
 const r={directory:dir,applicationID:'org.example.test',revision:'fixture',config:{appResourcesPath:path.join(dir,'App_Resources')},packages:[{name:'@nativescript/ios',version:'8.9.0',directory:runtime}],contributions};
 const output=path.join(dir,'generated');const q={directory:output,resolved:r};await prepare(q);
 assert.equal(fs.existsSync(path.join(output,'Podfile')),false);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,'app/package.json'))),{main:'bundle.mjs'});
 const file=path.join(output,'NativeScriptApp.xcodeproj/project.pbxproj');
 let project=xcode.project(file);project.parseSync();
 const o=project.hash.project.objects;const owned=JSON.parse(fs.readFileSync(path.join(output,'.p1.json'))).ids;
 assert.ok(Object.values(o.PBXFileReference).some(v=>v&&v.path==='app'&&v.sourceTree==='SOURCE_ROOT'));
 const sources=Object.values(o.PBXSourcesBuildPhase).filter(v=>v&&typeof v==='object');
 assert.equal(sources.length,1); assert.ok(sources.some(v=>v.files.some(f=>owned.includes(f.value))));
 // Contributed references stay project-relative under <group> like upstream.
 const swiftRef=Object.values(o.PBXFileReference).find(v=>v&&v.name===JSON.stringify('Binding.swift'));
 assert.equal(swiftRef.path,JSON.stringify(path.relative(output,path.join(dir,'Binding.swift'))));
 assert.equal(swiftRef.sourceTree,'"<group>"');
 assert.equal(swiftRef.includeInIndex,0);
 assert.equal(swiftRef.fileEncoding,4);
 const shaderRef=Object.entries(o.PBXFileReference).find(([,v])=>v&&v.path===JSON.stringify(path.relative(output,path.join(dir,'Compiled.metallib'))))[0];
 const shaderBuild=Object.entries(o.PBXBuildFile).find(([,v])=>v&&v.fileRef===shaderRef)[0];
 assert.ok(Object.values(o.PBXResourcesBuildPhase).some(v=>v&&typeof v==='object'&&v.files.some(f=>f.value===shaderBuild)));
 assert.equal(sources.some(v=>v.files.some(f=>f.value===shaderBuild)),false);
 assert.ok(Object.values(o.PBXCopyFilesBuildPhase).some(v=>v&&typeof v==='object'&&v.files.length===1&&owned.includes(v.files[0].value)));
 assert.match(fs.readFileSync(path.join(output,'NativeScriptApp/NativeScriptApp-Info.plist'),'utf8'),/NSCameraUsageDescription/);
 // Contributed headers stay out of the app bridging header; plugin modulemaps
 // load through header-search-path discovery like upstream.
 assert.doesNotMatch(fs.readFileSync(path.join(output,'internal/Swift-ObjC-Bridging-Header.h'),'utf8'),/Native\.h/);
 assert.equal(fs.existsSync(path.join(output,'internal/NativeContributions')),false);
 const original=fs.readFileSync(file,'utf8');assert.doesNotMatch(original,/value = [A-F0-9]{24}/);assert.match(fs.readFileSync(path.join(output,'NativeScriptApp.xcodeproj/xcshareddata/xcschemes/NativeScriptApp.xcscheme'),'utf8'),/BlueprintName = "NativeScriptApp"/);await prepare(q);assert.equal(fs.readFileSync(file,'utf8'),original);
 // A non-owned graph edit and exact dependency pins survive regeneration.
 project=xcode.project(file);project.parseSync();project.hash.project.objects.PBXProject[project.hash.project.rootObject].developmentRegion='fr';fs.writeFileSync(file,project.writeSync());
 fs.writeFileSync(path.join(output,'Podfile.lock'),'pod-pin');fs.mkdirSync(path.join(output,'NativeScriptApp.xcodeproj/project.xcworkspace/xcshareddata/swiftpm'),{recursive:true});
 const pin=path.join(output,'NativeScriptApp.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved');fs.writeFileSync(pin,'spm-pin');
 r.contributions=[];await prepare(q);const removed=fs.readFileSync(file,'utf8');assert.doesNotMatch(removed,/Binding.swift|libNative.a|Picture.png|Compiled.metallib/);assert.match(removed,/developmentRegion = fr/);
 assert.equal(fs.readFileSync(pin,'utf8'),'spm-pin');assert.equal(fs.readFileSync(path.join(output,'Podfile.lock'),'utf8'),'pod-pin');assert.doesNotMatch(fs.readFileSync(path.join(output,'internal/Swift-ObjC-Bridging-Header.h'),'utf8'),/Native.h/);
 await prepare(q);assert.equal(fs.readFileSync(file,'utf8'),removed);
 r.contributions=null;await prepare(q);assert.equal(fs.readFileSync(file,'utf8'),removed);
});
test('Pods and local SPM membership and removal',{skip:process.platform!=='darwin'},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p1 dependencies '));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const swift=path.join(dir,'Package.swift');fs.writeFileSync(swift,'// swift-tools-version: 5.7\nimport PackageDescription\nlet package = Package(name: "Example", products: [.library(name: "Example", targets: ["Example"])], targets: [.target(name: "Example")])');
 const pod=path.join(dir,'Podfile');fs.writeFileSync(pod,"pod 'Example', '1.0'\n");
 const r={directory:dir,applicationID:'org.example.test',revision:'fixture',packages:[{name:'@nativescript/ios',version:'8.9.0',directory:path.resolve('internal/ios/prepare/testdata/runtime')}],contributions:[{platform:'ios',kind:'spm',path:swift},{platform:'ios',kind:'pods',path:pod}]};
 const q={directory:path.join(dir,'out'),resolved:r};const result=await prepare(q);assert.equal(result.spm,true);assert.equal(result.pods,true);
 const file=path.join(q.directory,'NativeScriptApp.xcodeproj/project.pbxproj');assert.match(fs.readFileSync(file,'utf8'),/XCLocalSwiftPackageReference/);assert.match(fs.readFileSync(file,'utf8'),/productName = "Example"/);assert.match(fs.readFileSync(path.join(q.directory,'Podfile'),'utf8'),/pod 'Example', '1\.0'/);assert.doesNotMatch(fs.readFileSync(path.join(q.directory,'Podfile'),'utf8'),/instance_eval/);
 const original=fs.readFileSync(file,'utf8');await prepare(q);assert.equal(fs.readFileSync(file,'utf8'),original);
 r.contributions=[];const removed=await prepare(q);assert.equal(removed.pods,true);assert.equal(removed.spm,true);assert.doesNotMatch(fs.readFileSync(file,'utf8'),/productName = "Example"/);
});

test('declared local SPM links requested library products and removes owned references',{skip:process.platform!=='darwin'},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p1 declared local '));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const manifest=path.join(dir,'Package.swift');
 fs.writeFileSync(manifest,'// swift-tools-version: 5.7\nimport PackageDescription\nlet package = Package(name: "Local", products: [.library(name: "Wanted", targets: ["Wanted"]), .library(name: "Unused", targets: ["Unused"]), .executable(name: "Tool", targets: ["Tool"])], targets: [.target(name: "Wanted"), .target(name: "Unused"), .executableTarget(name: "Tool")])');
 const c={platform:'ios',kind:'spm',packageDirectory:dir,path:manifest,spm:{name:'Local',path:'.',products:['Wanted']}};
 const sourceSHA256=require('node:crypto').createHash('sha256').update(fs.readFileSync(manifest)).digest('hex');
 const r={directory:dir,applicationID:'org.example.test',revision:'fixture',packages:[{name:'@nativescript/ios',version:'8.9.0',directory:path.resolve('internal/ios/prepare/testdata/runtime')}],contributions:[c],sources:[{path:manifest,digest:sourceSHA256}]};
 const q={directory:path.join(dir,'out'),resolved:r};const prepared=await prepare(q);
 assert.equal(prepared.localSwiftPackages.length,1);
 const evaluation=prepared.localSwiftPackages[0];
 assert.deepEqual({...evaluation,evaluation:undefined},{name:'Local',path:'.',products:['Wanted'],manifest,sourceSHA256,evaluation:undefined});
 assert.deepEqual(evaluation.evaluation.products.map(product=>product.name),['Wanted','Unused','Tool']);
 const file=path.join(q.directory,'NativeScriptApp.xcodeproj/project.pbxproj');
 const first=fs.readFileSync(file,'utf8');assert.match(first,/productName = "Wanted"/);assert.doesNotMatch(first,/productName = "(?:Unused|Tool)"/);
 await prepare(q);assert.equal(fs.readFileSync(file,'utf8'),first);
 c.spm.products=['Missing'];await assert.rejects(prepare(q),{code:'invalid_input'});assert.equal(fs.readFileSync(file,'utf8'),first);
 c.spm.products=['Tool'];await assert.rejects(prepare(q),{code:'unavailable'});assert.equal(fs.readFileSync(file,'utf8'),first);
 c.spm.products=['Wanted'];r.sources[0].digest='0'.repeat(64);await assert.rejects(prepare(q),{code:'invalid_input'});assert.equal(fs.readFileSync(file,'utf8'),first);
 r.contributions=[];const removed=await prepare(q);assert.deepEqual(removed.localSwiftPackages,[]);assert.doesNotMatch(fs.readFileSync(file,'utf8'),/productName = "Wanted"/);
});

test('unqualified runtime versions fail before template materialization', async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p1-version-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const prepare=require('./index.cjs');
 for(const version of ['9.0.0','9.1.1','10.0.0']) {
  await assert.rejects(prepare({resolved:{applicationID:'org.example.test',packages:[{name:'@nativescript/ios',version,directory:path.resolve('internal/ios/prepare/testdata/runtime')}]},directory:path.join(dir,version)}),e=>e.code==='unavailable');
  assert.equal(fs.existsSync(path.join(dir,version)),false);
 }
});

test('declared Swift evaluation rejects a replaced symlink manifest',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p1 changing manifest '));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const manifest=path.join(dir,'Package.swift');
 const body='// same leased bytes through an unexpected symlink';
 const replacement=path.join(dir,'replacement.swift');fs.writeFileSync(replacement,body);fs.symlinkSync(replacement,manifest);
 const digest=require('node:crypto').createHash('sha256').update(body).digest('hex');
 const resolved={directory:dir,applicationID:'org.example.changing',revision:'fixture',packages:[{name:'@nativescript/ios',version:'8.9.0',directory:path.resolve('internal/ios/prepare/testdata/runtime')}],sources:[{path:manifest,digest}],contributions:[{platform:'ios',kind:'spm',path:manifest,spm:{name:'Changing',path:'.',products:['Changing']}}]};
 await assert.rejects(prepare({resolved,directory:path.join(dir,'out')}),{code:'invalid_input'});
 assert.equal(fs.readFileSync(manifest,'utf8'),body);
});

test('iOS XCFramework validation ignores unrelated platform slices and retains module maps',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p1 core '));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const framework=path.join(dir,'Probe.xcframework');const slice=path.join(framework,'ios-arm64/Probe.framework');fs.mkdirSync(slice,{recursive:true});
 const bytes=Buffer.alloc(32);bytes.write('!<arch>\n');fs.writeFileSync(path.join(slice,'Probe'),bytes);
 const plist=require('plist');fs.writeFileSync(path.join(framework,'Info.plist'),plist.build({AvailableLibraries:[{LibraryIdentifier:'ios-arm64',LibraryPath:'Probe.framework',SupportedPlatform:'ios'},{LibraryIdentifier:'macos',LibraryPath:'Missing.framework',SupportedPlatform:'macos'}]}));
 const modulemap=path.join(dir,'qualified-includes/module.modulemap');fs.mkdirSync(path.dirname(modulemap));fs.writeFileSync(modulemap,'module Probe { export * }');
 const resolved={directory:dir,applicationID:'org.example.test',revision:'fixture',packages:[{name:'@nativescript/ios',version:'8.9.0',directory:path.resolve('internal/ios/prepare/testdata/runtime')}],contributions:[{path:framework,kind:'framework',platform:'ios',packageDirectory:dir},{path:modulemap,kind:'configuration',platform:'ios',packageDirectory:dir}]};
 const output=path.join(dir,'out');await prepare({resolved,directory:output});
 const flags=fs.readFileSync(path.join(output,'plugins-release.xcconfig'),'utf8');assert.doesNotMatch(flags,/-fmodule-map-file/);
 const configured=xcode.project(path.join(output,'NativeScriptApp.xcodeproj/project.pbxproj'));configured.parseSync();
 const targetSettings=Object.values(configured.hash.project.objects.XCBuildConfiguration).filter(v=>v&&typeof v==='object').map(v=>v.buildSettings).filter(v=>Array.isArray(v.HEADER_SEARCH_PATHS));assert.equal(targetSettings.length,2);
 for(const settings of targetSettings)assert.ok(settings.HEADER_SEARCH_PATHS.some(value=>value.includes(path.relative(output,path.dirname(modulemap)))),'module map include root must resolve nested angle-bracket imports');
 resolved.contributions=[];await prepare({resolved,directory:output});assert.doesNotMatch(fs.readFileSync(path.join(output,'plugins-release.xcconfig'),'utf8'),/-fmodule-map-file/);
 assert.doesNotMatch(fs.readFileSync(path.join(output,'NativeScriptApp.xcodeproj/project.pbxproj'),'utf8'),/qualified-includes/);
 resolved.contributions=[{path:framework,kind:'framework',platform:'ios',packageDirectory:dir}];fs.unlinkSync(path.join(slice,'Probe'));
 await assert.rejects(prepare({resolved,directory:path.join(dir,'invalid')}),e=>e.code==='unavailable');
});

test('remote Swift package requirements/products preserve ownership through repeat/removal',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'remote-spm-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const config=path.join(dir,'nativescript.config.js');fs.writeFileSync(config,'module.exports={}');
 const r={directory:dir,applicationID:'org.example.remote',revision:'fixture',packages:[{name:'@nativescript/ios',version:'8.9.0',directory:path.resolve('internal/ios/prepare/testdata/runtime')}],contributions:[]};
 const declared=(name,url,version,products)=>({packageDirectory:dir,platform:'ios',kind:'spm-remote',path:config,spm:{name,repositoryURL:url,version,products}});
 r.contributions=[declared('Pulsar','https://github.com/software-mansion-labs/pulsar-ios','1.4.0',['Pulsar']),declared('Aztec','https://github.com/wordpress-mobile/AztecEditor-iOS','#'+'a'.repeat(40),['Aztec'])];
 const q={directory:path.join(dir,'out'),resolved:r};assert.equal((await prepare(q)).spm,true);
 const file=path.join(q.directory,'NativeScriptApp.xcodeproj/project.pbxproj');
 const parse=()=>{const p=xcode.project(file);p.parseSync();return p;};
 const entries=section=>Object.entries(section??{}).filter(([k,v])=>!k.endsWith('_comment')&&v&&typeof v==='object');
 const unquote=v=>{try{return JSON.parse(v);}catch{return v;}};
 let p=parse(),o=p.hash.project.objects;
 assert.equal(entries(o.XCRemoteSwiftPackageReference).length,2);
 const requirements=entries(o.XCRemoteSwiftPackageReference).map(([,v])=>Object.fromEntries(Object.entries(v.requirement).map(([k,v])=>[k,unquote(v)])));
 assert.ok(requirements.some(r=>r.kind==='exactVersion'&&r.version==='1.4.0'));assert.ok(requirements.some(r=>r.kind==='revision'&&r.revision==='a'.repeat(40)));
 assert.deepEqual(entries(o.XCSwiftPackageProductDependency).map(([,v])=>unquote(v.productName)).sort(),['Aztec','Pulsar']);
 const original=fs.readFileSync(file,'utf8');await prepare(q);assert.equal(fs.readFileSync(file,'utf8'),original);
 p=parse();o=p.hash.project.objects;const unrelated='ABCDEFABCDEFABCDEFABCDEF';
 o.XCRemoteSwiftPackageReference[unrelated]={isa:'XCRemoteSwiftPackageReference',repositoryURL:'"https://example.com/keep"',requirement:{kind:'exactVersion',version:'"1.0.0"'}};
 o.PBXProject[p.hash.project.rootObject].packageReferences.push({value:unrelated,comment:'unrelated'});fs.writeFileSync(file,p.writeSync());
 const pin=path.join(q.directory,'NativeScriptApp.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved');fs.mkdirSync(path.dirname(pin),{recursive:true});fs.writeFileSync(pin,'fixture-retained-pin');
 r.contributions=[];assert.equal((await prepare(q)).spm,true);p=parse();o=p.hash.project.objects;
 assert.equal(entries(o.XCRemoteSwiftPackageReference).length,1);assert.ok(o.XCRemoteSwiftPackageReference[unrelated]);assert.equal(entries(o.XCSwiftPackageProductDependency).length,0);assert.equal(fs.readFileSync(pin,'utf8'),'fixture-retained-pin');
 const removed=fs.readFileSync(file,'utf8');await prepare(q);assert.equal(fs.readFileSync(file,'utf8'),removed);
 r.contributions=[declared('Keep','https://example.com/keep','2.0.0',['Keep'])];await assert.rejects(prepare(q),e=>e.code==='unavailable');assert.equal(fs.readFileSync(file,'utf8'),removed);
});

test('binary property lists from installed packages merge and classify like XML',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p1 bplist '));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 // A binary platform-root Info.plist contribution merges into the generated
 // app manifest; a binary plist outside the manifest site does not.
 const plugin=path.join(dir,'plugin','platforms','ios');fs.mkdirSync(path.join(plugin,'src'),{recursive:true});
 const info=path.join(plugin,'Info.plist');fs.writeFileSync(info,bplistCreate({NSCameraUsageDescription:'Binary camera'}));
 assert.equal(fs.readFileSync(info).subarray(0,8).toString('latin1'),'bplist00');
 const nested=path.join(plugin,'src','Info.plist');fs.writeFileSync(nested,bplistCreate({CFBundleIdentifier:'com.plugin.framework'}));
 // Binary xcframework metadata still classifies the embedded slices.
 const framework=path.join(dir,'Binary.xcframework');const slice=path.join(framework,'ios-arm64-simulator/Binary.framework');fs.mkdirSync(slice,{recursive:true});
 const bytes=Buffer.alloc(32);bytes.writeUInt32LE(0xfeedfacf,0);bytes.writeUInt32LE(6,12);fs.writeFileSync(path.join(slice,'Binary'),bytes);
 fs.writeFileSync(path.join(framework,'Info.plist'),bplistCreate({AvailableLibraries:[{LibraryIdentifier:'ios-arm64-simulator',LibraryPath:'Binary.framework',SupportedPlatform:'ios',SupportedPlatformVariant:'simulator'}]}));
 const resolved={directory:dir,applicationID:'org.example.bplist',revision:'fixture',packages:[{name:'@nativescript/ios',version:'8.9.0',directory:path.resolve('internal/ios/prepare/testdata/runtime')}],contributions:[{path:info,kind:'configuration',platform:'ios',packageDirectory:path.dirname(path.dirname(plugin))},{path:nested,kind:'configuration',platform:'ios',packageDirectory:path.dirname(path.dirname(plugin))},{path:framework,kind:'framework',platform:'ios',packageDirectory:dir}]};
 const output=path.join(dir,'out');await prepare({resolved,directory:output});
 const manifest=fs.readFileSync(path.join(output,'NativeScriptApp/NativeScriptApp-Info.plist'),'utf8');
 assert.match(manifest,/<key>NSCameraUsageDescription<\/key>\s*<string>Binary camera<\/string>/);
 assert.doesNotMatch(manifest,/com\.plugin\.framework/);
 assert.match(manifest,/<key>CFBundleIdentifier<\/key>\s*<string>\$\(PRODUCT_BUNDLE_IDENTIFIER\)<\/string>/);
 // The binary xcmanifest classified its slice as dynamic, so it is embedded.
 const objects=(p=>{p.parseSync();return p.hash.project.objects;})(xcode.project(path.join(output,'NativeScriptApp.xcodeproj/project.pbxproj')));
 const ref=Object.entries(objects.PBXFileReference).find(([,v])=>v&&v.path===JSON.stringify(path.relative(output,framework)))[0];
 const embed=Object.entries(objects.PBXBuildFile).find(([,v])=>v&&v.fileRef===ref&&v.settings&&Array.isArray(v.settings.ATTRIBUTES))[0];
 assert.ok(Object.values(objects.PBXCopyFilesBuildPhase).some(v=>v&&Array.isArray(v.files)&&v.files.some(f=>f.value===embed)));
 // A truncated binary payload rejects before Xcode rather than parsing partially.
 fs.writeFileSync(info,fs.readFileSync(info).subarray(0,16));
 await assert.rejects(prepare({resolved,directory:path.join(dir,'invalid')}),e=>e.code==='unavailable');
});

test('plugin Podfiles inline inside the target with re-hosted hooks and a merged platform section',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p1 podfile '));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const runtime=path.resolve('internal/ios/prepare/testdata/runtime');
 const plugin=path.join(dir,'plugin'),older=path.join(dir,'older');
 fs.mkdirSync(path.join(plugin,'platforms','ios'),{recursive:true});fs.mkdirSync(path.join(older,'platforms','ios'),{recursive:true});
 const podfile=path.join(plugin,'platforms','ios','Podfile');fs.writeFileSync(podfile,"platform :ios, '13.0'\nuse_frameworks!\npod 'Dep', '~> 1.0'\npost_install do |installer|\n  puts 'plugin'\nend\n");
 const lower=path.join(older,'platforms','ios','Podfile');fs.writeFileSync(lower,"platform :ios, '12.0'\npod 'Older'\n");
 const resources=path.join(dir,'App_Resources','iOS');fs.mkdirSync(resources,{recursive:true});
 const appPod=path.join(resources,'Podfile');fs.writeFileSync(appPod,"post_install do |installer|\n  puts 'app'\nend\n");
 const resolved={directory:dir,applicationID:'org.example.pods',revision:'fixture',config:{appResourcesPath:path.join(dir,'App_Resources')},packages:[{name:'@nativescript/ios',version:'8.9.0',directory:runtime},{name:'@scope/plugin',version:'1.0.0',directory:plugin},{name:'older',version:'1.0.0',directory:older}],dependencyOrder:[older,plugin],contributions:[{platform:'ios',kind:'pods',path:podfile,packageDirectory:plugin},{platform:'ios',kind:'pods',path:lower,packageDirectory:older},{platform:'ios',kind:'pods',path:appPod,packageDirectory:dir}]};
 const out=path.join(dir,'out');await prepare({resolved,directory:out});
 const generated=fs.readFileSync(path.join(out,'Podfile'),'utf8');
 assert.match(generated,/^use_frameworks!\n\ntarget "NativeScriptApp" do\n/);
 // Upstream's footer has no trailing newline.
 assert.match(generated,/\nend$/);
 // Plugin blocks apply in breadth-first dependency order, not path order.
 assert.ok(generated.indexOf(`# Begin Podfile - ${lower}`)<generated.indexOf(`# Begin Podfile - ${podfile}`));
 assert.doesNotMatch(generated,/instance_eval/);
 // Plugin bodies sit verbatim between markers; platform rows are commented and
 // the highest declared version survives as the single platform section.
 assert.match(generated,new RegExp(`# Begin Podfile - ${podfile.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n`));
 assert.match(generated,/# platform :ios, '13\.0'/);
 assert.match(generated,/# platform :ios, '12\.0'/);
 assert.match(generated,new RegExp(`# NativeScriptPlatformSection ${podfile.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')} with 13\\.0\\nplatform :ios, '13\\.0'\\n# End NativeScriptPlatformSection`));
 // post_install blocks become named functions called from one hook; the app
 // Podfile applies last under the NSPodfileBase name.
 assert.match(generated,/def post_install_scope_plugin_0 \(installer\)\n  puts 'plugin'\nend/);
 assert.match(generated,/def post_installNSPodfileBase_0 \(installer\)\n  puts 'app'\nend/);
 assert.match(generated,/post_install do \|installer\|\n  post_install_scope_plugin_0 installer\n  post_installNSPodfileBase_0 installer\nend/);
 // The plugin's own use_frameworks! survives inside its inlined body.
 assert.match(generated,/# Begin Podfile[\s\S]*?use_frameworks!\n/);
});

test('manifest merges apply plugin keys, keep app identity, and register the identifier scheme outside release',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p1 manifest '));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const runtime=path.resolve('internal/ios/prepare/testdata/runtime');
 const plugin=path.join(dir,'plugin');fs.mkdirSync(path.join(plugin,'platforms','ios','src'),{recursive:true});
 fs.writeFileSync(path.join(plugin,'platforms','ios','Info.plist'),'<?xml version="1.0"?><plist version="1.0"><dict><key>NSFaceIDUsageDescription</key><string>Face</string><key>CFBundleIdentifier</key><string>com.plugin.identity</string><key>UIBackgroundModes</key><array><string>fetch</string></array></dict></plist>');
 // A plist outside the platform root never reaches the app manifest.
 fs.writeFileSync(path.join(plugin,'platforms','ios','src','Info.plist'),'<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.plugin.framework</string></dict></plist>');
 const resources=path.join(dir,'App_Resources','iOS');fs.mkdirSync(resources,{recursive:true});
 fs.writeFileSync(path.join(resources,'Info.plist'),'<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundlePackageType</key><string>APPL</string><key>UIBackgroundModes</key><array><string>audio</string></array><key>CFBundleURLTypes</key><array><dict><key>CFBundleTypeRole</key><string>Viewer</string><key>CFBundleURLSchemes</key><array><string>app</string></array></dict></array></dict></plist>');
 const contributions=['platforms/ios/Info.plist','platforms/ios/src/Info.plist'].map(f=>({platform:'ios',kind:'configuration',path:path.join(plugin,f),packageDirectory:plugin}));
 contributions.push({platform:'ios',kind:'configuration',path:path.join(resources,'Info.plist'),packageDirectory:dir});
 const resolved={directory:dir,applicationID:'org.example.app',revision:'fixture',config:{appResourcesPath:path.join(dir,'App_Resources')},packages:[{name:'@nativescript/ios',version:'8.9.0',directory:runtime}],contributions};
 const manifest=async configuration=>{const out=path.join(dir,'out-'+configuration);await prepare({resolved,directory:out,configuration});return fs.readFileSync(path.join(out,'NativeScriptApp/NativeScriptApp-Info.plist'),'utf8');};
 const debug=await manifest('debug');
 assert.match(debug,/<key>NSFaceIDUsageDescription<\/key>/);
 assert.doesNotMatch(debug,/com\.plugin\.(identity|framework)/);
 assert.match(debug,/<key>CFBundleIdentifier<\/key>\s*<string>\$\(PRODUCT_BUNDLE_IDENTIFIER\)<\/string>/);
 // The app array wins over the plugin's while the generated Editor scheme is
 // appended for non-release builds.
 assert.match(debug,/<key>UIBackgroundModes<\/key>\s*<array>\s*<string>audio<\/string>/);
 assert.match(debug,/<string>orgexampleapp<\/string>/);
 assert.match(debug,/<string>Viewer<\/string>/);
 const release=await manifest('release');
 assert.doesNotMatch(release,/orgexampleapp/);
});

test('plugin xcconfigs merge behind the app xcconfig and expose the app node_modules alias',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p1 xcconfig '));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const runtime=path.resolve('internal/ios/prepare/testdata/runtime');
 fs.mkdirSync(path.join(dir,'node_modules'),{recursive:true});
 const resources=path.join(dir,'App_Resources','iOS');fs.mkdirSync(resources,{recursive:true});
 fs.writeFileSync(path.join(resources,'build.xcconfig'),'OTHER_LDFLAGS = $(inherited) -framework "App"\nAPP_ONLY = app\nSHARED = app\n');
 const plugin=path.join(dir,'plugin');fs.mkdirSync(path.join(plugin,'platforms','ios'),{recursive:true});
 fs.writeFileSync(path.join(plugin,'platforms','ios','build.xcconfig'),'OTHER_LDFLAGS = $(inherited) -framework "Plugin"\nSHARED = plugin\nPLUGIN_ONLY = -l"z"\n');
 // An xcconfig outside the manifest site is a project file, not merged input.
 fs.writeFileSync(path.join(plugin,'platforms','ios','extra.xcconfig'),'IGNORED = yes\n');
 const resolved={directory:dir,applicationID:'org.example.xc',revision:'fixture',config:{appResourcesPath:path.join(dir,'App_Resources')},packages:[{name:'@nativescript/ios',version:'8.9.0',directory:runtime}],contributions:[{platform:'ios',kind:'configuration',path:path.join(resources,'build.xcconfig'),packageDirectory:dir},{platform:'ios',kind:'configuration',path:path.join(plugin,'platforms','ios','build.xcconfig'),packageDirectory:plugin},{platform:'ios',kind:'configuration',path:path.join(plugin,'platforms','ios','extra.xcconfig'),packageDirectory:plugin}]};
 const out=path.join(dir,'generated','platforms','ios');await prepare({resolved,directory:out});
 const merged=fs.readFileSync(path.join(out,'plugins-debug.xcconfig'),'utf8');
 // CocoaPods keys merge after pod install, never through an #include? row.
 assert.doesNotMatch(merged,/#include/);
 assert.match(merged,/^OTHER_LDFLAGS = \$\(inherited\) -framework "App" -framework "Plugin"$/m);
 assert.match(merged,/^APP_ONLY = app$/m);
 assert.match(merged,/^SHARED = app$/m);
 assert.match(merged,/^PLUGIN_ONLY = -l"z"$/m);
 // The template entitlements file earns its row like upstream's merge.
 assert.match(merged,/^CODE_SIGN_ENTITLEMENTS = NativeScriptApp\/NativeScriptApp\.entitlements$/m);
 assert.doesNotMatch(merged,/IGNORED/);
 // $(SRCROOT)/../../node_modules resolves to the app's install even for a
 // detached output directory.
 const alias=path.join(dir,'generated','node_modules');
 assert.ok(fs.lstatSync(alias).isSymbolicLink());
 assert.equal(fs.realpathSync(alias),fs.realpathSync(path.join(dir,'node_modules')));
});

test('pod xcconfigs merge onto kept plugin values after pod install',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p1 podmerge '));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const runtime=path.resolve('internal/ios/prepare/testdata/runtime');
 const mergePods=require('./podxcconfig.cjs');
 const plugin=path.join(dir,'plugin');fs.mkdirSync(path.join(plugin,'platforms','ios'),{recursive:true});
 fs.writeFileSync(path.join(plugin,'platforms','ios','build.xcconfig'),'FRAMEWORK_SEARCH_PATHS = $(inherited) "$(SRCROOT)/plugin"\nOTHER_LDFLAGS = $(inherited) -ObjC -liconv -framework "Plugin"\n');
 const resolved={directory:dir,applicationID:'org.example.podmerge',revision:'fixture',packages:[{name:'@nativescript/ios',version:'8.9.0',directory:runtime}],contributions:[{platform:'ios',kind:'configuration',path:path.join(plugin,'platforms','ios','build.xcconfig'),packageDirectory:plugin}]};
 const out=path.join(dir,'out');await prepare({resolved,directory:out});
 // Without the Pods target-support directory the merge is a no-op, matching
 // upstream's podFolder existence gate.
 let result=await mergePods({directory:out,target:'NativeScriptApp'});
 assert.deepEqual(result,{directory:out,merged:[]});
 const podSupport=path.join(out,'Pods','Target Support Files','Pods-NativeScriptApp');fs.mkdirSync(podSupport,{recursive:true});
 fs.writeFileSync(path.join(podSupport,'Pods-NativeScriptApp.debug.xcconfig'),'FRAMEWORK_SEARCH_PATHS = $(inherited) "${PODS_CONFIGURATION_BUILD_DIR}/Dep"\nOTHER_LDFLAGS = $(inherited) -l"sqlite3" -framework "Dep" -weak_framework "Weak"\nOTHER_SWIFT_FLAGS = $(inherited) -D COCOAPODS\nPODS_ROOT = ${SRCROOT}/Pods\n');
 fs.writeFileSync(path.join(podSupport,'Pods-NativeScriptApp.release.xcconfig'),'PODS_ROOT = ${SRCROOT}/Pods\n');
 result=await mergePods({directory:out,target:'NativeScriptApp'});
 assert.deepEqual(result.merged.sort(),['plugins-debug.xcconfig','plugins-release.xcconfig'].map(f=>path.join(out,f)).sort());
 const merged=fs.readFileSync(path.join(out,'plugins-debug.xcconfig'),'utf8');
 // Kept $(inherited) values absorb the pod remainder; pod-only keys append.
 assert.match(merged,/^FRAMEWORK_SEARCH_PATHS = \$\(inherited\) "\$\(SRCROOT\)\/plugin" "\$\{PODS_CONFIGURATION_BUILD_DIR\}\/Dep"$/m);
 // Linker fragments dedupe and serialize through CocoaPods' flag sets.
 assert.match(merged,/^OTHER_LDFLAGS = \$\(inherited\) -ObjC -l"iconv" -l"sqlite3" -framework "Dep" -framework "Plugin" -weak_framework "Weak"$/m);
 assert.match(merged,/^OTHER_SWIFT_FLAGS = \$\(inherited\) -D COCOAPODS$/m);
 assert.match(merged,/^PODS_ROOT = \$\{SRCROOT\}\/Pods$/m);
 const release=fs.readFileSync(path.join(out,'plugins-release.xcconfig'),'utf8');
 assert.match(release,/^PODS_ROOT = \$\{SRCROOT\}\/Pods$/m);
 assert.doesNotMatch(release,/-D COCOAPODS/);
 // A repeated merge is stable and leaves identical bytes untouched.
 const before=fs.readFileSync(path.join(out,'plugins-debug.xcconfig'),'utf8');
 await mergePods({directory:out,target:'NativeScriptApp'});
 assert.equal(fs.readFileSync(path.join(out,'plugins-debug.xcconfig'),'utf8'),before);
});
