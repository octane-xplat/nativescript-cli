'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const safe = text => String(text).replace(/[^a-zA-Z0-9_.$-]/g, '?').slice(0, 120);
const ownedFailures = new WeakSet();
function failure(code, text) {
  const error = Object.assign(new Error(), { code, detail: text });
  ownedFailures.add(error);
  return error;
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function parameters(fn, name) {
  const text = Function.prototype.toString.call(fn).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const match = /^(?:async\s+)?(?:(?:function(?:\s+[\w$]+)?|[\w$]+)\s*)?\(([^)]*)\)/.exec(text) ||
    /^(?:async\s+)?([\w$]+)\s*=>/.exec(text);
  if (!match) throw failure('unavailable', `Hook ${name} requires a function with named injection parameters`);
  const names = match[1].trim() ? match[1].split(',').map(s => s.trim()) : [];
  for (const parameter of names) {
    if (!['hookArgs', '$logger', '$projectData'].includes(parameter)) {
      throw failure('unavailable', `Hook ${name} requests unsupported injection ${safe(parameter)}`);
    }
  }
  return names;
}

module.exports = async p => {
  if (!path.isAbsolute(p.projectDir || '') || !Array.isArray(p.hooks) || typeof p.name !== 'string') throw failure('invalid_input', 'Invalid hook invocation');
  const hooks = p.hooks.filter(h => h.name === p.name);
  const projectData = freeze({ projectDir: p.projectDir, projectName: p.projectName,
    nsConfig: p.nativeConfig, ...(p.platformsDir ? { platformsDir: p.platformsDir } : {}) });
  // Gradle's argument array is intentionally mutable; project metadata is not.
  const args = [...(p.arguments || [])];
  const hookArgs = { projectDir: p.projectDir, platform: p.target.Platform,
    configuration: p.target.Configuration, projectData,
    prepareData: { platform: p.target.Platform, release: p.target.Configuration === 'release' },
    buildData: { platform: p.target.Platform, release: p.target.Configuration === 'release' },
    platformData: { platformName: p.target.Platform, projectRoot: p.nativeDir },
    nativeDir: p.nativeDir, bundleDir: p.bundleDir, artifactPath: p.artifactPath,
    deviceIdentifier: p.deviceID, ...(p.name === 'before-build-task-args' ? { args } : {}) };
  for (const [key, value] of Object.entries(hookArgs)) if (key !== 'args') freeze(value);
  Object.freeze(hookArgs);
  // Hook logs are deliberately not transported: arbitrary project messages may
  // contain credentials. Failures below contain only adapter-owned labels.
  const logger = freeze(Object.fromEntries(['trace', 'debug', 'info', 'warn', 'error', 'out'].map(name => [name, () => {}])));
  for (const hook of hooks) {
    const name = `${safe(hook.name)} (${safe(path.basename(hook.script || ''))})`;
    const verify = () => {
      if (!path.isAbsolute(hook.script || '') || !/^[a-f0-9]{64}$/.test(hook.digest || '') ||
          crypto.createHash('sha256').update(fs.readFileSync(hook.script)).digest('hex') !== hook.digest) {
        throw failure('invalid_input', `Hook ${name} changed since resolution; resolve again`);
      }
    };
    try {
      verify();
      const module = await import(pathToFileURL(hook.script).href);
      const entry = module.default?.default ?? module.default;
      let result;
      if (typeof entry === 'function') {
        const inject = parameters(entry, name);
        const values = { hookArgs, $projectData: projectData, $logger: logger };
        result = await entry(...inject.map(key => values[key]));
      } else if (entry && entry.name === p.name && typeof entry.run === 'function') {
        result = await entry.run({ hookName: p.name, hookArgs, projectData });
      } else throw failure('unavailable', `Hook ${name} must export one function or a matching name/run definition`);
      if (typeof result === 'function') throw failure('unavailable', `Hook ${name} returned unsupported lifecycle middleware`);
      verify();
    } catch (error) {
      if (ownedFailures.has(error)) throw error;
      throw failure('operation_failed', `Hook ${name} failed; its raw output was withheld`);
    }
  }
  if (args.some(value => typeof value !== 'string' || /[\r\n\0]/.test(value)) || args.length > 256) throw failure('invalid_input', `Hook ${safe(p.name)} produced invalid build arguments`);
  return { arguments: args };
};
