'use strict';

// These additions run in the native client's two adapted support modules. The
// version-qualified engine continues to own transport, graph and module eviction.
// Its TypeScript/XML apply strategy does not execute import.meta.hot callbacks;
// preserve explicit accept boundaries before falling back to its page refresh.
exports.registry = `
const __xplatAcceptMetadata = globalThis.__XPLAT_HMR_ACCEPT_METADATA__ ||= new WeakMap();
const __xplatInstallRegistry = installNsHotRegistry;
installNsHotRegistry = function(...args) {
  const registry = __xplatInstallRegistry(...args);
  if (registry.__xplatAcceptShapes) return registry;
  registry.__xplatAcceptShapes = true;
  const create = registry.createHotContext;
  registry.createHotContext = function(owner) {
    const context = create.call(this,owner);
    const accept = context.accept;
    context.accept = function(dependencies,callback) {
      if ((typeof dependencies !== 'string' && !Array.isArray(dependencies)) || typeof callback !== 'function') return accept.apply(this,arguments);
      const list = typeof dependencies === 'string' ? [dependencies] : dependencies;
      const keys = list.map(specifier => {
        const url = new URL(specifier,new URL(registry.canonicalHotKey(owner),'http://xplat.invalid'));
        return registry.canonicalHotKey(url.href);
      });
      const registered = (...args) => callback(...args);
      __xplatAcceptMetadata.set(registered,{keys,callback,single:typeof dependencies==='string'});
      return accept.call(this,dependencies,registered);
    };
    return context;
  };
  return registry;
};
`;

exports.strategy = `
import {getNsHotRegistry as __xplatRegistry} from '@nativescript/vite/hmr/client/framework.js';
const __xplatTypeScriptStrategy = {...typescriptClientStrategy};
let __xplatPendingAccepts = new Map();
let __xplatFreshModules = new Map();
typescriptClientStrategy.beforeBatchEvict = function(ids) {
  __xplatTypeScriptStrategy.beforeBatchEvict?.(ids);
  const registry = __xplatRegistry();
  __xplatPendingAccepts = new Map(ids.map(id => [registry.canonicalHotKey(id),{
    self:registry.getAcceptCallbacks(id),dependencies:registry.getDepAcceptors(id)
  }]));
  __xplatFreshModules = new Map();
  registry.runDispose(ids);
};
typescriptClientStrategy.afterModuleReimport = function(id,namespace) {
  __xplatTypeScriptStrategy.afterModuleReimport?.(id,namespace);
  __xplatFreshModules.set(__xplatRegistry().canonicalHotKey(id),namespace);
};
typescriptClientStrategy.refreshAfterBatch = async function(ids,context) {
  const registry = __xplatRegistry();
  const callbacks = new Map();
  let fullyAccepted = true;
  try {
   for (const id of ids) {
    const key = registry.canonicalHotKey(id);
    const accepted = __xplatPendingAccepts.get(key);
    const namespace = __xplatFreshModules.get(key);
    if (!accepted || !namespace || (!accepted.self.length && !accepted.dependencies.length)) { fullyAccepted=false; continue; }
    if (accepted.self.length) {
      for(const callback of accepted.self) await callback(namespace);
    } else {
      for(const acceptor of accepted.dependencies) callbacks.set(acceptor.callback,namespace);
    }
   }
   for(const [callback,namespace] of callbacks) {
    const shape = globalThis.__XPLAT_HMR_ACCEPT_METADATA__?.get(callback);
    if (shape) {
      const namespaces = shape.keys.map(key => __xplatFreshModules.get(key));
      await shape.callback(shape.single ? namespaces[0] : namespaces);
    } else await callback([namespace]);
   }
  } catch(error) {
    // The engine contains update failures. Leave a stable application log rather
    // than silently reporting success or forwarding arbitrary callback contents.
    console.error('[xplat-hmr] Native accept callback failed; update was not completed');
    throw error;
  } finally {
    __xplatPendingAccepts.clear();
    __xplatFreshModules.clear();
  }
  if (!fullyAccepted) return __xplatTypeScriptStrategy.refreshAfterBatch?.(ids,context);
  context.setUpdateOverlayStage('complete',{detail:'Accepted native module update'});
};
`;

exports.plugin = () => ({
  name:'xplat-native-accept-boundaries',
  enforce:'pre',
  configureServer(server) {
    // Engine support modules are deliberately served raw, outside transformRequest.
    // Adapt only these two version-qualified JS responses; installed files and
    // the shared native transport/eviction implementation remain engine-owned.
    server.middlewares.use((request,response,next) => {
      const file = new URL(request.url,'http://xplat.invalid').pathname;
      let addition,marker;
      if(file==='/ns/m/node_modules/@nativescript/vite/hmr/client/hot-context.js') { addition=exports.registry; marker='__xplatInstallRegistry'; }
      if(file==='/ns/m/node_modules/@nativescript/vite/hmr/frameworks/typescript/client/strategy.js') { addition=exports.strategy; marker='__xplatTypeScriptStrategy'; }
      if(!addition) return next();
      const end = response.end;
      response.end = function(chunk,encoding,callback) {
        if(this.statusCode!==200 || this.headersSent || !String(this.getHeader('Content-Type')).includes('javascript')) return end.call(this,chunk,encoding,callback);
        const code = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
        if(code.includes(marker)) return end.call(this,chunk,encoding,callback);
        this.removeHeader('Content-Length');
        return end.call(this,Buffer.from(code+'\n'+addition),typeof encoding==='function' ? encoding : callback);
      };
      next();
    });
  },
  transform(code,id) {
    const file = id.replace(/\\/g,'/').split('?')[0];
    if(file.endsWith('/@nativescript/vite/hmr/client/hot-context.js')) return {code:code+'\n'+exports.registry,map:null};
    if(file.endsWith('/@nativescript/vite/hmr/frameworks/typescript/client/strategy.js')) return {code:code+'\n'+exports.strategy,map:null};
  },
});
