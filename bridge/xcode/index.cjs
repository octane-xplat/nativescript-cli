'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const xcode = require('xcode');
const plist = require('plist');
const { execFileSync } = require('node:child_process');
const swiftPackages = require('../resolve/swift-packages.cjs');
const fail = code => { throw Object.assign(new Error(), {code}); };
const q = value => JSON.stringify(value);
const id = value => crypto.createHash('sha256').update(`p1:${value}`).digest('hex').slice(0,24).toUpperCase();
// Embed dynamic libraries only. Unknown binary layouts fail before Xcode.
function dynamicFramework(file) {
  if (file.endsWith('.a')) return false;
  if (file.endsWith('.xcframework')) {
    let info; try { info=plist.parse(fs.readFileSync(path.join(file,'Info.plist'),'utf8')); } catch { fail('unavailable'); }
    const kinds=(info.AvailableLibraries || []).filter(lib=>lib.SupportedPlatform==='ios' && [undefined,'simulator'].includes(lib.SupportedPlatformVariant)).map(lib=>dynamicFramework(path.join(file,lib.LibraryIdentifier,lib.LibraryPath)));
    if (!kinds.length || kinds.some(k=>k!==kinds[0])) fail('unavailable');
    return kinds[0];
  }
  const binary=path.join(file,path.basename(file,'.framework'));
  let fd; try {
    fd=fs.openSync(binary,'r'); const b=Buffer.alloc(32);
    if(fs.readSync(fd,b,0,32,0)!==32) fail('unavailable');
    let offset=0;
    if(b.readUInt32BE(0)===0xcafebabe) offset=b.readUInt32BE(16);
    if(offset && fs.readSync(fd,b,0,32,offset)!==32) fail('unavailable');
    if (b.subarray(0,8).toString()==='!<arch>\n') return false;
    const magic=b.readUInt32LE(0);const le=[0xfeedface,0xfeedfacf].includes(magic);
    if(!le && ![0xcefaedfe,0xcffaedfe].includes(magic)) fail('unavailable');
    const type=le?b.readUInt32LE(12):b.readUInt32BE(12);
    if(type!==6 && type!==1) fail('unavailable'); return type===6;
  } catch { fail('unavailable'); } finally {if(fd!==undefined) fs.closeSync(fd);}
}
const values = section => Object.entries(section || {}).filter(([key,v]) => !key.endsWith('_comment') && v && typeof v === 'object');
module.exports = async ({ resolved, directory }) => {
  const normalize = value => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k[0].toLowerCase()+k.slice(1),normalize(v)])) : value;
  resolved = normalize(resolved);
  if (!path.isAbsolute(directory || '') || !resolved?.applicationID) fail('invalid_input');
  const runtime = resolved.packages.find(p => p.name === '@nativescript/ios');
  if (!runtime || !['8.9.0','9.1.0'].includes(runtime.version)) fail('unavailable');
  const template = path.join(runtime.directory, 'framework');
  if (!fs.existsSync(path.join(template, '__PROJECT_NAME__.xcodeproj/project.pbxproj'))) fail('unavailable');
  const name = 'NativeScriptApp', projectFile = path.join(directory, `${name}.xcodeproj/project.pbxproj`);
  const stateFile = path.join(directory, '.p1.json');
  const previous = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)) : {ids:[]};
  if (previous.runtime && previous.runtime !== runtime.version) fail('unavailable');
  // Never replace an existing tree: generated project edits and resolution pins survive.
  if (!fs.existsSync(projectFile)) {
    fs.mkdirSync(directory, {recursive:true});
    for (const entry of fs.readdirSync(template)) {
      const dest = path.join(directory, entry.replaceAll('__PROJECT_NAME__',name));
      if (fs.existsSync(dest)) fail('invalid_input');
      fs.cpSync(path.join(template,entry), dest, {recursive:true, dereference:false, filter: source => !source.split(path.sep).some(p=>p==='xcuserdata')});
    }
    const appDir = path.join(directory,name);
    for (const entry of fs.readdirSync(appDir)) {
      if (entry.includes('__PROJECT_NAME__')) fs.renameSync(path.join(appDir,entry),path.join(appDir,entry.replaceAll('__PROJECT_NAME__',name)));
    }
    const schemes=path.join(directory,`${name}.xcodeproj/xcshareddata/xcschemes`);
    if(fs.existsSync(schemes)) for(const file of fs.readdirSync(schemes)) {
      const text=fs.readFileSync(path.join(schemes,file),'utf8').replaceAll('__PROJECT_NAME__',name);
      fs.unlinkSync(path.join(schemes,file));fs.writeFileSync(path.join(schemes,file.replaceAll('__PROJECT_NAME__',name)),text);
    }
    fs.writeFileSync(projectFile,fs.readFileSync(projectFile,'utf8').replaceAll('__PROJECT_NAME__',name));
  }
  const internal = path.join(directory,'internal');
  const archive = path.join(internal,'XCFrameworks.zip');
  if (fs.existsSync(archive) && !fs.existsSync(path.join(internal,'NativeScript.xcframework'))) {
    try {
      const names=execFileSync('/usr/bin/unzip',['-Z1',archive],{encoding:'utf8',maxBuffer:4<<20}).trim().split('\n');
      if(names.some(n=>path.isAbsolute(n)||n.split('/').includes('..'))) fail('invalid_input');
      execFileSync('/usr/bin/unzip',['-q','-o',archive,'-d',internal],{stdio:'ignore'});
    } catch { fail('unavailable'); }
    if (!fs.existsSync(path.join(internal,'NativeScript.xcframework/Info.plist')) || !fs.existsSync(path.join(internal,'TKLiveSync.xcframework/Info.plist'))) fail('unavailable');
  }
  const project = xcode.project(projectFile); project.parseSync();
  const objects = project.hash.project.objects;
  const owned = new Set(previous.ids);
  for (const section of Object.values(objects)) {
    for (const key of Object.keys(section)) if (owned.has(key.replace(/_comment$/,''))) delete section[key];
    for (const [,object] of values(section)) for (const [key,value] of Object.entries(object)) {
      if (Array.isArray(value)) object[key] = value.filter(v => !owned.has(typeof v === 'string' ? v : v.value));
    }
  }
  const ids = [];
  function put(section,key,value) {
    const uuid = id(key);
    if (objects[section]?.[uuid]) fail('invalid_input');
    (objects[section] ||= {})[uuid] = {isa:section,...value}; ids.push(uuid); return uuid;
  }
  const appTargets = values(objects.PBXNativeTarget).filter(([,v]) => v.productType === '"com.apple.product-type.application"' || v.productType === 'com.apple.product-type.application');
  if (appTargets.length !== 1) fail('unavailable');
  const [targetID,target] = appTargets[0];
  const root = objects.PBXProject[project.hash.project.rootObject];
  const group = put('PBXGroup','group',{name:q('NativeScript contributions'),sourceTree:q('<group>'),children:[]});
  objects.PBXGroup[root.mainGroup].children.push({value:group,comment:'P1'});
  // V1's bundle handoff is NativeDir/app, outside the template's app group.
  for (const [,ref] of values(objects.PBXFileReference)) {
    if (ref.path === 'app' && ref.lastKnownFileType === 'folder') ref.sourceTree = 'SOURCE_ROOT';
  }
  const phases = {};
  for (const kind of ['Sources','Resources','Frameworks']) {
    const isa = `PBX${kind}BuildPhase`;
    const existing = target.buildPhases.filter(ref => objects[isa]?.[ref.value]);
    if (existing.length > 1) fail('unavailable');
    if (existing.length) phases[kind] = objects[isa][existing[0].value];
    else {
      const phase = put(isa,kind,{buildActionMask:2147483647,files:[],runOnlyForDeploymentPostprocessing:0});
      target.buildPhases.push({value:phase,comment:'P1'}); phases[kind]=objects[isa][phase];
    }
  }
  const embedID = put('PBXCopyFilesBuildPhase','embed',{buildActionMask:2147483647,dstPath:q(''),dstSubfolderSpec:10,name:q('Embed contributed frameworks'),files:[],runOnlyForDeploymentPostprocessing:0});
  target.buildPhases.push({value:embedID,comment:'P1'});
  const headers=[], configs=[], pods=[], packages=[], modulemaps=[], remotePackages=[];
  const unquote=value=>{try{return JSON.parse(value);}catch{return value;}};
  const productNames=new Set(values(objects.XCSwiftPackageProductDependency).map(([,p])=>unquote(p.productName)));
  let info = {CFBundleIdentifier:'$(PRODUCT_BUNDLE_IDENTIFIER)', CFBundleExecutable:'$(EXECUTABLE_NAME)', CFBundleName:name, CFBundlePackageType:'APPL', CFBundleVersion:'1', CFBundleShortVersionString:'1.0', LSRequiresIPhoneOS:true};
  let entitlements = plist.parse(fs.readFileSync(path.join(template,'__PROJECT_NAME__/__PROJECT_NAME__.entitlements'),'utf8'));
  const contributions = resolved.contributions.filter(c=>c.platform==='ios').sort((a,b)=>(a.packageDirectory===resolved.directory)-(b.packageDirectory===resolved.directory) || a.path.localeCompare(b.path));
  for (const c of contributions) {
    if (!path.isAbsolute(c.path) || !fs.existsSync(c.path)) fail('invalid_input');
    const ext = path.extname(c.path).toLowerCase();
    if(c.kind==='spm-remote'){
      const p=c.spm;
      if(!p||!Array.isArray(p.products)||!p.products.length)fail('invalid_input');
      const key=swiftPackages.key(p.repositoryURL);
      // Unowned references include the runtime's reviewed package. Do not alter
      // its requirement or create competing references to the same repository.
      if(values(objects.XCRemoteSwiftPackageReference).some(([,ref])=>swiftPackages.key(unquote(ref.repositoryURL))===key))fail('unavailable');
      const requirement=Object.fromEntries(Object.entries(swiftPackages.requirement(p.version)).map(([k,v])=>[k,q(v)]));
      const ref=put('XCRemoteSwiftPackageReference','remote:'+key,{repositoryURL:q(p.repositoryURL),requirement});
      (root.packageReferences ||= []).push({value:ref,comment:'P1'});
      for(const product of p.products){
        if(productNames.has(product))fail('unavailable');productNames.add(product);
        const dependency=put('XCSwiftPackageProductDependency',`remote:${key}:${product}`,{package:ref,productName:q(product)});
        (target.packageProductDependencies ||= []).push({value:dependency,comment:'P1'});
        const build=put('PBXBuildFile',`remote-link:${key}:${product}`,{productRef:dependency});
        phases.Frameworks.files.push({value:build,comment:'P1'});
      }
      remotePackages.push(p);continue;
    }
    if (c.kind === 'pods') { pods.push(c.path); continue; }
    if (c.kind === 'spm') {
      let manifest;
      try { manifest=JSON.parse(execFileSync('swift',['package','--package-path',path.dirname(c.path),'dump-package'],{encoding:'utf8',maxBuffer:4<<20,stdio:['ignore','pipe','pipe']})); }
      catch { fail('unavailable'); }
      const ref=put('XCLocalSwiftPackageReference',c.path,{relativePath:q(path.dirname(c.path))});
      (root.packageReferences ||= []).push({value:ref,comment:'P1'});
      for (const product of manifest.products || []) {
        if (!product.type?.library) fail('unavailable');
        if(productNames.has(product.name))fail('unavailable');productNames.add(product.name);
        const dependency=put('XCSwiftPackageProductDependency',`${c.path}:${product.name}`,{package:ref,productName:q(product.name)});
        (target.packageProductDependencies ||= []).push({value:dependency,comment:'P1'});
        const build=put('PBXBuildFile',`spm:${c.path}:${product.name}`,{productRef:dependency});
        phases.Frameworks.files.push({value:build,comment:'P1'});
      }
      packages.push(c.path); continue;
    }
    if (c.kind === 'configuration') {
      if(ext==='.modulemap') {modulemaps.push(c.path);continue;}
      if (ext === '.xcconfig') configs.push(c.path);
      else {
        let data; try { data=plist.parse(fs.readFileSync(c.path,'utf8')); } catch { fail('unavailable'); }
        if (ext === '.entitlements') Object.assign(entitlements,data);
        else if (path.basename(c.path) === 'Info.plist') Object.assign(info,data);
        else fail('unavailable');
      }
    }
    const types={'.swift':'sourcecode.swift','.m':'sourcecode.c.objc','.mm':'sourcecode.cpp.objcpp','.h':'sourcecode.c.h','.c':'sourcecode.c.c','.cpp':'sourcecode.cpp.cpp','.framework':'wrapper.framework','.xcframework':'wrapper.xcframework','.a':'archive.ar','.xcconfig':'text.xcconfig','.plist':'text.plist.xml','.entitlements':'text.plist.entitlements','.xcassets':'folder.assetcatalog'};
    const ref=put('PBXFileReference',`file:${c.path}`,{path:q(c.path),sourceTree:q('<absolute>'),lastKnownFileType:types[ext] || (fs.statSync(c.path).isDirectory()?'folder':'file')});
    objects.PBXGroup[group].children.push({value:ref,comment:'P1'});
    if (ext === '.h') { headers.push(c.path); continue; }
    const phase = {source:'Sources',resource:'Resources',framework:'Frameworks'}[c.kind];
    if (phase) {
      const build=put('PBXBuildFile',`build:${c.path}`,{fileRef:ref}); phases[phase].files.push({value:build,comment:'P1'});
      if (c.kind === 'framework' && dynamicFramework(c.path)) {
        const build=put('PBXBuildFile',`embed:${c.path}`,{fileRef:ref,settings:{ATTRIBUTES:['CodeSignOnCopy','RemoveHeadersOnCopy']}});
        objects.PBXCopyFilesBuildPhase[embedID].files.push({value:build,comment:'P1'});
      }
    } else if (c.kind !== 'configuration') fail('unavailable');
  }
  const configList=objects.XCConfigurationList[target.buildConfigurationList];
  for (const entry of configList.buildConfigurations) {
    const settings=objects.XCBuildConfiguration[entry.value].buildSettings;
    settings.PRODUCT_BUNDLE_IDENTIFIER=q(resolved.applicationID);
    settings.CODE_SIGN_ENTITLEMENTS=q(`${name}/${name}.entitlements`);
    // A module map's umbrella directory can contain nested include namespaces
    // (for example <SDWebImage/Header.h>), not just sibling header files.
    settings.HEADER_SEARCH_PATHS=['"$(inherited)"',q(q('$(SRCROOT)/internal')),q(q('$(SRCROOT)/internal/Swift-Modules')),q(q('$(SRCROOT)/internal/NativeContributions')),...Array.from(new Set([...headers,...modulemaps].map(p=>q(q(path.dirname(p))))))];
    settings.FRAMEWORK_SEARCH_PATHS=['"$(inherited)"',...Array.from(new Set(contributions.filter(c=>c.kind==='framework').map(c=>q(q(path.dirname(c.path))))))];
  }
  const write=(file,text)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.p1-tmp';fs.writeFileSync(temp,text);fs.renameSync(temp,file);};
  write(path.join(directory,name,`${name}-Info.plist`),plist.build(info));
  write(path.join(directory,name,`${name}.entitlements`),plist.build(entitlements));
  write(path.join(directory,'internal/Swift-ObjC-Bridging-Header.h'), '#import <NativeScript/NativeScript.h>\n#import "NativeScriptStart.h"\n'+headers.map(p=>`#import ${q(p)}\n`).join(''));
  write(path.join(directory,'internal/NativeContributions/module.modulemap'), 'module NativeContributions {\n'+headers.map(p=>`  header ${q(p)}\n`).join('')+'  export *\n}\n');
  for (const mode of ['debug','release']) write(path.join(directory,`plugins-${mode}.xcconfig`),`#include? "Pods/Target Support Files/Pods-${name}/Pods-${name}.${mode}.xcconfig"\n`+(modulemaps.length?`OTHER_CFLAGS = $(inherited) ${modulemaps.map(p=>'-fmodule-map-file='+q(p)).join(' ')}\nOTHER_SWIFT_FLAGS = $(inherited) ${modulemaps.map(p=>'-Xcc -fmodule-map-file='+q(p)).join(' ')}\n`:'')+configs.map(p=>`#include ${q(p)}\n`).join(''));
  const ruby = value => `'${value.replaceAll('\\','\\\\').replaceAll("'","\\'")}'`;
  if(pods.length || previous.pods) write(path.join(directory,'Podfile'), `platform :ios, '13.0'\nproject '${name}.xcodeproj'\ntarget '${name}' do\n`+pods.map(p=>path.extname(p)==='.podspec'?`  pod ${ruby(path.basename(p,'.podspec'))}, :path => ${ruby(path.dirname(p))}\n`:`  instance_eval(File.read(${ruby(p)}), ${ruby(p)})\n`).join('')+'end\n');
  write(path.join(directory,'metadata-inputs.json'),JSON.stringify({schema:1,runtime:runtime.version,revision:resolved.revision,headers,modulemaps,frameworks:contributions.filter(c=>c.kind==='framework').map(c=>c.path),pods,packages,remotePackages},null,2)+'\n');
  write(projectFile,project.writeSync());
  write(stateFile,JSON.stringify({runtime:runtime.version,ids,pods:pods.length>0 || !!previous.pods,spm:runtime.version==='9.1.0' || packages.length>0 || remotePackages.length>0 || !!previous.spm})+'\n');
  fs.mkdirSync(path.join(directory,'app'),{recursive:true});
  const bundlePackage=path.join(directory,'app/package.json');
  if(!fs.existsSync(bundlePackage)) write(bundlePackage,JSON.stringify({main:'bundle.js'}));
  return {directory,projectFile,pods:pods.length>0 || !!previous.pods,spm:runtime.version==='9.1.0' || packages.length>0 || remotePackages.length>0 || !!previous.spm,target:name};
};
