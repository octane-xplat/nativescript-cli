const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const install=require('./native-update.cjs');
function graph(){
 const nodes=new Map();return {version:1,emitted:[],normalizeGraphId:id=>id,get:id=>nodes.get(id),
  upsert(id,code,deps){const prior=nodes.get(id);if(prior?.hash===code&&JSON.stringify(prior.deps)===JSON.stringify(deps))return prior;const node={id,hash:code,deps:[...deps]};nodes.set(id,node);this.version++;return node;},
  emitDelta(nodes,removed){this.emitted.push({version:this.version,nodes,removed});}};
}
function fixture(t,version='0.2.1'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-octane-update-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const manifest=path.join(root,'package.json');fs.writeFileSync(manifest,JSON.stringify({version}));
 let definition;
 const framework={typescriptServerStrategy:{async handleHotUpdate(){}},purgeTransformCachesForHotUpdate(){},getFrameworkFlavor(name){assert.equal(name,'octane');return definition;}};
 const configure=install(framework,{resolve(name){assert.equal(name,'@nativescript-community/vite-octane/package.json');return manifest;}});
 return {configure,register(server){definition={server};}};
}
test('late registered Octane emits real graph changes once and keeps no-op saves silent',async t=>{
 const f=fixture(t);f.configure();
 const strategy={flavor:'octane',deferDeltaBroadcast:true,async handleHotUpdate(context,{moduleGraph}){
  const id='/src/index.ts';moduleGraph.upsert(id,context.code,context.imports,{broadcastDelta:false,emitDeltaOnInsert:true});
  const node=moduleGraph.upsert(id,context.code,context.imports,{broadcastDelta:false});moduleGraph.emitDelta([node],[]);
 }};
 f.register(strategy);f.configure();const adapted=strategy.handleHotUpdate;f.configure();assert.equal(strategy.handleHotUpdate,adapted);
 const state=graph();const update=(code,imports=[])=>strategy.handleHotUpdate({code,imports},{moduleGraph:state});
 await update('first');assert.equal(state.emitted.length,1);assert.equal(state.version,2);
 await update('first');assert.equal(state.emitted.length,1);assert.equal(state.version,2);
 await update('second');assert.equal(state.emitted.length,2);assert.equal(state.version,3);
 await update('second',['/src/dependency.ts']);assert.equal(state.emitted.length,3);assert.equal(state.version,4);
 const independent=graph();await strategy.handleHotUpdate({code:'first',imports:[]},{moduleGraph:independent});assert.equal(independent.emitted.length,1);
});
test('Octane removal deltas are retained and unqualified provider versions fail explicitly',async t=>{
 const f=fixture(t),strategy={flavor:'octane',deferDeltaBroadcast:true,async handleHotUpdate(_context,{moduleGraph}){moduleGraph.emitDelta([],['/removed.ts']);}};
 f.register(strategy);f.configure();const state=graph();await strategy.handleHotUpdate({}, {moduleGraph:state});assert.deepEqual(state.emitted[0].removed,['/removed.ts']);
 const other=fixture(t,'0.2.2');other.register({...strategy});assert.throws(()=>other.configure(),error=>error.code==='unavailable');
 const missing=install({typescriptServerStrategy:{handleHotUpdate(){}},getFrameworkFlavor(){return {server:strategy};}}, {resolve(){throw Error('missing provider');}});assert.throws(()=>missing(),error=>error.code==='unavailable');
});
