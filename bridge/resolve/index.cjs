'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { stripTypeScriptTypes, createRequire } = require('node:module');
const coreAdapter=require('./core.cjs');
const expandNativeSources=require('./native-sources.cjs');
const swiftPackages=require('./swift-packages.cjs');
const { pathToFileURL } = require('node:url');
const configNames = ['nativescript.config.ts', 'nativescript.config.js', 'nativescript.config.cjs', 'nativescript.config.mjs', 'nativescript.config.json'];
const safeFailures = new WeakSet();
function fail(code, message) {
  const error = Object.assign(new Error(message), { code, safeResolve: true });
  safeFailures.add(error);
  throw error;
}
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_input', `${label} must be an object`);
  return value;
}
async function resolve({ projectDir }) {
  if (!path.isAbsolute(projectDir || '')) fail('invalid_input', 'Project directory must be absolute');
  const sources = new Map(), packages = new Map(), edges = [], contributions = [], nativeSourceGroups = [];
  function read(file) {
    const bytes = fs.readFileSync(file);
    sources.set(fs.realpathSync(file), crypto.createHash('sha256').update(bytes).digest('hex'));
    return bytes.toString('utf8');
  }
  function json(file) {
    try { return object(JSON.parse(read(file)), 'package/config JSON'); }
    catch (e) { if (safeFailures.has(e)) throw e; fail('invalid_input', 'Cannot read valid package/config JSON; check the selected project and installed packages'); }
  }
  async function config(dir, required) {
    const found = configNames.filter(name => fs.existsSync(path.join(dir, name)));
    if (found.length > 1) fail('invalid_input', 'Multiple NativeScript config files; retain exactly one per package');
    if (!found.length) {
      if (required) fail('invalid_input', 'NativeScript config missing; create nativescript.config.js, .cjs, .mjs, .ts or .json');
      return {};
    }
    const file = path.join(dir, found[0]);
    let value;
    try {
      const text = read(file);
      if (file.endsWith('.json')) value = JSON.parse(text);
      else if (file.endsWith('.ts')) {
        // NativeScript configs commonly use regular imports for names used only
        // as types. Node's eraser preserves those imports; a project-installed
        // TypeScript compiler removes them with the same CommonJS contract used
        // by the canonical config evaluator. Never install or find a global one.
        let compiler;
        for (const base of [...new Set([dir, root])]) {
          const req = createRequire(path.join(base, 'package.json'));
          for (const name of ['typescript-classic', 'typescript']) {
            let installed;
            try { installed = req.resolve(name); } catch (e) { if(e.code==='MODULE_NOT_FOUND')continue; throw e; }
            compiler = req(installed);
            if(typeof compiler.transpileModule!=='function'||!compiler.ModuleKind)fail('unavailable','Installed TypeScript config compiler is incompatible');
            break;
          }
          if(compiler)break;
        }
        if (!compiler && !stripTypeScriptTypes) fail('unavailable', 'TypeScript config needs a project-installed TypeScript compiler or Node with stripTypeScriptTypes support (22.13 or newer); use JavaScript config on older Node');
        const code = compiler ? compiler.transpileModule(text, {fileName:file,compilerOptions:{module:compiler.ModuleKind.CommonJS}}).outputText : stripTypeScriptTypes(text, { mode: 'strip' });
        const module = new (require('node:module').Module)(file);
        module.filename = file;
        module.paths = require('node:module').Module._nodeModulePaths(dir);
        // Native Node ESM loading supports type-only config imports without a compiler install.
        if (!compiler && /\b(?:import|export)\b/.test(code)) value = await import(pathToFileURL(file).href);
        else { module._compile(code, file); value = module.exports; }
      } else value = await import(pathToFileURL(file).href);
      value = value.default ?? value;
      if (typeof value === 'function') value = await value({ ...process.env });
      return object(value, 'NativeScript config');
    } catch (e) {
      if (safeFailures.has(e)) throw e;
      fail('invalid_input', 'NativeScript config evaluation failed; check syntax and installed config imports (no installation was attempted)');
    }
  }
  function keys(value, allowed, label) {
    object(value, label);
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('unavailable', `Unsupported ${label} field ${key.replace(/[^a-zA-Z0-9_-]/g, '?')}; migrate it to a supported native contribution before preparing`);
  }
  function directory(dir, value, fallback) {
    if (value !== undefined && (typeof value !== 'string' || !value)) fail('invalid_input', 'Config paths must be nonempty strings');
    const resolved = path.resolve(dir, value ?? fallback);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) fail('invalid_input', 'Configured app/resources directory does not exist; create it or correct its config path');
    return fs.realpathSync(resolved);
  }
  function collect(dir, owner, cfg, resources, core=false) {
    keys(cfg, ['id', 'appPath', 'appResourcesPath', 'buildPath', 'ios', 'android'], 'config');
    if (cfg.ios !== undefined) keys(cfg.ios, ['NativeSource','SPMPackages'], 'iOS config');
    if(cfg.ios?.SPMPackages!==undefined){
      let declared;
      try{declared=swiftPackages.parse(cfg.ios.SPMPackages);}catch(e){fail(e.code==='unavailable'?'unavailable':'invalid_input','SPMPackages require named HTTPS repositories, supported version/revision requirements and library products');}
      const origin=configNames.map(name=>path.join(dir,name)).find(fs.existsSync);
      for(const spm of declared)contributions.push({packageDirectory:owner,platform:'ios',kind:'spm-remote',path:origin,spm});
    }
    if(cfg.ios?.NativeSource!==undefined){
      if(dir!==root)fail('unavailable','Plugin NativeSource declarations require a qualified canonical source contract');
      let groups;
      try{groups=expandNativeSources(dir,cfg.ios.NativeSource);}catch(e){fail(e.code==='unavailable'?'unavailable':'invalid_input','NativeSource requires unique named paths matching supported ordinary iOS source/header/modulemap files');}
      for(const group of groups){
        nativeSourceGroups.push({name:group.name,path:group.pattern,root:group.base,files:[...new Set(group.files.map(f=>f.realPath))].sort()});
        for(const file of group.files){read(file.realPath);contributions.push({packageDirectory:owner,platform:'ios',kind:file.kind,path:file.realPath});}
      }
    }
    if (cfg.android !== undefined) keys(cfg.android, ['v8Flags', 'markingMode'], 'Android config');
    for (const key of ['v8Flags', 'markingMode']) if (cfg.android?.[key] !== undefined && typeof cfg.android[key] !== 'string') fail('invalid_input', 'Android runtime settings must be strings');
    if (fs.existsSync(path.join(dir, 'hooks'))) fail('unavailable', 'Legacy package hooks are unsupported; migrate to the extension SDK before preparing');
    function walk(folder, platform) {
      if (!fs.existsSync(folder)) return;
      // A native package owns its implementation subtree; do not also compile its
      // Sources through the application target. Hash inputs without tool caches.
      if (platform === 'ios') {
        const manifests = fs.readdirSync(folder).filter(n => n === 'Package.swift' || n.endsWith('.podspec'));
        if (manifests.length) {
          const hash = p => { for (const e of fs.readdirSync(p,{withFileTypes:true})) { if (['.build','.swiftpm'].includes(e.name)) continue; const f=path.join(p,e.name); if(e.isSymbolicLink()) fail('unavailable','Native package symlinks are unsupported'); if(e.isDirectory()) hash(f); else read(f); } };
          hash(folder);
          if (fs.existsSync(path.join(folder,'Podfile'))) manifests.push('Podfile');
          for (const name of manifests.sort()) contributions.push({packageDirectory:owner,platform,kind:name==='Package.swift'?'spm':'pods',path:fs.realpathSync(path.join(folder,name))});
          return;
        }
      }
      for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name, 'en'))) {
        const file = path.join(folder, entry.name);
        if (entry.isSymbolicLink()) fail('unavailable', 'Symlinks inside native contribution trees are unsupported; use a linked package root instead');
        if(core && coreAdapter.inventory(path.relative(dir,file).split(path.sep).join('/'))) { read(file); continue; }
        if (entry.isDirectory() && !/\.(framework|xcframework|xcassets|bundle)$/.test(entry.name)) { walk(file, platform); continue; }
        let kind;
        const ext = path.extname(entry.name).toLowerCase();
        if (platform === 'ios') {
          if(core && path.relative(dir,file).split(path.sep).join('/')==='platforms/ios/src/module.modulemap') kind='configuration';
          else if (entry.name === 'Podfile' || ext === '.podspec') kind = 'pods';
          else if (entry.name === 'Package.swift') kind = 'spm';
          else if (['.swift', '.m', '.mm', '.h', '.c', '.cpp'].includes(ext)) kind = 'source';
          else if (['.framework', '.xcframework', '.a'].includes(ext)) kind = 'framework';
          else if (['.plist', '.xcconfig', '.entitlements'].includes(ext)) kind = 'configuration';
          else if (['.xcassets', '.bundle', '.png', '.jpg', '.jpeg', '.storyboard', '.xib', '.strings', '.json'].includes(ext)) kind = 'resource';
        } else {
          if (['.aar', '.jar', '.so'].includes(ext)) kind = 'library';
          else if (['.java', '.kt', '.c', '.cpp', '.h'].includes(ext)) kind = 'source';
          else if (['.gradle', '.properties', '.mdg'].includes(ext) || entry.name === 'AndroidManifest.xml') kind = 'configuration';
          else if (file.split(path.sep).includes('res') || file.split(path.sep).includes('assets')) kind = 'resource';
        }
        if (!kind) fail('unavailable', `Unsupported ${platform} native file type; migrate or remove the unrecognized contribution before preparing`);
        const real = fs.realpathSync(file);
        if (entry.isDirectory()) {
          // Hash bundle contents without representing them as independent contributions.
          const hashTree = p => { for (const e of fs.readdirSync(p, {withFileTypes:true})) { const f=path.join(p,e.name); if(e.isSymbolicLink()) fail('unavailable','Native bundle symlinks are unsupported'); if(e.isDirectory()) hashTree(f); else read(f); } };
          hashTree(real);
        } else read(real);
        contributions.push({ packageDirectory: owner, platform, kind, path: real });
      }
    }
    for (const platform of ['ios', 'android']) walk(path.join(dir, 'platforms', platform), platform);
    if (resources) {
      walk(path.join(resources, 'iOS'), 'ios');
      walk(path.join(resources, 'Android'), 'android');
    }
  }
  const root = fs.realpathSync(projectDir);
  const app = json(path.join(root, 'package.json'));
  const cfg = await config(root, true);
  if (typeof cfg.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(cfg.id)) fail('invalid_input', 'Config id must be a dotted application identifier');
  // The OTA handoff must preserve every evaluated value; JSON omission is not
  // a supported normalization for canonical fingerprint inputs.
  function serializable(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (Array.isArray(value)) { for (const item of value) serializable(item); return; }
    if (value && Object.getPrototypeOf(value) === Object.prototype) { for (const item of Object.values(value)) serializable(item); return; }
    fail('unavailable', 'Native config must contain finite JSON values without omitted fields');
  }
  serializable(cfg);
  if (cfg.buildPath !== undefined && (typeof cfg.buildPath !== 'string' || !cfg.buildPath)) fail('invalid_input', 'Config buildPath must be a nonempty string');
  const normalized = { nativeConfig: cfg, appPath: directory(root, cfg.appPath, 'app'), appResourcesPath: directory(root, cfg.appResourcesPath, 'App_Resources'), android: cfg.android ?? {} };
  collect(root, root, cfg, normalized.appResourcesPath);
  async function visit(dir, pkg, isRoot = false) {
    if (packages.has(dir)) return;
    if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string') fail('invalid_input', 'Every resolved package must have a name and version');
    const native = pkg.nativescript !== undefined;
    const item = { name: pkg.name, version: pkg.version, directory: dir, native };
    packages.set(dir, item);
    if (!isRoot && native) {
      const core=pkg.name==='@nativescript/core';
      if(core&&!coreAdapter.supported(pkg,dir,read)) fail('unavailable','NativeScript core requires the reviewed 9.1.3 compatibility-hook contract');
      keys(pkg.nativescript, core?['platforms','hooks']:['platforms'], 'package nativescript metadata');
      if (pkg.nativescript.platforms) {
        keys(pkg.nativescript.platforms, ['ios','android'], 'package platforms');
        for (const v of Object.values(pkg.nativescript.platforms)) if (typeof v !== 'string') fail('invalid_input','Native platform versions must be strings');
      }
      const pluginConfig = await config(dir, false);
      for (const key of ['id', 'appPath', 'appResourcesPath']) if (pluginConfig[key] !== undefined) fail('unavailable', 'App-only fields in plugin config are unsupported; move them to the application config');
      collect(dir, dir, pluginConfig, undefined, core);
      item.android = pluginConfig.android ?? {};
      item.iosRequirement = pkg.nativescript.platforms?.ios ?? '';
      item.androidRequirement = pkg.nativescript.platforms?.android ?? '';
    }
    for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      if (pkg[key] !== undefined) object(pkg[key], key);
    }
    const runtimes = isRoot ? Object.fromEntries(Object.entries(pkg.devDependencies || {}).filter(([name]) => ['@nativescript/ios', '@nativescript/android'].includes(name))) : {};
    const deps = { ...runtimes, ...pkg.peerDependencies, ...pkg.dependencies, ...pkg.optionalDependencies };
    for (const name of Object.keys(deps).sort()) {
      if (!/^(?:@[a-zA-Z0-9_.-]+\/)?[a-zA-Z0-9_.-]+$/.test(name)) fail('invalid_input', 'Invalid dependency package name');
      // Walk Node's actual lookup locations, bypassing exports/main restrictions on package.json.
      const locations = require('node:module').Module._nodeModulePaths(dir);
      const file = locations.map(p => path.join(p, name, 'package.json')).find(fs.existsSync);
      if (!file) {
        if (Object.hasOwn(pkg.optionalDependencies || {}, name) || (pkg.peerDependenciesMeta?.[name]?.optional && !Object.hasOwn(pkg.dependencies || {}, name))) continue;
        fail('unavailable', 'Required dependency is not installed; install project dependencies explicitly before Resolve');
      }
      const target = fs.realpathSync(path.dirname(file));
      edges.push({ from: dir, name, directory: target, location: path.dirname(file) });
      if (!packages.has(target)) await visit(target, json(file));
    }
  }
  await visit(root, app, true);
  // Explicit NativeSource groups can select a file already owned by an installed
  // native package. Compile physical membership once, preferring that package's
  // ownership over an app declaration; otherwise choose deterministically.
  const membership=new Map();
  for(const c of contributions){
    if(c.kind==='spm-remote')continue;
    const key=JSON.stringify([c.platform,c.kind,c.path]),previous=membership.get(key);
    if(!previous||(previous.packageDirectory===root&&c.packageDirectory!==root)||(previous.packageDirectory!==root&&c.packageDirectory!==root&&c.packageDirectory<previous.packageDirectory))membership.set(key,c);
  }
  let remote;
  try{remote=swiftPackages.merge(contributions,root);}catch{fail('invalid_input','Conflicting Swift package repositories, identities or plugin versions; select an explicit app version for the same repository');}
  for(const c of remote)membership.set(JSON.stringify(['spm-remote',c.spm.repositoryURL]),c);
  const result = { directory: projectDir, applicationID: cfg.id, config: normalized, packages: [...packages.values()].sort((a,b)=>a.directory.localeCompare(b.directory)), dependencies: edges, contributions:[...membership.values()], sources: [...sources].map(([path,digest])=>({path,digest})).sort((a,b)=>a.path.localeCompare(b.path)) };
  if(nativeSourceGroups.length)result.nativeSourceGroups=nativeSourceGroups;
  result.revision = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
  return result;
};

// Config code can throw arbitrary objects. Only resolver-created failures may
// cross the host boundary with remediation text.
module.exports = async payload => {
  try { return await resolve(payload); }
  catch (error) {
    if (safeFailures.has(error)) throw error;
    fail('invalid_input', 'Cannot read project resolution inputs; check config and installed native package files');
  }
};
