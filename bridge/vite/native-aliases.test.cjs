'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createRequire}=require('node:module');const {pathToFileURL}=require('node:url');

test('real SDK aliases keep async configs separate and leave other builds/realms alone',{skip:!process.env.NS_NATIVE_VITE_DIR},async t=>{
 const req=createRequire(path.join(process.env.NS_NATIVE_VITE_DIR,'package.json'));
 const bridge=require('./native-aliases.cjs')(req);
 const engineReq=createRequire(req.resolve('@nativescript/vite'));
 const sdk=await import(pathToFileURL(engineReq.resolve('esbuild')).href);
 const vite=await import(pathToFileURL(req.resolve('vite')).href);
 t.after(()=>{sdk.stop();bridge.close();});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-alias-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const name of ['one','two']){fs.mkdirSync(path.join(dir,name));fs.writeFileSync(path.join(dir,name,'part.js'),`export const value=${JSON.stringify(name)};`);}
 const options=(source='ns-vendor-entry.ts',input='fixture-alias/part')=>({stdin:{contents:`import {value} from '${input}';console.log(value);`,sourcefile:source,resolveDir:dir},bundle:true,write:false,logLevel:'silent'});
 const configure=async(name,extra=[])=>{
  const config=await vite.resolveConfig({root:dir,configFile:false,logLevel:'silent',envFile:false,resolve:{alias:[{find:/^fixture-alias(?=\/|$)/,replacement:path.join(dir,name)},...extra]}},'build');
  bridge.prepare(config);await bridge.plugin().configResolved(config);return config;
 };
 const both=await Promise.all(['one','two'].map(name=>bridge.run(async()=>{await configure(name);return (await sdk.build(options())).outputFiles[0].text;})));
 assert.match(both[0],/"one"/);assert.doesNotMatch(both[0],/"two"/);assert.match(both[1],/"two"/);
 await bridge.run(async()=>{
  await configure('one',[{find:'custom',replacement:'unused',customResolver:()=>({id:path.join(dir,'two/part.js')})}]);
  assert.match((await sdk.build(options('ns-deps-bundle-entry.ts','custom'))).outputFiles[0].text,/"two"/);
  await assert.rejects(sdk.build(options('ordinary-build.ts')));
  await assert.rejects(sdk.build(options('ns-vendor-entry.ts','fixture-alias-extra/part')));
  const core=await sdk.build({...options('ns-vendor-entry.ts','@nativescript/core'),external:['@nativescript/core']});
  assert.match(core.outputFiles[0].text,/@nativescript\/core/);
  const coreConfig=await vite.resolveConfig({root:dir,configFile:false,logLevel:'silent',envFile:false,resolve:{alias:[{find:'duplicate-core',replacement:req.resolve('@nativescript/core')}]}},'build');
  bridge.prepare(coreConfig);
  await assert.rejects(sdk.build(options('ns-deps-bundle-discovery.ts','duplicate-core')));
 });
 await bridge.run(async()=>{
  const pending=sdk.build(options());
  await configure('one');
  assert.match((await pending).outputFiles[0].text,/"one"/);
  const config=await vite.resolveConfig({root:dir,configFile:false,logLevel:'silent',envFile:false,resolve:{alias:[{find:/\.css$/,replacement:'unused'},{find:/^fixture-alias(?=\/|$)/,replacement:path.join(dir,'one')}]}},'build');
  await bridge.plugin().configResolved(config); // unrelated late CSS alias is safe
  const changed=await vite.resolveConfig({root:dir,configFile:false,logLevel:'silent',envFile:false,resolve:{alias:[{find:/^fixture-alias(?=\/|$)/,replacement:path.join(dir,'two')}]}},'build');
  await assert.rejects(bridge.plugin().configResolved(changed),error=>error.code==='unavailable');
 });
 const hooks=await Promise.all(['one','two'].map(name=>bridge.run(async()=>{
  await configure(name);
  return bridge.bindVendor({name:'nativescript-vendor-manifest',buildStart:{order:'pre',handler(){assert.equal(this.owner,name);return sdk.build(options());}}});
 })));
 const builds=await Promise.all(hooks.map((hook,i)=>{assert.equal(hook.buildStart.order,'pre');return hook.buildStart.handler.call({owner:['one','two'][i]});}));
 assert.match(builds[0].outputFiles[0].text,/"one"/);assert.match(builds[1].outputFiles[0].text,/"two"/);
 await assert.rejects(sdk.build(options()),error=>error.code==='unavailable');
});
