'use strict';

// Version-scoped adapter for the 8.0.20/8.0.21 TypeScript strategy. Its common prologue
// publishes transformed source; its fallback tail must not replace that source
// with an empty placeholder and manufacture a second transaction on re-fetch.
module.exports = (framework, projectRequire) => {
  const strategy = framework.typescriptServerStrategy;
  const update = strategy.handleHotUpdate;
  strategy.handleHotUpdate = async (context, dependencies) => {
    framework.purgeTransformCachesForHotUpdate({file:context.file,server:context.server,sharedTransformRequest:dependencies.sharedTransformRequest});
    const processed = new Set();
    const graph = dependencies.moduleGraph;
    const scopedGraph = new Proxy(graph, {
      get(target, property) {
        if (property === 'upsert') return (rawID, code, imports, options) => {
          const id = target.normalizeGraphId(rawID);
          if (code === '' && imports.length === 0 && processed.has(id)) return target.get(id);
          const result = target.upsert(rawID, code, imports, options);
          if (code !== '') processed.add(id);
          return result;
        };
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return update(context, {...dependencies,moduleGraph:scopedGraph});
  };
  const adapted=new WeakSet();
  // Project config registers Octane after the initial SDK import. Its strategy
  // owns a separate handler and explicitly broadcasts deferred graph updates.
  return () => {
    const strategy=framework.getFrameworkFlavor?.('octane')?.server;
    if(!strategy||adapted.has(strategy))return;
    let metadata;
    try{metadata=JSON.parse(require('node:fs').readFileSync(projectRequire.resolve('@nativescript-community/vite-octane/package.json'),'utf8'));}
    catch{throw Object.assign(new Error(),{code:'unavailable'});}
    if(metadata.version!=='0.2.1'||strategy.flavor!=='octane'||strategy.deferDeltaBroadcast!==true||typeof strategy.handleHotUpdate!=='function')throw Object.assign(new Error(),{code:'unavailable'});
    const update=strategy.handleHotUpdate;
    strategy.handleHotUpdate=async(context,dependencies)=>{
      const graph=dependencies.moduleGraph,initial=new Map(),changed=new Set();
      const identity=node=>node&&JSON.stringify([node.hash,node.deps]);
      const scoped=new Proxy(graph,{get(target,property){
        if(property==='upsert')return(id,code,imports,options)=>{
          const key=target.normalizeGraphId(id);
          if(!initial.has(key))initial.set(key,identity(target.get(key)));
          const node=target.upsert(id,code,imports,options);
          if(identity(node)===initial.get(key))changed.delete(key);else changed.add(key);
          return node;
        };
        if(property==='emitDelta')return(nodes,removed)=>{
          const selected=nodes.filter(node=>changed.has(target.normalizeGraphId(node.id)));
          if(selected.length||removed.length)return target.emitDelta(selected,removed);
        };
        const value=Reflect.get(target,property,target);
        return typeof value==='function'?value.bind(target):value;
      }});
      return update(context,{...dependencies,moduleGraph:scoped});
    };
    adapted.add(strategy);
  };
};
