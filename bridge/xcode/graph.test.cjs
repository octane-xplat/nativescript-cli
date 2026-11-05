'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const xcode=require('xcode');const prepare=require('./index.cjs');
test('runtime graph membership, stable regeneration, removal and pin preservation',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p1 graph ')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const runtime=path.resolve('internal/ios/prepare/testdata/runtime');
 const contributions=[];
 for(const [name,kind,text] of [['Binding.swift','source','class Binding {}'],['Native.h','source','void example(void);'],['libNative.a','framework','fixture'],['Picture.png','resource','fixture'],['Compiled.metallib','resource','MTLB component fixture'],['build.xcconfig','configuration','EXAMPLE = 1'],['Info.plist','configuration','<?xml version="1.0"?><plist version="1.0"><dict><key>NSCameraUsageDescription</key><string>Camera</string></dict></plist>']]) {
  const file=path.join(dir,name);fs.writeFileSync(file,text);contributions.push({path:file,kind,platform:'ios',packageDirectory:dir});
 }
 for (const [name,dynamic] of [['Dynamic',true],['Static',false]]) {
  const framework=path.join(dir,name+'.framework');fs.mkdirSync(framework);
  const bytes=Buffer.alloc(32);if(dynamic){bytes.writeUInt32LE(0xfeedfacf,0);bytes.writeUInt32LE(6,12);}else bytes.write('!<arch>\n');
  fs.writeFileSync(path.join(framework,name),bytes);contributions.push({path:framework,kind:'framework',platform:'ios',packageDirectory:dir});
 }
 const r={directory:dir,applicationID:'org.example.test',revision:'fixture',packages:[{name:'@nativescript/ios',version:'8.9.0',directory:runtime}],contributions};
 const output=path.join(dir,'generated');const q={directory:output,resolved:r};await prepare(q);
 assert.equal(fs.existsSync(path.join(output,'Podfile')),false);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,'app/package.json'))),{main:'bundle.js'});
 const file=path.join(output,'NativeScriptApp.xcodeproj/project.pbxproj');
 let project=xcode.project(file);project.parseSync();
 const o=project.hash.project.objects;const owned=JSON.parse(fs.readFileSync(path.join(output,'.p1.json'))).ids;
 assert.ok(Object.values(o.PBXFileReference).some(v=>v&&v.path==='app'&&v.sourceTree==='SOURCE_ROOT'));
 const sources=Object.values(o.PBXSourcesBuildPhase).filter(v=>v&&typeof v==='object');
 assert.equal(sources.length,1); assert.ok(sources.some(v=>v.files.some(f=>owned.includes(f.value))));
 const shaderRef=Object.entries(o.PBXFileReference).find(([,v])=>v&&v.path===JSON.stringify(path.join(dir,'Compiled.metallib')))[0];
 const shaderBuild=Object.entries(o.PBXBuildFile).find(([,v])=>v&&v.fileRef===shaderRef)[0];
 assert.ok(Object.values(o.PBXResourcesBuildPhase).some(v=>v&&typeof v==='object'&&v.files.some(f=>f.value===shaderBuild)));
 assert.equal(sources.some(v=>v.files.some(f=>f.value===shaderBuild)),false);
 assert.ok(Object.values(o.PBXCopyFilesBuildPhase).some(v=>v&&typeof v==='object'&&v.files.length===1&&owned.includes(v.files[0].value)));
 assert.match(fs.readFileSync(path.join(output,'NativeScriptApp/NativeScriptApp-Info.plist'),'utf8'),/NSCameraUsageDescription/);
 assert.match(fs.readFileSync(path.join(output,'internal/Swift-ObjC-Bridging-Header.h'),'utf8'),/Native.h/);
 const original=fs.readFileSync(file,'utf8');assert.doesNotMatch(original,/value = [A-F0-9]{24}/);assert.match(fs.readFileSync(path.join(output,'NativeScriptApp.xcodeproj/xcshareddata/xcschemes/NativeScriptApp.xcscheme'),'utf8'),/BlueprintName = "NativeScriptApp"/);await prepare(q);assert.equal(fs.readFileSync(file,'utf8'),original);
 // A non-owned graph edit and exact dependency pins survive regeneration.
 project=xcode.project(file);project.parseSync();project.hash.project.objects.PBXProject[project.hash.project.rootObject].developmentRegion='fr';fs.writeFileSync(file,project.writeSync());
 fs.writeFileSync(path.join(output,'Podfile.lock'),'pod-pin');fs.mkdirSync(path.join(output,'NativeScriptApp.xcodeproj/project.xcworkspace/xcshareddata/swiftpm'),{recursive:true});
 const pin=path.join(output,'NativeScriptApp.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved');fs.writeFileSync(pin,'spm-pin');
 r.contributions=[];await prepare(q);const removed=fs.readFileSync(file,'utf8');assert.doesNotMatch(removed,/Binding.swift|libNative.a|Picture.png|Compiled.metallib/);assert.match(removed,/developmentRegion = fr/);
 assert.equal(fs.readFileSync(pin,'utf8'),'spm-pin');assert.equal(fs.readFileSync(path.join(output,'Podfile.lock'),'utf8'),'pod-pin');assert.doesNotMatch(fs.readFileSync(path.join(output,'internal/Swift-ObjC-Bridging-Header.h'),'utf8'),/Native.h/);
 await prepare(q);assert.equal(fs.readFileSync(file,'utf8'),removed);
});
test('Pods and local SPM membership and removal',{skip:process.platform!=='darwin'},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p1 dependencies '));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const swift=path.join(dir,'Package.swift');fs.writeFileSync(swift,'// swift-tools-version: 5.7\nimport PackageDescription\nlet package = Package(name: "Example", products: [.library(name: "Example", targets: ["Example"])], targets: [.target(name: "Example")])');
 const pod=path.join(dir,'Podfile');fs.writeFileSync(pod,"pod 'Example', '1.0'\n");
 const r={directory:dir,applicationID:'org.example.test',revision:'fixture',packages:[{name:'@nativescript/ios',version:'8.9.0',directory:path.resolve('internal/ios/prepare/testdata/runtime')}],contributions:[{platform:'ios',kind:'spm',path:swift},{platform:'ios',kind:'pods',path:pod}]};
 const q={directory:path.join(dir,'out'),resolved:r};const result=await prepare(q);assert.equal(result.spm,true);assert.equal(result.pods,true);
 const file=path.join(q.directory,'NativeScriptApp.xcodeproj/project.pbxproj');assert.match(fs.readFileSync(file,'utf8'),/XCLocalSwiftPackageReference/);assert.match(fs.readFileSync(file,'utf8'),/productName = "Example"/);assert.match(fs.readFileSync(path.join(q.directory,'Podfile'),'utf8'),/instance_eval/);
 const original=fs.readFileSync(file,'utf8');await prepare(q);assert.equal(fs.readFileSync(file,'utf8'),original);
 r.contributions=[];const removed=await prepare(q);assert.equal(removed.pods,true);assert.equal(removed.spm,true);assert.doesNotMatch(fs.readFileSync(file,'utf8'),/productName = "Example"/);
});

