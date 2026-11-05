'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {Module,createRequire}=require('node:module');
const {AsyncLocalStorage}=require('node:async_hooks');
const fail=code=>Object.assign(new Error(),{code});
const passes=new Set(['ns-vendor-entry.ts','ns-deps-bundle-discovery.ts','ns-deps-bundle-entry.ts']);
const physical=file=>{try{return fs.realpathSync(file);}catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')return file;throw error;}};

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
    state.vendorBuilt=true;
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
    // The engine's separate esbuild pass must share Vite's module identity.
    // Otherwise aliases can use real paths while direct imports retain a
    // symlink path, evaluating native class registration twice.
    const plugins=[plugin,...(options.plugins??[])].map(plugin=>state.preserveSymlinks?plugin:{...plugin,setup(builder){
      // esbuild treats custom resolver paths as module identities as supplied;
      // preserveSymlinks:false alone canonicalizes only its built-in resolver.
      // Keep virtual namespaces, external imports and all other result fields.
      return plugin.setup({...builder,onResolve(options,resolve){builder.onResolve(options,async args=>{
        const result=await resolve(args);
        if(!result?.path||result.external||result.namespace&&result.namespace!=='file'||!path.isAbsolute(result.path))return result;
        return {...result,path:physical(result.path)};
      });}});
    }});
    return original.build({...options,preserveSymlinks:state.preserveSymlinks,plugins});
  };
  sdk.exports=new Proxy(original,{get(target,key,receiver){return key==='build'?build:Reflect.get(target,key,receiver);}});
  sdk.loaded=true;req.cache[file]=sdk;
  return {
    run(work){
      const state={used:[]};state.ready=new Promise((resolve,reject)=>{state.accept=resolve;state.reject=reject;});state.ready.catch(()=>{});
      return context.run(state,async()=>{try{return await work();}catch(error){state.reject(error);throw error;}});
    },
    prepare(config){const state=context.getStore();if(!state)throw fail('invalid_input');if(state.vendorBuilt&&state.preserveSymlinks!==config.resolve.preserveSymlinks)throw fail('unavailable');state.preserveSymlinks=config.resolve.preserveSymlinks;state.aliases=config.resolve.alias;state.resolve=config.createResolver();state.accept();},
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
    // Rolldown hooks can run outside Node's async context. Retain this config's
    // state explicitly, never fall back to another build's active context.
    plugin(){const state=context.getStore();if(!state)throw fail('invalid_input');return {name:'xplat-native-vendor-alias-context',enforce:'pre',
    async resolveId(id,importer,options){
      if(state.preserveSymlinks!==false||id.startsWith('\0'))return;
      const resolved=await this.resolve(id,importer,{...options,skipSelf:true});
      if(!resolved?.id||resolved.external||resolved.id.startsWith('\0'))return resolved;
      const query=resolved.id.indexOf('?'),file=query<0?resolved.id:resolved.id.slice(0,query),suffix=query<0?'':resolved.id.slice(query);
      if(!path.isAbsolute(file))return resolved;
      return {...resolved,id:physical(file)+suffix};
    },
    async configResolved(config){
      if(state.vendorBuilt&&state.preserveSymlinks!==config.resolve.preserveSymlinks)throw fail('unavailable');
      const resolve=config.createResolver();
      for(const use of state.used){
        const late=config.resolve.alias.find(alias=>matches(alias.find,use.id));
        if(!use.alias&&!late)continue;
        if(!use.alias||!late||await use.resolution!==await resolve(use.id,use.importer))throw fail('unavailable');
      }
      state.preserveSymlinks=config.resolve.preserveSymlinks;state.aliases=config.resolve.alias;state.resolve=resolve;
      state.accept();
    }};},
    close(){context.disable();original.stop();if(req.cache[file]===sdk)delete req.cache[file];},
  };
};
