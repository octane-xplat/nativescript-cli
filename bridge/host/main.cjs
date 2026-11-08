'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const xcode = require('xcode');
const protocol = 1;
const payloadVersion = '0.1.0';
// Private built-in operations only. External extensions use go-plugin/gRPC.
const registry = new Map();
function register(feature, operation, handler) {
  const key = `${feature}/${operation}`;
  if (registry.has(key)) throw new Error('duplicate helper operation');
  registry.set(key, handler);
}
register('extensions', 'otaStartup', require('../extensions/ota.cjs'));
register('xcode', 'prepare', require('../xcode/index.cjs'));
register('xcode', 'mergePodXcconfig', require('../xcode/podxcconfig.cjs'));
register('vite', 'run', require('../vite/index.cjs'));
register('resolve', 'project', require('../resolve/index.cjs'));
register('host', 'info', async () => ({ protocol, payloadVersion }));
register('host', 'resolveDependency', async ({ projectDir, name }) => {
  if (!path.isAbsolute(projectDir || '') || typeof name !== 'string' || !name || name.startsWith('.') || path.isAbsolute(name)) {
    throw Object.assign(new Error(), { code: 'invalid_input' });
  }
  return { path: createRequire(path.join(projectDir, 'package.json')).resolve(name) };
});
// Returns editor output; the preparation owner publishes it under its workspace lease.
register('editor', 'roundTrip', async ({ file }) => {
  if (!path.isAbsolute(file || '')) throw Object.assign(new Error(), { code: 'invalid_input' });
  const project = xcode.project(file);
  project.parseSync();
  return { text: project.writeSync() };
});
let request;
let sequence = 0;
function frame(kind, extra = {}) {
  process.stdout.write(JSON.stringify({ version: protocol, payloadVersion, id: request.id, kind, ...extra }) + '\n');
}
// Prevent accidental console logs from corrupting the wire. Raw stdout belongs to host.
console.log = console.info = console.warn = console.error = () => {};
(async () => {
  request = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (request.version !== protocol || request.payloadVersion !== payloadVersion) {
    frame('error', { error: { code: 'version', message: 'Helper version mismatch' } });
    return;
  }
  if (!request.id || !request.feature || !request.operation) throw Object.assign(new Error(), { code: 'invalid_input' });
  const handler = registry.get(`${request.feature}/${request.operation}`);
  if (!handler) throw Object.assign(new Error(), { code: 'unavailable' });
  frame('event', { sequence: ++sequence, payload: { stage: 'started' } });
  frame('result', { payload: await handler(request.payload || {}, payload => frame('event', { sequence: ++sequence, payload })) });
})().catch(error => {
  if (!request) { process.exitCode = 1; return; }
  // Do not forward arbitrary dependency messages, paths, environment or stack traces.
  // A handler may opt in a bounded, sanitized detail string for its owned tool.
  const detail = typeof error.detail === 'string' && error.detail ? error.detail.split('\n').slice(0, 10).join('\n').slice(0, 2048) : undefined;
  frame('error', { error: { code: ['invalid_input', 'unavailable', 'EADDRINUSE', 'server_closed', 'restart_required'].includes(error.code) ? error.code : 'operation_failed', message: request.feature === 'resolve' && error.safeResolve ? error.message : 'Helper operation failed', ...(detail ? { detail } : {}) } });
});
