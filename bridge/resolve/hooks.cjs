'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const supported = new Set([
  'before-prepare', 'after-prepare',
  'before-prepareNativeApp', 'after-prepareNativeApp',
  'before-buildIOS', 'after-buildIOS',
  'before-buildAndroid', 'after-buildAndroid',
  'before-build-task-args', 'before-install', 'after-install',
]);
const coreCheck = '97baeb497a77db8909e7fd39f58dd5f3390516aadf9cb85bd30db58009c7bdd7';
const label = value => String(value).replace(/[^a-zA-Z0-9_.-]/g, '?').slice(0, 120);

// Plugin declarations are registration inputs, not a second build-time registry.
// Read them without importing scripts. The package manager's hook installer can
// register copies in the project, where the normal lifecycle discovers them.
exports.plugin = (dir, descriptors, read, fail) => {
  if (descriptors === undefined) return;
  if (!Array.isArray(descriptors)) fail('invalid_input', 'Plugin nativescript.hooks must be an array');
  for (const hook of descriptors) {
    if (!hook || typeof hook !== 'object' || Array.isArray(hook) ||
        Object.keys(hook).some(key => !['name', 'type', 'script', 'inject'].includes(key)) ||
        typeof hook.type !== 'string' || !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(hook.type) ||
        typeof hook.script !== 'string' || !hook.script || path.isAbsolute(hook.script) ||
        hook.name !== undefined && typeof hook.name !== 'string' ||
        hook.inject !== undefined && typeof hook.inject !== 'boolean') {
      fail('invalid_input', 'Plugin hook declarations require type/script and optional name/inject');
    }
    const file = path.resolve(dir, hook.script);
    const relative = path.relative(dir, file);
    if (relative === '..' || relative.startsWith('..' + path.sep) || !fs.statSync(file).isFile()) {
      fail('invalid_input', 'Plugin hook script must name an existing package file');
    }
    read(file);
  }
};

exports.inventory = (dir, read, fail) => {
  const seen = new Set();
  function walk(folder) {
    if (!fs.existsSync(folder)) return;
    if (fail && fs.lstatSync(folder).isSymbolicLink()) fail('unavailable', 'Registered project hook trees require copied ordinary files');
    const real = fs.realpathSync(folder);
    if (seen.has(real)) return;
    seen.add(real);
    for (const name of fs.readdirSync(folder).sort()) {
      const file = path.join(folder, name);
      if (fail && fs.lstatSync(file).isSymbolicLink()) fail('unavailable', 'Registered project hook trees require copied ordinary files');
      const stat = fs.statSync(file);
      if (stat.isDirectory()) walk(file);
      else if (stat.isFile()) read(file);
    }
  }
  walk(path.join(dir, 'hooks'));
};

exports.project = (root, configured, read, fail) => {
  const hooks = [], seen = new Set();
  exports.inventory(root, read, fail);
  function add(name, script) {
    const file = fs.realpathSync(script);
    if (!fs.statSync(file).isFile() || !/\.[cm]?js$/.test(file)) {
      fail('unavailable', `Hook ${label(name)} requires a JavaScript, CommonJS or ESM file`);
    }
    const source = read(file);
    const digest = crypto.createHash('sha256').update(source).digest('hex');
    // This exact upstream CLI-version check has an existing explicit migration.
    // A registered copy is the same reviewed input, not a general ignored seam.
    if (name === 'before-checkForChanges' && digest === coreCheck) return;
    if (!supported.has(name)) fail('unavailable', `Unsupported project hook ${label(name)}; use a supported lifecycle point or the public extension SDK`);
    const key = name + '\0' + file;
    if (!seen.has(key)) hooks.push({ name, script: file, digest });
    seen.add(key);
  }
  const folder = path.join(root, 'hooks');
  if (fs.existsSync(folder)) {
    for (const name of fs.readdirSync(folder).sort()) {
      const file = path.join(folder, name);
      if (name.startsWith('.') || /^(?:README|LICENSE)(?:\.[^.]+)?$/i.test(name)) { if (fs.statSync(file).isFile()) read(file); continue; }
      if (fs.statSync(file).isDirectory()) {
        for (const child of fs.readdirSync(file).sort()) {
          const script = path.join(file, child);
          if (child.startsWith('.') || /^(?:README|LICENSE)(?:\.[^.]+)?$/i.test(child)) { if (fs.statSync(script).isFile()) read(script); continue; }
          add(name, script);
        }
      } else add(name.replace(/\.[cm]?js$/, ''), file);
    }
  }
  if (configured !== undefined) {
    if (!Array.isArray(configured)) fail('invalid_input', 'Config hooks must be an array');
    for (const hook of configured) {
      if (!hook || typeof hook !== 'object' || Array.isArray(hook) ||
          Object.keys(hook).some(key => !['type', 'script'].includes(key)) ||
          typeof hook.type !== 'string' || typeof hook.script !== 'string' || !hook.script) {
        fail('invalid_input', 'Config hooks require type and script');
      }
      add(hook.type, path.resolve(root, hook.script));
    }
  }
  return hooks;
};