test('declared local SPM links requested library products and removes owned references',{skip:process.platform!=='darwin'},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p1 declared local '));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const manifest=path.join(dir,'Package.swift');
 fs.writeFileSync(manifest,'// swift-tools-version: 5.7\nimport PackageDescription\nlet package = Package(name: "Local", products: [.library(name: "Wanted", targets: ["Wanted"]), .library(name: "Unused", targets: ["Unused"]), .executable(name: "Tool", targets: ["Tool"])], targets: [.target(name: "Wanted"), .target(name: "Unused"), .executableTarget(name: "Tool")])');
 const c={platform:'ios',kind:'spm',packageDirectory:dir,path:manifest,spm:{name:'Local',path:'.',products:['Wanted']}};
 const r={directory:dir,applicationID:'org.example.test',revision:'fixture',packages:[{name:'@nativescript/ios',version:'8.9.0',directory:path.resolve('internal/ios/prepare/testdata/runtime')}],contributions:[c]};
 const q={directory:path.join(dir,'out'),resolved:r};await prepare(q);
 const file=path.join(q.directory,'NativeScriptApp.xcodeproj/project.pbxproj');
 const first=fs.readFileSync(file,'utf8');assert.match(first,/productName = "Wanted"/);assert.doesNotMatch(first,/productName = "(?:Unused|Tool)"/);
 await prepare(q);assert.equal(fs.readFileSync(file,'utf8'),first);
 c.spm.products=['Missing'];await assert.rejects(prepare(q),{code:'invalid_input'});assert.equal(fs.readFileSync(file,'utf8'),first);
 c.spm.products=['Tool'];await assert.rejects(prepare(q),{code:'unavailable'});assert.equal(fs.readFileSync(file,'utf8'),first);
 r.contributions=[];await prepare(q);assert.doesNotMatch(fs.readFileSync(file,'utf8'),/productName = "Wanted"/);
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

test('iOS XCFramework validation ignores unrelated platform slices and retains module maps',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p1 core '));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const framework=path.join(dir,'Probe.xcframework');const slice=path.join(framework,'ios-arm64/Probe.framework');fs.mkdirSync(slice,{recursive:true});
 const bytes=Buffer.alloc(32);bytes.write('!<arch>\n');fs.writeFileSync(path.join(slice,'Probe'),bytes);
 const plist=require('plist');fs.writeFileSync(path.join(framework,'Info.plist'),plist.build({AvailableLibraries:[{LibraryIdentifier:'ios-arm64',LibraryPath:'Probe.framework',SupportedPlatform:'ios'},{LibraryIdentifier:'macos',LibraryPath:'Missing.framework',SupportedPlatform:'macos'}]}));
 const modulemap=path.join(dir,'qualified-includes/module.modulemap');fs.mkdirSync(path.dirname(modulemap));fs.writeFileSync(modulemap,'module Probe { export * }');
 const resolved={directory:dir,applicationID:'org.example.test',revision:'fixture',packages:[{name:'@nativescript/ios',version:'8.9.0',directory:path.resolve('internal/ios/prepare/testdata/runtime')}],contributions:[{path:framework,kind:'framework',platform:'ios',packageDirectory:dir},{path:modulemap,kind:'configuration',platform:'ios',packageDirectory:dir}]};
 const output=path.join(dir,'out');await prepare({resolved,directory:output});
 const flags=fs.readFileSync(path.join(output,'plugins-release.xcconfig'),'utf8');assert.match(flags,/OTHER_CFLAGS.*-fmodule-map-file=/);assert.match(flags,/OTHER_SWIFT_FLAGS.*-Xcc/);
 const configured=xcode.project(path.join(output,'NativeScriptApp.xcodeproj/project.pbxproj'));configured.parseSync();
 const targetSettings=Object.values(configured.hash.project.objects.XCBuildConfiguration).filter(v=>v&&typeof v==='object').map(v=>v.buildSettings).filter(v=>Array.isArray(v.HEADER_SEARCH_PATHS));assert.equal(targetSettings.length,2);
 for(const settings of targetSettings)assert.ok(settings.HEADER_SEARCH_PATHS.some(value=>value.includes(path.dirname(modulemap))),'module map include root must resolve nested angle-bracket imports');
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
