'use strict';

// Version-scoped adapter for the 8.0.20/8.0.21 TypeScript strategy. Its common prologue
// publishes transformed source; its fallback tail must not replace that source
// with an empty placeholder and manufacture a second transaction on re-fetch.
module.exports = framework => {
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
};
