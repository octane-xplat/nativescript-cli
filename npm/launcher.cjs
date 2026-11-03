#!/usr/bin/env node
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const targets = new Set(['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-arm64', 'win32-x64']);
function binary(platform = process.platform, arch = process.arch) {
  const target = `${platform}-${arch}`;
  if (!targets.has(target)) throw new Error(`Unsupported xplat-ns host: ${target}`);
  const name = `@octane-xplat/nativescript-cli-${target}`;
  let manifest;
  try { manifest = require.resolve(`${name}/package.json`); }
  catch { throw new Error(`Missing ${name}; install with optional dependencies enabled`); }
  if (require(manifest).version !== require('./package.json').version) throw new Error(`Version mismatch: ${name}`);
  return path.join(path.dirname(manifest), platform === 'win32' ? 'xplat-ns.exe' : 'xplat-ns');
}
if (require.main === module) {
  try {
    const child = spawn(binary(), process.argv.slice(2), { stdio: 'inherit' });
    const handlers = new Map();
    for (const signal of ['SIGINT', 'SIGTERM']) {
      const forward = () => child.kill(signal);
      handlers.set(signal, forward);
      process.on(signal, forward);
    }
    child.on('error', error => { console.error(`xplat-ns: ${error.message}`); process.exitCode = 1; });
    child.on('close', (code, signal) => {
      for (const [name, handler] of handlers) process.removeListener(name, handler);
      if (signal) process.kill(process.pid, signal);
      else process.exitCode = code === null ? 1 : code;
    });
  } catch (error) { console.error(`xplat-ns: ${error.message}`); process.exitCode = 1; }
}
module.exports = { binary };
