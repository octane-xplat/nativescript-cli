'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const fail = code => Object.assign(new Error(), { code });
module.exports = async function bundle(p, emit) {
  if (['native','native-bundle'].includes(p.mode)) return require('./native.cjs')(p, emit);
  for (const key of ['projectDir', 'directory', 'entry']) if (!path.isAbsolute(p[key] || '')) throw fail('invalid_input');
  if (!['bundle', 'watch'].includes(p.mode)) throw fail('invalid_input');
  const req = createRequire(path.join(p.projectDir, 'package.json'));
  let vite;
  try { vite = await import(pathToFileURL(req.resolve('vite')).href); } catch { throw fail('unavailable'); }
  // Qualified API range. New major versions require explicit adapter qualification.
  if (!/^7\./.test(vite.version)) throw fail('unavailable');
  if(p.platform && (!['ios','android'].includes(p.platform)||!path.isAbsolute(p.appPath||'')||!['debug','release'].includes(p.configuration))) throw fail('invalid_input');
  const runtimePackage={main:'bundle.js',...(p.android?{id:p.applicationID,android:p.android}:{})};
  // Core's package sideEffects omits its globals polyfill imports; keep side
  // effects for every module inside the resolved core package or
  // XMLHttpRequest/FormData/Blob/File/FileReader globals are dropped.
  const coreSideEffects=(()=>{
    if(!p.platform)return null;
    let core;
    try{core=fs.realpathSync(path.dirname(req.resolve('@nativescript/core/package.json')));}catch{return null;}
    return {
      name:'xplat-core-side-effects',
      enforce:'pre',
      async resolveId(source,importer,options){
        const r=await this.resolve(source,importer,{...options,skipSelf:true});
        if(r&&!r.external){
          let file=r.id.split('?')[0];
          try{file=fs.realpathSync(file);}catch{}
          if(file===core||file.startsWith(core+path.sep))return {...r,moduleSideEffects:true};
        }
        return r;
      },
    };
  })();
  let server, watcher;
  let latest;
  let failWatch;
  const manifest = {
    name: 'xplat-emitted-manifest',
    enforce: 'pre',
    resolveId(source) {
      if(p.appPath && [path.join(p.appPath,'package.json'),'~/package.json'].includes(source)) return '\0xplat-app-package';
    },
    load(id) {
      if(id!=='\0xplat-app-package') return;
      const file=path.join(p.appPath,'package.json');
      const pkg={...(fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{}),...runtimePackage};
      return `export default ${JSON.stringify(pkg)};`;
    },
    buildStart() {
      for (const name of ['package.json', 'nativescript.config.js', 'nativescript.config.cjs', 'nativescript.config.mjs', 'nativescript.config.ts']) {
        const file = path.join(p.projectDir, name); if (fs.existsSync(file)) this.addWatchFile(file);
      }
      const appPackage = path.join(path.dirname(p.entry), 'package.json');
      if (fs.existsSync(appPackage)) this.addWatchFile(appPackage);
    },
    watchChange(file) {
      if (/nativescript\.config\.|package\.json$/.test(file)) failWatch?.(fail('restart_required'));
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'package.json', source: JSON.stringify(runtimePackage) });
    },
    writeBundle(options, output) {
      const files = Object.keys(output).sort().map(name => path.join(p.directory, name));
      const entry = Object.values(output).find(file => file.type === 'chunk' && file.isEntry);
      if (!entry) throw fail('operation_failed');
      latest = { directory: p.directory, entry: path.join(p.directory, entry.fileName), files };
      if (p.mode === 'watch') emit({ type: 'emitted', manifest: latest });
    },
  };
  const config = {
    root: p.projectDir, configFile: false, logLevel: 'silent', mode: p.mode === 'watch' ? 'development' : 'production',
    ...(p.platform ? {
      resolve: { conditions: ['native', p.platform], extensions: [`.${p.platform}.ts`, `.${p.platform}.js`, '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'], alias: { '~': p.appPath } },
      // Core's native modules read these at startup; this adapter emits an ESM-derived IIFE.
      define: { 'global.isIOS': String(p.platform==='ios'), 'global.isAndroid': String(p.platform==='android'), '__IOS__': String(p.platform==='ios'), '__ANDROID__': String(p.platform==='android'), '__APPLE__': String(p.platform==='ios'), '__VISIONOS__': 'false', '__COMMONJS__': 'false', '__DEV__': String(p.configuration==='debug') },
    } : {}),
    plugins: coreSideEffects?[manifest,coreSideEffects]:[manifest],
    build: { outDir: p.directory, emptyOutDir: false, minify: false,
      lib: { entry: p.entry, formats: ['iife'], name: 'NativeScriptApp', fileName: () => 'bundle.js' },
      watch: p.mode === 'watch' ? {} : null,
    },
  };
  if (p.mode === 'bundle') { await vite.build(config); return latest; }
  try {
    if (!p.callerEndpoint) {
      server = await vite.createServer({ root: p.projectDir, configFile: false, logLevel: 'silent',
        resolve:config.resolve, define:config.define, plugins:[manifest],
        server: { host: '127.0.0.1', port: p.port || 0, strictPort: true, open: false,
          hmr: { host: p.hmrHost || '127.0.0.1', clientPort: p.hmrPort || undefined, path: '/__xplat_hmr' } } });
      try { await server.listen(); } catch (error) { if (/^Port \d+ is already in use$/.test(error.message || '')) throw fail('EADDRINUSE'); throw error; }
    }
    const address = server?.httpServer.address();
    const endpoint = p.callerEndpoint || { url: `http://127.0.0.1:${address.port}`, hmrURL: `ws://${p.hmrHost || '127.0.0.1'}:${p.hmrPort || address.port}/__xplat_hmr` };
    await new Promise(async (resolve, reject) => {
      try {
        failWatch = reject;
        server?.httpServer.on('close', () => reject(fail('server_closed')));
        server?.httpServer.on('error', reject);
        watcher = await vite.build(config);
        let ready = false;
        watcher.on('event', event => {
          if (event.code === 'ERROR') reject(fail('operation_failed'));
          if (event.code === 'END' && !ready) { ready = true; emit({ type: 'ready', manifest: latest, endpoint }); }
        });
        // Bootstrap edits trigger the same full emitted bundle pipeline as imports.
        // Config/native input edits require caller re-resolution, never silent stale reuse.
        server?.watcher.on('change', file => {
          if (/nativescript\.config\.|package\.json$/.test(file)) reject(fail('restart_required'));
        });
      } catch (error) { reject(error); }
    });
  } finally { await watcher?.close(); await server?.close(); }
};
