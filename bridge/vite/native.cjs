'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { engineFailure } = require('./native-failure.cjs');
const fail = code => Object.assign(new Error(), { code });

// Runs in its own helper process. These environment/argv inputs belong only to
// the installed engine; the embedding Go process retains its globals unchanged.
module.exports = async function native(p, emit) {
  const development=p.mode==='native';
  if (!['native','native-bundle'].includes(p.mode) || !['ios','android'].includes(p.platform) || !['debug','release'].includes(p.configuration) || development && p.configuration!=='debug' ||
      ![p.projectDir,p.appPath,p.directory,p.cacheDirectory,p.entry].every(path.isAbsolute) ||
      development && (!Number.isInteger(p.port) || p.port < 1 || p.port > 65535) ||
      !Array.isArray(p.nativeInputs??[]) || !(p.nativeInputs??[]).every(path.isAbsolute) || !Array.isArray(p.nativeSources) ||
      !Array.isArray(p.inactiveNativeRoots??[]) || !(p.inactiveNativeRoots??[]).every(path.isAbsolute)) throw fail('invalid_input');
  const req = createRequire(path.join(p.projectDir,'package.json'));
  const sourceGroups=p.nativeSourceGroups??[];
  if(!Array.isArray(sourceGroups)||!sourceGroups.every(g=>g&&typeof g.name==='string'&&path.isAbsolute(g.path||'')&&path.isAbsolute(g.root||'')&&Array.isArray(g.files)&&g.files.every(path.isAbsolute)))throw fail('invalid_input');
  const nativeChanged = require('./native-inputs.cjs')(p.nativeInputs??[],p.nativeSources,sourceGroups,p.projectDir,p.inactiveNativeRoots??[]);
  if(sourceGroups.length){try{if(nativeChanged())throw fail('restart_required');}catch{throw fail('restart_required');}}
  const pkg = JSON.parse(fs.readFileSync(path.join(p.projectDir,'package.json'),'utf8'));
  // The installed engine derives its entry from the root package. Refuse a
  // disagreement instead of emitting a bootstrap for a different application.
  if (typeof pkg.main !== 'string' || fs.realpathSync(path.resolve(p.projectDir,pkg.main)) !== p.entry) throw fail('invalid_input');
  process.env.NS_VITE_DIST_DIR = p.directory;
  process.env.NS_HMR_PORT = String(p.port || 5173);
  process.env.NS_HMR_HOST = p.hmrHost || '127.0.0.1';
  process.env.NS_HTTPS = 'false';
  process.env.NATIVESCRIPT_BUNDLER_ENV = JSON.stringify({[p.platform]:true,hmr:development,production:p.configuration==='release'});
  if(p.configuration==='release')delete process.env.DEBUG;
  process.argv.push('--',`--env.${p.platform}`,...(development?['--env.hmr']:[]));
  let aliases;
  try{aliases=require('./native-aliases.cjs')(req);}catch{throw fail('unavailable');}
  try { return await aliases.run(async()=>{
  let engine, vite, updates;
  try {
    const engineFile = req.resolve('@nativescript/vite');
    const enginePkg = JSON.parse(fs.readFileSync(path.join(path.dirname(engineFile),'package.json'),'utf8'));
    // Version-qualified engine and matching Vite major; never invoke upstream CLI.
    if (!['8.0.20','8.0.21'].includes(enginePkg.version)) throw fail('unavailable');
    engine = await import(pathToFileURL(req.resolve('@nativescript/vite/typescript')).href);
    vite = await import(pathToFileURL(req.resolve('vite')).href);
    if (!/^8\./.test(vite.version)) throw fail('unavailable');
    const framework = await import(pathToFileURL(req.resolve('@nativescript/vite/framework')).href);
    updates=require('./native-update.cjs')(framework,req);
  } catch (error) { throw fail(error.code === 'invalid_input' ? 'invalid_input' : 'unavailable'); }
  const configs=require('./native-config.cjs')(p,vite,engine,development,aliases,updates);
  function manifest(){
    const files=[];
    function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const file=path.join(dir,entry.name);
      if(entry.isDirectory())walk(file);else if(entry.isFile())files.push(file);else throw fail('operation_failed');
    }}
    walk(p.directory);
    const entry=path.join(p.directory,'bundle.mjs');
    if(!files.includes(entry))throw fail('operation_failed');
    return {directory:p.directory,entry,files:files.sort()};
  }
  // Engine failures carry a bounded, sanitized detail summary into the error frame.
  const engineCall = async run => { try { return await run(); } catch (error) { throw engineFailure(error, p.projectDir); } };
  if(!development){
    await engineCall(async()=>aliases.run(async()=>vite.build(await configs.config('build'))));
    if(configs.changed())throw fail('restart_required');
    return manifest();
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
    server = await engineCall(async()=>vite.createServer(await configs.config('serve')));
    // Vite must not restart this owned session internally with a stale resolved
    // project. Hand any restart request back to the Go lifecycle coordinator.
    server.restart=async()=>{rejectLifetime(fail('restart_required'));};
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
    for(const group of sourceGroups)directories.set(group.root,true);
    for(const file of configs.dependencies.keys()){
      let dir=path.dirname(file),recursive=false;
      while(!fs.existsSync(dir)){recursive=true;const parent=path.dirname(dir);if(parent===dir)break;dir=parent;}
      directories.set(dir,recursive||directories.get(dir)||false);
    }
    for (const [dir,recursive] of directories) {
      if (!fs.existsSync(dir)) continue;
      const watcher = fs.watch(dir,{recursive},(_event,name) => {
        const file = name && path.resolve(dir,String(name));
        try { if (configs.changed() || nativeChanged(file)) rejectLifetime(fail('restart_required')); }
        catch { rejectLifetime(fail('restart_required')); }
      });
      watcher.on('error',() => rejectLifetime(fail('restart_required')));
      nativeWatchers.push(watcher);
    }
    try { await server.listen(); }
    catch(error) { if (/^Port \d+ is already in use$/.test(error.message || '')) throw fail('EADDRINUSE'); throw engineFailure(error, p.projectDir); }
    await engineCall(async()=>aliases.run(async()=>vite.build(await configs.config('build'))));
    if (terminalError) throw engineFailure(terminalError, p.projectDir);
    if(configs.changed())throw fail('restart_required');
    emit({type:'ready',manifest:manifest(),
      endpoint:{url:`http://127.0.0.1:${p.port}`,hmrURL:`ws://${p.hmrHost || '127.0.0.1'}:${p.port}/ns-hmr`}});
    await engineCall(()=>lifetime);
  } finally { for(const watcher of nativeWatchers) watcher.close(); await server?.close(); }
  }); } finally { aliases.close(); }
};
