'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const fail = code => Object.assign(new Error(), {code});
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const optionalDigest = file => {try{return digest(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}};

// Configs/plugins are trusted project code, not a sandbox. The adapter still
// owns Vite's normal output, cache and listening settings. A plugin overriding
// those settings fails before output or server startup.
module.exports = function nativeConfig(p, vite, engine, development, aliases, updates) {
  const mode = p.configuration === 'debug' ? 'development' : 'production';
  const dependencies = new Map();
  if(p.bundlerConfigPath){
    if(!path.isAbsolute(p.bundlerConfigPath))throw fail('invalid_input');
    const expected = p.nativeSources.find(source=>source.Path===p.bundlerConfigPath)?.Digest;
    if(!expected || digest(p.bundlerConfigPath)!==expected)throw fail('restart_required');
    dependencies.set(p.bundlerConfigPath,expected);
  }
  function changed() {
    try { return [...dependencies].some(([file,hash])=>optionalDigest(file)!==hash); }
    catch { return true; }
  }
  async function config(command) {
    if(changed())throw fail('restart_required');
    let result;
    if(p.bundlerConfigPath){
      const loaded = await vite.loadConfigFromFile({command,mode,isSsrBuild:false,isPreview:false},p.bundlerConfigPath,p.projectDir,'silent');
      if(!loaded || !loaded.config || typeof loaded.config!=='object' || Array.isArray(loaded.config))throw fail('invalid_input');
      result=loaded.config;
      for(const file of loaded.dependencies){
        const real=fs.realpathSync(file), hash=digest(real);
        if(dependencies.has(real) && dependencies.get(real)!==hash)throw fail('restart_required');
        dependencies.set(real,hash);
      }
      if(changed())throw fail('restart_required');
    } else result=engine.typescriptConfig({mode},{typeCheck:false});
    if(development&&updates)updates();
    // Vite reads mode-specific env files after loading the config. Track absent
    // files too, so creating one requests re-resolution rather than an in-place
    // server restart with stale inline config.
    if(result.envFile!==false){
      const envDir=path.resolve(p.projectDir,result.envDir??'.');
      for(const name of ['.env','.env.local',`.env.${mode}`,`.env.${mode}.local`]){
        const file=path.join(envDir,name),hash=optionalDigest(file);
        if(dependencies.has(file)&&dependencies.get(file)!==hash)throw fail('restart_required');
        dependencies.set(file,hash);
      }
    }
    const runtime={main:'bundle.mjs',id:p.applicationID,...(p.android?{android:p.android}:{})};
    const metadata={
      name:'xplat-native-runtime-manifest',enforce:'pre',
      resolveId(id){if(id==='~/package.json')return '\0xplat-native-package';},
      load(id){if(id==='\0xplat-native-package')return `export default ${JSON.stringify(runtime)};`;},
      generateBundle(){this.emitFile({type:'asset',fileName:'package.json',source:JSON.stringify(runtime)});},
    };
    const owned={root:p.projectDir,configFile:false,cacheDir:p.cacheDirectory,mode,logLevel:'silent',
      build:{outDir:p.directory,emptyOutDir:true,write:true,watch:null},
      server:{host:'127.0.0.1',port:p.port,strictPort:true,open:false,https:undefined,middlewareMode:false},
    };
    const ownership={name:'xplat-native-ownership',enforce:'post',
      config(){return owned;},
      configResolved(config){
        if(config.root!==p.projectDir || path.resolve(config.cacheDir)!==p.cacheDirectory || config.mode!==mode ||
          path.resolve(config.build.outDir)!==p.directory || !config.build.write || config.build.watch ||
          development && (config.server.host!=='127.0.0.1'||config.server.port!==p.port||!config.server.strictPort||config.server.https||config.server.middlewareMode))throw fail('invalid_input');
        for(const options of [config.build.rolldownOptions,config.build.rollupOptions]){
          for(const output of [options?.output].flat())if(output && (output.dir || output.file))throw fail('invalid_input');
        }
      },
    };
    // Project presets already contain their framework engine. Do not merge a
    // second TypeScript preset or retain its independent config evaluator.
    async function flatten(value){
      value=await value;
      return Array.isArray(value)?(await Promise.all(value.map(flatten))).flat():[value];
    }
    // Engine plugin factories may start their vendor build before Vite awaits
    // the plugin array. Supply an alias-only resolved config first; the final
    // config hook rechecks imports already resolved by an early vendor pass.
    if(aliases)aliases.prepare(await vite.resolveConfig({root:p.projectDir,configFile:false,mode,logLevel:'silent',envFile:false,resolve:result.resolve},command));
    const plugins=(await flatten(result.plugins??[])).filter(plugin=>plugin && plugin.name!=='nsvite-nsconfig-as-json').map(plugin=>aliases?aliases.bindVendor(plugin):plugin);
    return {...result,...owned,build:{...result.build,...owned.build},server:{...result.server,...owned.server},
      plugins:[metadata,...(aliases?[aliases.plugin()]:[]),...(development?[require('./native-accept.cjs').plugin()]:[]),...plugins,ownership]};
  }
  return {config,changed,dependencies};
};
