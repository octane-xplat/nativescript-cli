'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const xcode=require('xcode');const prepare=require('./index.cjs');
test('runtime graph membership, stable regeneration, removal and pin preservation',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p1 graph ')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const runtime=path.resolve('internal/ios/prepare/testdata/runtime');
 const contributions=[];
 for(const [name,kind,text] of [['Binding.swift','source','class Binding {}'],['Native.h','source','void example(void);'],['libNative.a','framework','fixture'],['Picture.png','resource','fixture'],['build.xcconfig','configuration','EXAMPLE = 1'],['Info.plist','configuration','<?xml version="1.0"?><plist version="1.0"><dict><key>NSCameraUsageDescription</key><string>Camera</string></dict></plist>']]) {
  const file=path.join(dir,name);fs.writeFileSync(file,text);contributions.push({path:file,kind,platform:'ios',packageDirectory:dir});
 }
 for (const [name,dynamic] of [['Dynamic',true],['Static',false]]) {
  const framework=path.join(dir,name+'.framework');fs.mkdirSync(framework);
  const bytes=Buffer.alloc(32);if(dynamic){bytes.writeUInt32LE(0xfeedfacf,0);bytes.writeUInt32LE(6,12);}else bytes.write('!<arch>\n');
  fs.writeFileSync(path.join(framework,name),bytes);contributions.push({path:framework,kind:'framework',platform:'ios',packageDirectory:dir});
 }
 const r={directory:dir,applicationID:'org.example.test',revision:'fixture',packages:[{name:'@nativescript/ios',version:'8.9.0',directory:runtime}],contributions};
 const output=path.join(dir,'generated');const q={directory:output,resolved:r};await prepare(q);
 const file=path.join(output,'NativeScriptApp.xcodeproj/project.pbxproj');
 let project=xcode.project(file);project.parseSync();
 const o=project.hash.project.objects;const owned=JSON.parse(fs.readFileSync(path.join(output,'.p1.json'))).ids;
 const sources=Object.values(o.PBXSourcesBuildPhase).filter(v=>v&&typeof v==='object');
 assert.ok(sources.some(v=>v.files.length===1 && owned.includes(v.files[0].value)));
 assert.ok(Object.values(o.PBXCopyFilesBuildPhase).some(v=>v&&typeof v==='object'&&v.files.length===1&&owned.includes(v.files[0].value)));
 assert.match(fs.readFileSync(path.join(output,'NativeScriptApp/NativeScriptApp-Info.plist'),'utf8'),/NSCameraUsageDescription/);
 assert.match(fs.readFileSync(path.join(output,'internal/Swift-ObjC-Bridging-Header.h'),'utf8'),/Native.h/);
 const original=fs.readFileSync(file,'utf8');assert.doesNotMatch(original,/value = [A-F0-9]{24}/);assert.match(fs.readFileSync(path.join(output,'NativeScriptApp.xcodeproj/xcshareddata/xcschemes/NativeScriptApp.xcscheme'),'utf8'),/BlueprintName = "NativeScriptApp"/);await prepare(q);assert.equal(fs.readFileSync(file,'utf8'),original);
 // A non-owned graph edit and exact dependency pins survive regeneration.
 project=xcode.project(file);project.parseSync();project.hash.project.objects.PBXProject[project.hash.project.rootObject].developmentRegion='fr';fs.writeFileSync(file,project.writeSync());
 fs.writeFileSync(path.join(output,'Podfile.lock'),'pod-pin');fs.mkdirSync(path.join(output,'NativeScriptApp.xcodeproj/project.xcworkspace/xcshareddata/swiftpm'),{recursive:true});
 const pin=path.join(output,'NativeScriptApp.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved');fs.writeFileSync(pin,'spm-pin');
 r.contributions=[];await prepare(q);const removed=fs.readFileSync(file,'utf8');assert.doesNotMatch(removed,/Binding.swift|libNative.a|Picture.png/);assert.match(removed,/developmentRegion = fr/);
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
