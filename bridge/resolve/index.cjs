'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { stripTypeScriptTypes } = require('node:module');
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
  const sources = new Map(), packages = new Map(), edges = [], contributions = [];
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
        if (!stripTypeScriptTypes) fail('unavailable', 'TypeScript config needs Node with stripTypeScriptTypes support (22.13 or newer); use JavaScript config on older Node');
        // Transform types only; relative runtime imports retain the project base URL.
        const code = stripTypeScriptTypes(text, { mode: 'strip' });
        const module = new (require('node:module').Module)(file);
        module.filename = file;
        module.paths = require('node:module').Module._nodeModulePaths(dir);
        // Native Node ESM loading supports type-only config imports without a compiler install.
        if (/\b(?:import|export)\b/.test(code)) value = await import(pathToFileURL(file).href);
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
  function collect(dir, owner, cfg, resources) {
    keys(cfg, ['id', 'appPath', 'appResourcesPath', 'ios', 'android'], 'config');
    if (cfg.ios !== undefined) keys(cfg.ios, [], 'iOS config');
    if (cfg.android !== undefined) keys(cfg.android, ['v8Flags', 'markingMode'], 'Android config');
    for (const key of ['v8Flags', 'markingMode']) if (cfg.android?.[key] !== undefined && typeof cfg.android[key] !== 'string') fail('invalid_input', 'Android runtime settings must be strings');
    if (fs.existsSync(path.join(dir, 'hooks'))) fail('unavailable', 'Legacy package hooks are unsupported; migrate to the extension SDK before preparing');
    function walk(folder, platform) {
      if (!fs.existsSync(folder)) return;
      for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name, 'en'))) {
        const file = path.join(folder, entry.name);
        if (entry.isSymbolicLink()) fail('unavailable', 'Symlinks inside native contribution trees are unsupported; use a linked package root instead');
        if (entry.isDirectory() && !/\.(framework|xcframework|xcassets|bundle)$/.test(entry.name)) { walk(file, platform); continue; }
        let kind;
        const ext = path.extname(entry.name).toLowerCase();
        if (platform === 'ios') {
          if (entry.name === 'Podfile' || ext === '.podspec') kind = 'pods';
          else if (entry.name === 'Package.swift') kind = 'spm';
          else if (['.swift', '.m', '.mm', '.h', '.c', '.cpp'].includes(ext)) kind = 'source';
          else if (['.framework', '.xcframework', '.a'].includes(ext)) kind = 'framework';
          else if (['.plist', '.xcconfig', '.entitlements'].includes(ext)) kind = 'configuration';
          else if (['.xcassets', '.bundle', '.png', '.jpg', '.jpeg', '.storyboard', '.xib', '.strings', '.json'].includes(ext)) kind = 'resource';
        } else {
          if (['.aar', '.jar', '.so'].includes(ext)) kind = 'library';
          else if (['.java', '.kt', '.c', '.cpp', '.h'].includes(ext)) kind = 'source';
          else if (['.gradle', '.properties'].includes(ext) || entry.name === 'AndroidManifest.xml') kind = 'configuration';
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
  const normalized = { appPath: directory(root, cfg.appPath, 'app'), appResourcesPath: directory(root, cfg.appResourcesPath, 'App_Resources'), android: cfg.android ?? {} };
  collect(root, root, cfg, normalized.appResourcesPath);
  async function visit(dir, pkg, isRoot = false) {
    if (packages.has(dir)) return;
    if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string') fail('invalid_input', 'Every resolved package must have a name and version');
    const native = pkg.nativescript !== undefined;
    const item = { name: pkg.name, version: pkg.version, directory: dir, native };
    packages.set(dir, item);
    if (!isRoot && native) {
      keys(pkg.nativescript, ['platforms'], 'package nativescript metadata');
      if (pkg.nativescript.platforms) {
        keys(pkg.nativescript.platforms, ['ios','android'], 'package platforms');
        for (const v of Object.values(pkg.nativescript.platforms)) if (typeof v !== 'string') fail('invalid_input','Native platform versions must be strings');
      }
      const pluginConfig = await config(dir, false);
      for (const key of ['id', 'appPath', 'appResourcesPath']) if (pluginConfig[key] !== undefined) fail('unavailable', 'App-only fields in plugin config are unsupported; move them to the application config');
      collect(dir, dir, pluginConfig);
      item.android = pluginConfig.android ?? {};
      item.iosRequirement = pkg.nativescript.platforms?.ios ?? '';
      item.androidRequirement = pkg.nativescript.platforms?.android ?? '';
    }
    for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      if (pkg[key] !== undefined) object(pkg[key], key);
    }
    const deps = { ...pkg.peerDependencies, ...pkg.dependencies, ...pkg.optionalDependencies };
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
  const result = { directory: projectDir, applicationID: cfg.id, config: normalized, packages: [...packages.values()].sort((a,b)=>a.directory.localeCompare(b.directory)), dependencies: edges, contributions, sources: [...sources].map(([path,digest])=>({path,digest})).sort((a,b)=>a.path.localeCompare(b.path)) };
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
