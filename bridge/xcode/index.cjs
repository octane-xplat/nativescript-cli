'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const xcode = require('xcode');
const plist = require('plist');
const bplist = require('bplist-parser');
const { execFileSync } = require('node:child_process');
const swiftPackages = require('../resolve/swift-packages.cjs');
const xcconfigs = require('./xcconfig.cjs');
const fail = code => { throw Object.assign(new Error(), {code}); };
const q = value => JSON.stringify(value);
const id = value => crypto.createHash('sha256').update(`p1:${value}`).digest('hex').slice(0,24).toUpperCase();
// Installed packages may ship binary property lists (for example a bplist00
// Info.plist); generated template files stay XML-only and keep plist.parse.
function readPlist(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length >= 8 && bytes.subarray(0,8).toString('latin1') === 'bplist00') return bplist.parseBuffer(bytes)[0];
  return plist.parse(bytes.toString('utf8'));
}
// Embed dynamic libraries only. Unknown binary layouts fail before Xcode.
function dynamicFramework(file) {
  if (file.endsWith('.a')) return false;
  if (file.endsWith('.xcframework')) {
    let info; try { info=readPlist(path.join(file,'Info.plist')); } catch { fail('unavailable'); }
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
// The property-list merges reproduce upstream's PlistMerger (lodash mergeWith
// semantics): dictionaries merge recursively, CFBundleURLTypes concatenate by
// role, LSApplicationQueriesSchemes deduplicate, and every other array or
// scalar is replaced by the later patch.
function mergePlist(base, patch) {
  if (patch === undefined) return base;
  if (base === undefined || base === null || typeof base !== 'object' || Array.isArray(base) || Array.isArray(patch)) return structuredClone(patch);
  const out = structuredClone(base);
  for (const key of Object.keys(patch)) out[key] = mergePlistKey(key, out[key], patch[key]);
  return out;
}
function mergePlistKey(key, base, patch) {
  if (key === 'CFBundleURLTypes' && Array.isArray(base) && Array.isArray(patch)) {
    for (const element of patch) {
      const same = element && typeof element === 'object' && element.CFBundleTypeRole ? base.find(item => item && item.CFBundleTypeRole === element.CFBundleTypeRole) : undefined;
      if (same && Array.isArray(same.CFBundleURLSchemes) && Array.isArray(element.CFBundleURLSchemes)) same.CFBundleURLSchemes = same.CFBundleURLSchemes.concat(element.CFBundleURLSchemes);
      else if (!same) base.push(element);
    }
    return base;
  }
  if (key === 'LSApplicationQueriesSchemes' && Array.isArray(base) && Array.isArray(patch)) {
    for (const element of patch) if (!base.some(item => item === element)) base.push(element);
    return base;
  }
  if (base && typeof base === 'object' && !Array.isArray(base) && patch && typeof patch === 'object' && !Array.isArray(patch)) return mergePlist(base, patch);
  return structuredClone(patch);
}
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Podfile composition matches upstream's CocoaPodsService: plugin Podfiles are
// inlined verbatim inside the target between Begin/End markers, their platform
// rows are commented into a single platform section, and post_install blocks
// become named functions invoked from one hook. Instance evaluation inside the
// target fails on plugin platform/use_frameworks/post_install declarations.
const podfileFunctionBase = name => 'post_install' + name.replace(/_/g, '___').replace(/[^A-Za-z0-9_]/g, '_');
function rehostPostInstall(content, pluginName) {
  const functions = [];
  const replaced = content.replace(/post_install do *(\|(\w+)\|)?/g, (match, group, parameter) => {
    const functionName = `${podfileFunctionBase(pluginName)}_${functions.length}`;
    functions.push({ name: functionName, parameters: !!parameter });
    return `def ${functionName}${parameter ? ` (${parameter})` : ''}`;
  });
  return { replaced, functions };
}
const platformRow = /^\s*?(platform\b\s*?:\s*?ios\b(?:,\s*?['"](.+)['"])?)/gm;
function commentPlatformRows(content, file) {
  let platform = null;
  const replaced = content.replace(platformRow, (match, row, version) => { platform = { content: row, version, path: file }; return `# ${match.trim()}`; });
  return { replaced, platform };
}
const coerceVersion = version => { const match = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(version || ''); return match && [match[1] | 0, match[2] | 0, match[3] | 0]; };
const versionGreater = (a, b) => !!a && !!b && (a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2]);
module.exports = async ({ resolved, directory, configuration }) => {
  const normalize = value => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k[0].toLowerCase()+k.slice(1),normalize(v)])) : value;
  resolved = normalize(resolved);
  if(resolved)resolved.contributions??=[];
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
  const headers=[], configs=[], pods=[], packages=[], modulemaps=[], remotePackages=[], localSwiftPackages=[];
  const unquote=value=>{try{return JSON.parse(value);}catch{return value;}};
  const productNames=new Set(values(objects.XCSwiftPackageProductDependency).map(([,p])=>unquote(p.productName)));
  // Plugin manifests merge only from the plugin platform root and the app's
  // iOS resources directory; upstream never collects files such as a
  // platforms/ios/src/Info.plist framework manifest into the app plist.
  let info = {}, entitlements = {}, entitlementsMerged = false;
  const realCache=new Map();
  const real=p=>{let r=realCache.get(p);if(r===undefined){try{r=fs.realpathSync(p);}catch{r=p;}realCache.set(p,r);}return r;};
  const appRoot = resolved.directory && fs.existsSync(resolved.directory) ? fs.realpathSync(resolved.directory) : resolved.directory;
  const appIOSDirectory = resolved.config?.appResourcesPath ? path.join(real(resolved.config.appResourcesPath), 'iOS') : undefined;
  const isAppOwned = c => !c.packageDirectory || c.packageDirectory === appRoot;
  const manifestDirectory = c => isAppOwned(c) ? appIOSDirectory : path.join(c.packageDirectory, 'platforms', 'ios');
  // Plugins apply in upstream's getAllProductionPlugins order: breadth-first
  // production-dependency emission order, computed during resolve over each
  // package's declared `dependencies`. The app always applies last so its
  // manifest values win; packages only reachable through peer, optional or
  // development edges keep their contribution but sort after production ones.
  const dependencyOrder = new Map((resolved.dependencyOrder || []).map((directory, index) => [real(directory), index]));
  const contributions = resolved.contributions.filter(c=>c.platform==='ios').map(c=>c.packageDirectory?{...c,packageDirectory:real(c.packageDirectory)}:c).sort((a,b)=>(isAppOwned(a)-isAppOwned(b)) || (dependencyOrder.get(a.packageDirectory)??Number.MAX_SAFE_INTEGER)-(dependencyOrder.get(b.packageDirectory)??Number.MAX_SAFE_INTEGER) || a.path.localeCompare(b.path));
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
    if (c.kind === 'pods') { pods.push({path:c.path,packageDirectory:c.packageDirectory}); continue; }
    if (c.kind === 'spm') {
      const sourceSHA256=c.spm?.path?resolved.sources?.find(source=>source.path===c.path)?.digest:undefined;
      const manifestDigest=()=>{try{if(!fs.lstatSync(c.path).isFile())fail('invalid_input');return crypto.createHash('sha256').update(fs.readFileSync(c.path)).digest('hex');}catch{fail('invalid_input');}};
      if(c.spm?.path&&(!/^[a-f0-9]{64}$/.test(sourceSHA256??'')||manifestDigest()!==sourceSHA256))fail('invalid_input');
      let manifest;
      try { manifest=JSON.parse(execFileSync('swift',['package','--package-path',path.dirname(c.path),'dump-package'],{encoding:'utf8',maxBuffer:4<<20,stdio:['ignore','pipe','pipe']})); }
      catch { fail('unavailable'); }
      if(c.spm?.path&&manifestDigest()!==sourceSHA256)fail('invalid_input');
      // Upstream writes the declared path resolved against the app directory,
      // then made project-relative; the visible node_modules form survives
      // instead of the realpath'd store location when the declaration resolves.
      const declaredDirectory=c.spm?.path?[path.resolve(appRoot,c.spm.path),c.packageDirectory&&path.resolve(c.packageDirectory,c.spm.path)].find(p=>p&&fs.existsSync(p)):undefined;
      const ref=put('XCLocalSwiftPackageReference',c.path,{relativePath:q(path.relative(directory,declaredDirectory||path.dirname(c.path)))});
      (root.packageReferences ||= []).push({value:ref,comment:'P1'});
      let selectedProducts=manifest.products || [];
      if(c.spm){
        if(!c.spm.path||!Array.isArray(c.spm.products)||!c.spm.products.length)fail('invalid_input');
        selectedProducts=c.spm.products.map(name=>selectedProducts.find(product=>product.name===name));
        if(selectedProducts.some(product=>!product))fail('invalid_input');
      }
      for (const product of selectedProducts) {
        if (!product.type?.library) fail('unavailable');
        if(productNames.has(product.name))fail('unavailable');productNames.add(product.name);
        const dependency=put('XCSwiftPackageProductDependency',`${c.path}:${product.name}`,{package:ref,productName:q(product.name)});
        (target.packageProductDependencies ||= []).push({value:dependency,comment:'P1'});
        const build=put('PBXBuildFile',`spm:${c.path}:${product.name}`,{productRef:dependency});
        phases.Frameworks.files.push({value:build,comment:'P1'});
      }
      if(c.spm?.path)localSwiftPackages.push({name:c.spm.name,path:c.spm.path,products:[...c.spm.products],manifest:c.path,sourceSHA256,evaluation:manifest});
      packages.push(c.path); continue;
    }
    if (c.kind === 'configuration') {
      if(ext==='.modulemap') {modulemaps.push(c.path);continue;}
      const site = manifestDirectory(c);
      const atManifestSite = site !== undefined && real(path.dirname(c.path)) === site;
      if (ext === '.xcconfig') { if(atManifestSite && path.basename(c.path)==='build.xcconfig') configs.push({path:c.path,packageDirectory:c.packageDirectory}); }
      else if (ext === '.entitlements' && atManifestSite && path.basename(c.path)==='app.entitlements') {
        let data; try { data=readPlist(c.path); } catch { fail('unavailable'); }
        entitlements=mergePlist(entitlements,data); entitlementsMerged=true;
      }
      else if (path.basename(c.path) === 'Info.plist') {
        // Upstream merges only the platform-root Info.plist; one inside src/ is
        // a framework manifest and stays an inert project file.
        if (atManifestSite) { let data; try { data=readPlist(c.path); } catch { fail('unavailable'); } info=mergePlist(info,data); }
      }
      else if (ext === '.plist') fail('unavailable');
    }
    const types={'.swift':'sourcecode.swift','.m':'sourcecode.c.objc','.mm':'sourcecode.cpp.objcpp','.h':'sourcecode.c.h','.c':'sourcecode.c.c','.cpp':'sourcecode.cpp.cpp','.framework':'wrapper.framework','.xcframework':'wrapper.xcframework','.a':'archive.ar','.xcconfig':'text.xcconfig','.plist':'text.plist.xml','.entitlements':'text.plist.entitlements','.xcassets':'folder.assetcatalog'};
    // Upstream references contributed files relative to the project inside
    // groups without a path, so resolution lands on $(SRCROOT); a detached
    // output keeps that contract through ordinary relative paths.
    const ref=put('PBXFileReference',`file:${c.path}`,{explicitFileType:undefined,fileEncoding:(c.kind==='source'||['.xcconfig','.plist'].includes(ext))?4:undefined,includeInIndex:0,lastKnownFileType:types[ext] || (fs.statSync(c.path).isDirectory()?'folder':'file'),name:q(path.basename(c.path)),path:q(path.relative(directory,c.path)),sourceTree:q('<group>')});
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
    // Search paths stay $(SRCROOT)-relative like upstream's project edits;
    // upstream emits framework roots unanchored and header roots anchored.
    settings.HEADER_SEARCH_PATHS=['"$(inherited)"',q(q('$(SRCROOT)/internal')),q(q('$(SRCROOT)/internal/Swift-Modules')),...Array.from(new Set([...headers,...modulemaps].map(p=>q(q('$(SRCROOT)/'+path.relative(directory,path.dirname(p)))))))];
    settings.FRAMEWORK_SEARCH_PATHS=['"$(inherited)"',...Array.from(new Set(contributions.filter(c=>c.kind==='framework').map(c=>q(q(path.relative(directory,path.dirname(c.path)))))))];
  }
  const write=(file,text)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.p1-tmp';fs.writeFileSync(temp,text);fs.renameSync(temp,file);};
  // Upstream applies the application identity last so plugin manifests can
  // never override it, and registers the identifier URL scheme on non-release
  // builds.
  info=mergePlist(info,{CFBundleIdentifier:'$(PRODUCT_BUNDLE_IDENTIFIER)'});
  if(configuration!=='release')info=mergePlist(info,{CFBundleURLTypes:[{CFBundleTypeRole:'Editor',CFBundleURLSchemes:[resolved.applicationID.replace(/[^A-Za-z0-9]/g,'')]}]});
  write(path.join(directory,name,`${name}-Info.plist`),plist.build(info));
  // Upstream rewrites the app entitlements only when app.entitlements files
  // merge; otherwise the template file stands.
  if(entitlementsMerged)write(path.join(directory,name,`${name}.entitlements`),plist.build(entitlements));
  // Upstream keeps the runtime's bridging header verbatim: no contributed
  // headers are imported into Swift, and plugin module maps load through
  // header-search-path module.modulemap discovery instead of a generated
  // umbrella module.
  const bridgingHeader=path.join(directory,'internal/Swift-ObjC-Bridging-Header.h');
  if(!fs.existsSync(bridgingHeader))write(bridgingHeader,'#import "TargetConditionals.h"\n\n#ifndef TARGET_OS_WATCH\n    #import "NativeScript/NativeScript.h"\n    #import "NativeScriptStart.h"\n#endif\n');
  fs.rmSync(path.join(internal,'NativeContributions'),{recursive:true,force:true});
  // plugins-*.xcconfig merges contributed build.xcconfig files through the
  // same XcconfigService.mergeFiles contract upstream applies per file: the
  // App_Resources xcconfig first (its values win), then each plugin's in
  // dependency order. CocoaPods keys join after pod install through the
  // podxcconfig operation, matching upstream's mergePodXcconfigFile.
  let mergedXcconfig='';
  for(const c of [...configs.filter(isAppOwned),...configs.filter(c=>!isAppOwned(c))]){
    let source;try{source=fs.readFileSync(c.path,'utf8');}catch{fail('unavailable');}
    mergedXcconfig=xcconfigs.mergeFiles(source,mergedXcconfig).text;
  }
  // Upstream adds the entitlements row when the merged config lacks it and the
  // platform entitlements file exists (the runtime template always ships one).
  if(fs.existsSync(path.join(directory,name,`${name}.entitlements`))&&!xcconfigs.attributes(mergedXcconfig).has('CODE_SIGN_ENTITLEMENTS')){
    mergedXcconfig=xcconfigs.mergeFiles(`CODE_SIGN_ENTITLEMENTS = ${name}/${name}.entitlements\n`,mergedXcconfig).text;
  }
  for (const mode of ['debug','release']) write(path.join(directory,`plugins-${mode}.xcconfig`),mergedXcconfig);
  const ruby = value => `'${value.replaceAll('\\','\\\\').replaceAll("'","\\'")}'`;
  if(pods.length || previous.pods) {
    const appPodfile=appIOSDirectory?path.join(appIOSDirectory,'Podfile'):'';
    const packageNames=new Map(resolved.packages.map(p=>[real(p.directory),p.name]));
    const pluginName=c=>isAppOwned(c)?'NSPodfileBase':packageNames.get(c.packageDirectory)??path.basename(c.packageDirectory);
    let body='';
    const appendBlock=block=>{body=body.trim()?body.trim()+'\n\n'+block.trim():block.trim();};
    const hookHeader='post_install do |installer|\n';
    const addHookCalls=functions=>{
      if(!functions.length)return;
      const calls=functions.map(f=>`  ${f.name}${f.parameters?' installer':''}`).join('\n');
      if(body.includes(hookHeader))body=body.replace(new RegExp(`(${escapeRegExp(hookHeader)}[\\s\\S]*?)(\\bend\\b)`,'m'),(m,inside,end)=>inside+calls+'\n'+end);
      else body=(body.trim()?body.trim()+'\n\n':'')+hookHeader+calls+'\nend';
    };
    const sectionHeader='# NativeScriptPlatformSection',sectionFooter='# End NativeScriptPlatformSection';
    const buildSection=data=>`${sectionHeader} ${data.path} with${data.version?` ${data.version}`:''}\n${data.content}\n${sectionFooter}`;
    const sectionPattern=new RegExp(`${sectionHeader} ([\\s\\S]*?)with[\\s\\S]*?\\n([\\s\\S]*?(?:,\\s*?['"](.+)['"])?)\\n${sectionFooter}`,'m');
    const addPlatformSection=data=>{
      const existing=sectionPattern.exec(body);
      if(!existing){body=body.trim()+'\n\n'+buildSection(data)+'\n';return;}
      const current={path:existing[1].trim(),content:existing[2],version:existing[3]};
      if((current.path!==appPodfile&&data.path===appPodfile)||(current.path===appPodfile&&data.path===appPodfile&&versionGreater(coerceVersion(data.version),coerceVersion(current.version)))||(!data.version||(current.version&&versionGreater(coerceVersion(data.version),coerceVersion(current.version)))))body=body.replace(existing[0],buildSection(data).trim());
    };
    for(const c of pods){
      if(path.extname(c.path)==='.podspec'){appendBlock(`pod ${ruby(path.basename(c.path,'.podspec'))}, :path => ${ruby(path.dirname(c.path))}`);continue;}
      let content;try{content=fs.readFileSync(c.path,'utf8');}catch{fail('unavailable');}
      const hooks=rehostPostInstall(content,pluginName(c));
      const platforms=commentPlatformRows(hooks.replaced,c.path);
      addHookCalls(hooks.functions);
      if(platforms.platform)addPlatformSection(platforms.platform);
      appendBlock(`# Begin Podfile - ${c.path.replace(/\+/g,'\\+')}\n${platforms.replaced}\n# End Podfile`);
    }
    write(path.join(directory,'Podfile'),`use_frameworks!\n\ntarget "${name}" do\n${body.trim()}\nend`);
  }
  write(path.join(directory,'metadata-inputs.json'),JSON.stringify({schema:1,runtime:runtime.version,revision:resolved.revision,headers,modulemaps,frameworks:contributions.filter(c=>c.kind==='framework').map(c=>c.path),pods:pods.map(c=>c.path),packages,remotePackages},null,2)+'\n');
  write(projectFile,project.writeSync());
  write(stateFile,JSON.stringify({runtime:runtime.version,ids,pods:pods.length>0 || !!previous.pods,spm:runtime.version==='9.1.0' || packages.length>0 || remotePackages.length>0 || !!previous.spm})+'\n');
  fs.mkdirSync(path.join(directory,'app'),{recursive:true});
  const bundlePackage=path.join(directory,'app/package.json');
  if(!fs.existsSync(bundlePackage)) write(bundlePackage,JSON.stringify({main:'bundle.mjs'}));
  // Contributed xcconfigs resolve plugin resources as $(SRCROOT)/../../node_modules,
  // assuming the generated project sits at <app>/platforms/ios like upstream's.
  // A detached output directory keeps that contract through a node_modules
  // alias two levels up, so $(SRCROOT)/../.. still reads as the app root.
  const appModules=appRoot&&path.join(appRoot,'node_modules');
  if(appModules&&fs.existsSync(appModules)&&fs.statSync(appModules).isDirectory()){
    const alias=path.resolve(directory,'../../node_modules');
    try{
      const current=fs.lstatSync(alias,{throwIfNoEntry:false});
      if(current){if(current.isSymbolicLink()&&fs.realpathSync(alias)!==fs.realpathSync(appModules)){fs.rmSync(alias);fs.symlinkSync(appModules,alias);}}
      else{fs.mkdirSync(path.dirname(alias),{recursive:true});fs.symlinkSync(appModules,alias);}
    }catch{fail('unavailable');}
  }
  return {directory,projectFile,pods:pods.length>0 || !!previous.pods,spm:runtime.version==='9.1.0' || packages.length>0 || remotePackages.length>0 || !!previous.spm,target:name,localSwiftPackages};
};
