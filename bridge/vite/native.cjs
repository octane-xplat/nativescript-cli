'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const fail = code => Object.assign(new Error(), { code });

// Runs in its own helper process. These environment/argv inputs belong only to
// the installed engine; the embedding Go process retains its globals unchanged.
module.exports = async function native(p, emit) {
  if (!['ios','android'].includes(p.platform) || p.configuration !== 'debug' ||
      ![p.projectDir,p.appPath,p.directory,p.cacheDirectory,p.entry].every(path.isAbsolute) ||
      !Number.isInteger(p.port) || p.port < 1 || p.port > 65535 ||
      !Array.isArray(p.nativeInputs) || !p.nativeInputs.every(path.isAbsolute)) throw fail('invalid_input');
  const req = createRequire(path.join(p.projectDir,'package.json'));
  const pkg = JSON.parse(fs.readFileSync(path.join(p.projectDir,'package.json'),'utf8'));
  // The installed engine derives its entry from the root package. Refuse a
  // disagreement instead of emitting a bootstrap for a different application.
  if (typeof pkg.main !== 'string' || fs.realpathSync(path.resolve(p.projectDir,pkg.main)) !== p.entry) throw fail('invalid_input');
  process.env.NS_VITE_DIST_DIR = p.directory;
  process.env.NS_HMR_PORT = String(p.port);
  process.env.NS_HMR_HOST = p.hmrHost || '127.0.0.1';
  process.env.NS_HTTPS = 'false';
  process.env.NATIVESCRIPT_BUNDLER_ENV = JSON.stringify({[p.platform]:true,hmr:true});
  process.argv.push('--',`--env.${p.platform}`,'--env.hmr');
  let engine, vite;
  try {
    const engineFile = req.resolve('@nativescript/vite');
    const enginePkg = JSON.parse(fs.readFileSync(path.join(path.dirname(engineFile),'package.json'),'utf8'));
    // Version-qualified engine and matching Vite major; never invoke upstream CLI.
    if (enginePkg.version !== '8.0.21') throw fail('unavailable');
    engine = await import(pathToFileURL(req.resolve('@nativescript/vite/typescript')).href);
    vite = await import(pathToFileURL(req.resolve('vite')).href);
    if (!/^8\./.test(vite.version)) throw fail('unavailable');
  } catch (error) { throw fail(error.code === 'invalid_input' ? 'invalid_input' : 'unavailable'); }
  function config() {
    const result = engine.typescriptConfig({mode:'development'},{typeCheck:false});
    // Configuration was already resolved by R1. Replace only the engine's TS-only
    // config-to-package adapter with the normalized runtime manifest boundary.
    const runtime = {main:'bundle.mjs',id:p.applicationID,...(p.android ? {android:p.android} : {})};
    const metadata = {
      name:'xplat-native-runtime-manifest', enforce:'pre',
      resolveId(id) { if (id === '~/package.json') return '\0xplat-native-package'; },
      load(id) { if (id === '\0xplat-native-package') return `export default ${JSON.stringify(runtime)};`; },
      generateBundle() { this.emitFile({type:'asset',fileName:'package.json',source:JSON.stringify(runtime)}); },
    };
    result.plugins = [metadata,...result.plugins.flat(Infinity).filter(plugin => plugin?.name !== 'nsvite-nsconfig-as-json')];
    result.root = p.projectDir;
    result.configFile = false;
    result.cacheDir = p.cacheDirectory;
    result.logLevel = 'silent';
    result.server = {...result.server,host:'127.0.0.1',port:p.port,strictPort:true,open:false,https:undefined};
    result.build = {...result.build,outDir:p.directory,emptyOutDir:true,watch:null};
    return result;
  }
  let server;
  const nativeWatchers = [];
  let terminalError;
  let rejectLifetime;
  const lifetime = new Promise((_,reject) => { rejectLifetime = error => { terminalError = error; reject(error); }; });
  // Attach immediately: a native edit during the initial build must not produce
  // an unhandled rejection or allow stale output to reach the native compiler.
  lifetime.catch(() => {});
  try {
    server = await vite.createServer(config());
    server.httpServer.on('close',() => rejectLifetime(fail('server_closed')));
    server.httpServer.on('error',rejectLifetime);
    // Vite intentionally ignores node_modules. Native plugin inputs can live
    // there, so monitor them independently instead of silently missing edits.
    const directories = new Map();
    for (const input of p.nativeInputs) {
      const recursive = fs.existsSync(input) && fs.statSync(input).isDirectory();
      const dir = recursive ? input : path.dirname(input);
      directories.set(dir,recursive || directories.get(dir) || false);
    }
    for (const [dir,recursive] of directories) {
      if (!fs.existsSync(dir)) continue;
      const watcher = fs.watch(dir,{recursive},(_event,name) => {
        const file = name && path.resolve(dir,String(name));
        if (!file || p.nativeInputs.some(input => file === input || file.startsWith(input + path.sep))) rejectLifetime(fail('restart_required'));
      });
      watcher.on('error',() => rejectLifetime(fail('restart_required')));
      nativeWatchers.push(watcher);
    }
    try { await server.listen(); }
    catch(error) { if (/^Port \d+ is already in use$/.test(error.message || '')) throw fail('EADDRINUSE'); throw error; }
    await vite.build(config());
    if (terminalError) throw terminalError;
    const files = [];
    function walk(dir) {
      for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
        const file = path.join(dir,entry.name);
        if(entry.isDirectory()) walk(file);
        else if(entry.isFile()) files.push(file);
        else throw fail('operation_failed');
      }
    }
    walk(p.directory);
    if (!files.includes(path.join(p.directory,'bundle.mjs'))) throw fail('operation_failed');
    emit({type:'ready',manifest:{directory:p.directory,entry:path.join(p.directory,'bundle.mjs'),files:files.sort()},
      endpoint:{url:`http://127.0.0.1:${p.port}`,hmrURL:`ws://${p.hmrHost || '127.0.0.1'}:${p.port}/ns-hmr`}});
    await lifetime;
  } finally { for(const watcher of nativeWatchers) watcher.close(); await server?.close(); }
};
