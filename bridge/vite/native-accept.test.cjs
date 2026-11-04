const test = require('node:test');
const assert = require('node:assert/strict');
const adapter = require('./native-accept.cjs');
const uri = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

test('native accept adapter preserves callbacks, batch shapes and XML fallback',async t => {
  const oldRegistry = globalThis.__xplatTestRegistry;
  const oldMetadata = globalThis.__XPLAT_HMR_ACCEPT_METADATA__;
  t.after(() => { globalThis.__xplatTestRegistry=oldRegistry; globalThis.__XPLAT_HMR_ACCEPT_METADATA__=oldMetadata; });
  const self = new Map(), dependencies = new Map();
  let disposed=0, fallback=0, completed=0;
  const key = id => new URL(id,'http://test.invalid').pathname.replace(/\.ts$/,'');
  const registry = {
    canonicalHotKey:key,
    runDispose() { disposed++; },
    getAcceptCallbacks(id) { return self.get(key(id)) || []; },
    getDepAcceptors(id) { return dependencies.get(key(id)) || []; },
    createHotContext(owner) {
      return {accept(deps,callback) {
        if(typeof deps==='function') { self.set(key(owner),[deps]); return; }
        for(const dep of typeof deps==='string'?[deps]:deps) {
          const target=key(new URL(dep,new URL(owner,'http://test.invalid')).href);
          dependencies.set(target,[...(dependencies.get(target)||[]),{owner,callback}]);
        }
      }};
    },
  };
  globalThis.__xplatTestRegistry=registry;
  const registryModule = uri(`export function installNsHotRegistry(){return globalThis.__xplatTestRegistry;}\n${adapter.registry}`);
  const installed = (await import(registryModule)).installNsHotRegistry();
  const clientModule = uri(`export const typescriptClientStrategy={refreshAfterBatch(){globalThis.__xplatTestRegistry.fallback();}};\n`+
    adapter.strategy.replace("'@nativescript/vite/hmr/client/framework.js'",JSON.stringify(uri('export function getNsHotRegistry(){return globalThis.__xplatTestRegistry;}'))));
  installed.fallback=()=>fallback++;
  const {typescriptClientStrategy:strategy} = await import(clientModule);
  const context = {setUpdateOverlayStage(stage){if(stage==='complete')completed++;}};
  let single, grouped, calls=0;
  const owner=installed.createHotContext('/app/app.ts');
  owner.accept('./value',module=>{single=module.token;});
  owner.accept(['./value','./other'],modules=>{grouped=modules.map(module=>module?.token);calls++;});
  strategy.beforeBatchEvict(['/app/value.ts','/app/other.ts']);
  strategy.afterModuleReimport('/app/value.ts',{token:'hot-value'});
  strategy.afterModuleReimport('/app/other.ts',{token:'hot-other'});
  await strategy.refreshAfterBatch(['/app/value.ts','/app/other.ts'],context);
  assert.equal(single,'hot-value');
  assert.deepEqual(grouped,['hot-value','hot-other']);
  assert.equal(calls,1);
  assert.equal(fallback,0);
  assert.equal(completed,1);
  assert.equal(disposed,1);
  let acceptedSelf;
  installed.createHotContext('/app/self.ts').accept(module=>{acceptedSelf=module.token;});
  strategy.beforeBatchEvict(['/app/self.ts']);
  strategy.afterModuleReimport('/app/self.ts',{token:'self-hot'});
  await strategy.refreshAfterBatch(['/app/self.ts'],context);
  assert.equal(acceptedSelf,'self-hot');
  strategy.beforeBatchEvict(['/app/unaccepted.ts']);
  strategy.afterModuleReimport('/app/unaccepted.ts',{});
  await strategy.refreshAfterBatch(['/app/unaccepted.ts'],context);
  assert.equal(fallback,1);
  let release;
  const barrier = new Promise(resolve => { release=resolve; });
  owner.accept('./async', async module => {
    await barrier;
    single=module.token;
  });
  strategy.beforeBatchEvict(['/app/async.ts']);
  strategy.afterModuleReimport('/app/async.ts',{token:'async-hot'});
  const completedBefore=completed;
  const applying=strategy.refreshAfterBatch(['/app/async.ts'],context);
  await Promise.resolve();
  assert.equal(completed,completedBefore,'An unresolved accept callback must keep the update pending');
  release();
  await applying;
  assert.equal(single,'async-hot');
  assert.equal(completed,completedBefore+1);
  const sentinel=new Error('private callback detail');
  const logged=[];
  const originalError=console.error;
  t.after(() => { console.error=originalError; });
  console.error=message=>logged.push(message);
  owner.accept('./failure',async()=>{throw sentinel;});
  strategy.beforeBatchEvict(['/app/failure.ts']);
  strategy.afterModuleReimport('/app/failure.ts',{token:'bad'});
  await assert.rejects(strategy.refreshAfterBatch(['/app/failure.ts'],context),error=>error===sentinel);
  assert.equal(completed,completedBefore+1,'A rejected callback must not complete the update');
  assert.deepEqual(logged,['[xplat-hmr] Native accept callback failed; update was not completed']);
  strategy.beforeBatchEvict(['/app/async.ts']);
  strategy.afterModuleReimport('/app/async.ts',{token:'recovered'});
  await strategy.refreshAfterBatch(['/app/async.ts'],context);
  assert.equal(single,'recovered');
  assert.equal(completed,completedBefore+2);
});
