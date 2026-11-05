'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {Module,createRequire}=require('node:module');
const {AsyncLocalStorage}=require('node:async_hooks');
const fail=code=>Object.assign(new Error(),{code});
const passes=new Set(['ns-vendor-entry.ts','ns-deps-bundle-discovery.ts','ns-deps-bundle-entry.ts']);

// The qualified engine invokes esbuild separately from Vite. Load that exact
// installed CJS SDK once, before ESM consumers snapshot its exports, and adapt
// only its three vendor/dependency passes. No installed source is rewritten.
module.exports=function installAliases(projectRequire){
  const req=createRequire(projectRequire.resolve('@nativescript/vite'));
  const file=req.resolve('esbuild');
  if(req.cache[file])throw fail('unavailable');
  const sdk=new Module(file);
  sdk.filename=file;sdk.paths=Module._nodeModulePaths(path.dirname(file));
  sdk._compile(fs.readFileSync(file,'utf8'),file);
  const original=sdk.exports;
  if(!/^0\.27\./.test(original.version))throw fail('unavailable');
  const context=new AsyncLocalStorage();
  // The engine's deps cache does not key on Vite aliases. Keep alias-bearing
  // passes in this helper's lifetime rather than reusing another config's code.
  process.env.NS_DEPS_BUNDLE_NO_DISK_CACHE='1';
  const core=path.dirname(projectRequire.resolve('@nativescript/core/package.json'));
  function matches(find,id){
    if(typeof find==='string')return id===find||id.startsWith(find+'/');
    if(find instanceof RegExp){find.lastIndex=0;const result=find.test(id);find.lastIndex=0;return result;}
    return false;
  }
  const build=async options=>{
    const state=context.getStore();
    if(!passes.has(options?.stdin?.sourcefile))return original.build(options);
    if(!state)throw fail('unavailable');
    await state.ready;
    const plugin={name:'xplat-native-vite-aliases',setup(builder){
      builder.onResolve({filter:/.*/},async args=>{
        // Core/engine imports belong to the engine's single native realm.
        if(/^(?:@nativescript\/(?:core|vite)(?:\/|$)|\.|\/|[A-Za-z]:)/.test(args.path))return;
        const alias=state.aliases.find(alias=>matches(alias.find,args.path));
        const use={id:args.path,importer:args.importer||undefined,alias};state.used.push(use);
        if(!alias)return;
        use.resolution=state.resolve(args.path,use.importer);
        const resolved=await use.resolution;
        if(!resolved||resolved.startsWith('\0')||!path.isAbsolute(resolved))throw fail('unavailable');
        const relative=path.relative(fs.realpathSync(core),fs.realpathSync(resolved));
        if(relative!== '..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))throw fail('unavailable');
        return {path:resolved};
      });
    }};
    return original.build({...options,plugins:[plugin,...(options.plugins??[])]});
  };
  sdk.exports=new Proxy(original,{get(target,key,receiver){return key==='build'?build:Reflect.get(target,key,receiver);}});
  sdk.loaded=true;req.cache[file]=sdk;
  return {
    run(work){
      const state={used:[]};state.ready=new Promise((resolve,reject)=>{state.accept=resolve;state.reject=reject;});state.ready.catch(()=>{});
      return context.run(state,async()=>{try{return await work();}catch(error){state.reject(error);throw error;}});
    },
    prepare(config){const state=context.getStore();if(!state)throw fail('invalid_input');state.aliases=config.resolve.alias;state.resolve=config.createResolver();state.accept();},
    bindVendor(plugin){
      if(plugin.name!=='nativescript-vendor-manifest')return plugin;
      const state=context.getStore();if(!state)throw fail('invalid_input');
      const bind=hook=>function(...args){return context.run(state,()=>hook.apply(this,args));};
      const result={...plugin};
      for(const [key,value] of Object.entries(plugin)){
        if(typeof value==='function')result[key]=bind(value);
        else if(value&&typeof value==='object'&&typeof value.handler==='function')result[key]={...value,handler:bind(value.handler)};
      }
      return result;
    },
    plugin(){return {name:'xplat-native-vendor-alias-context',enforce:'pre',async configResolved(config){
      const state=context.getStore();if(!state)throw fail('invalid_input');
      const resolve=config.createResolver();
      for(const use of state.used){
        const late=config.resolve.alias.find(alias=>matches(alias.find,use.id));
        if(!use.alias&&!late)continue;
        if(!use.alias||!late||await use.resolution!==await resolve(use.id,use.importer))throw fail('unavailable');
      }
      state.aliases=config.resolve.alias;state.resolve=resolve;
      state.accept();
    }};},
    close(){context.disable();original.stop();if(req.cache[file]===sdk)delete req.cache[file];},
  };
};
