'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createRequire}=require('node:module');const {pathToFileURL}=require('node:url');
const {runInNewContext}=require('node:vm');

test('real SDK aliases keep async configs separate and leave other builds/realms alone',{skip:!process.env.NS_NATIVE_VITE_DIR},async t=>{
 const req=createRequire(path.join(process.env.NS_NATIVE_VITE_DIR,'package.json'));
 const bridge=require('./native-aliases.cjs')(req);
 const engineReq=createRequire(req.resolve('@nativescript/vite'));
 const sdk=await import(pathToFileURL(engineReq.resolve('esbuild')).href);
 const vite=await import(pathToFileURL(req.resolve('vite')).href);
 t.after(()=>{sdk.stop();bridge.close();});
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'native-alias-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
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
 const real=path.join(dir,'singleton.js'),linked=path.join(dir,'linked-singleton.js');
 fs.writeFileSync(real,'globalThis.instances=(globalThis.instances??0)+1;export const token={};');fs.symlinkSync(real,linked);
 for(const preserveSymlinks of [false,true])await bridge.run(async()=>{
  const config=await vite.resolveConfig({root:dir,configFile:false,logLevel:'silent',envFile:false,resolve:{preserveSymlinks,alias:[{find:'fixture-singleton',replacement:real}]}},'build');
  bridge.prepare(config);await bridge.plugin().configResolved(config);
  const result=await sdk.build({stdin:{sourcefile:'ns-vendor-entry.ts',resolveDir:dir,contents:`import {token as a} from 'fixture-singleton';import {token as b} from ${JSON.stringify(linked)};globalThis.same=a===b;`},bundle:true,write:false,logLevel:'silent',preserveSymlinks:!preserveSymlinks});
  const realm={};runInNewContext(result.outputFiles[0].text,realm);
  assert.equal(realm.same,!preserveSymlinks,'vendor pass must follow the selected Vite symlink policy');assert.equal(realm.instances,preserveSymlinks?2:1);
  const custom=await sdk.build({stdin:{sourcefile:'ns-deps-bundle-entry.ts',resolveDir:dir,contents:"import {token as a} from 'fixture-singleton';import {token as b} from 'engine-singleton';globalThis.same=a===b;"},bundle:true,write:false,logLevel:'silent',plugins:[{name:'fixture-engine-resolver',setup(build){build.onResolve({filter:/^engine-singleton$/},()=>({path:linked}));}}]});
  const customRealm={};runInNewContext(custom.outputFiles[0].text,customRealm);
  assert.equal(customRealm.same,!preserveSymlinks,'engine resolver paths must follow the same identity policy');assert.equal(customRealm.instances,preserveSymlinks?2:1);
  const virtual=await sdk.build({stdin:{sourcefile:'ns-vendor-entry.ts',resolveDir:dir,contents:"import 'virtual-singleton';"},bundle:true,write:false,logLevel:'silent',plugins:[{name:'fixture-virtual-resolver',setup(build){
   build.onResolve({filter:/^virtual-singleton$/},()=>({path:linked,namespace:'fixture-virtual',pluginData:{owned:17}}));
   build.onLoad({filter:/.*/,namespace:'fixture-virtual'},args=>{assert.equal(args.path,linked);assert.equal(args.pluginData.owned,17);return {contents:'globalThis.virtualValue=17;',loader:'js'};});
  }}]});
  const virtualRealm={};runInNewContext(virtual.outputFiles[0].text,virtualRealm);assert.equal(virtualRealm.virtualValue,17);
  const changed={...config,resolve:{...config.resolve,preserveSymlinks:!preserveSymlinks}};
  await assert.rejects(bridge.plugin().configResolved(changed),error=>error.code==='unavailable');
  assert.throws(()=>bridge.prepare(changed),error=>error.code==='unavailable');
 });
 const entry=path.join(dir,'entry.js');fs.writeFileSync(entry,"import {token as a} from 'fixture-singleton';import {token as b} from 'engine-singleton';globalThis.same=a===b;");
 for(const preserveSymlinks of [false,true]){
  const config={root:dir,configFile:false,envFile:false,logLevel:'silent',resolve:{preserveSymlinks,alias:[{find:'fixture-singleton',replacement:real}]},build:{write:false,rolldownOptions:{input:entry,output:{format:'iife'}}}};
  const enginePlugin={name:'fixture-native-platform-resolver',resolveId(id){if(id==='engine-singleton')return linked;}};
  const hook=await bridge.run(async()=>{bridge.prepare(await vite.resolveConfig(config,'build'));return bridge.plugin();});
  if(!preserveSymlinks){
   const resolution={id:linked+'?qualified',meta:{owned:17},moduleSideEffects:false};
   assert.deepEqual(await hook.resolveId.call({resolve:async()=>resolution},'fixture-query'),{...resolution,id:real+'?qualified'});
   const external={...resolution,external:true};assert.equal(await hook.resolveId.call({resolve:async()=>external},'fixture-external'),external);
   const virtual={...resolution,id:'\0fixture-virtual'};assert.equal(await hook.resolveId.call({resolve:async()=>virtual},'fixture-virtual'),virtual);
  }
  // Rolldown invokes hooks from native code, outside the originating async
  // context. The hook must retain its selected config without a global fallback.
  for(const adapted of [false,true]){
   const built=await vite.build({...config,plugins:[...(adapted?[hook]:[]),enginePlugin]});
   const output=Array.isArray(built)?built[0]:built,chunk=output.output.find(file=>file.type==='chunk');
   const realm={};runInNewContext(chunk.code,realm);
   assert.equal(realm.same,adapted&&!preserveSymlinks);assert.equal(realm.instances,adapted&&!preserveSymlinks?1:2);
  }
 }
 await assert.rejects(sdk.build(options()),error=>error.code==='unavailable');
});
