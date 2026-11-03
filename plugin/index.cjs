'use strict';
// Identity helper: authors implement manifest and async invoke(input, {signal}).
exports.defineExtension = function (manifest, invoke) {
  if (!manifest || typeof invoke !== 'function') throw new TypeError('manifest and invoke required');
  return Object.freeze({ manifest: Object.freeze(manifest), invoke });
};
