'use strict';
// Bounded engine diagnostics for helper failure frames. Helper-owned codes pass
// through unchanged; every other engine failure becomes operation_failed with a
// sanitized detail summary — never stacks, environment values or full logs.
const passthrough = new Set(['invalid_input', 'unavailable', 'EADDRINUSE', 'server_closed', 'restart_required', 'operation_failed', 'version']);
function detail(error, projectDir) {
  const lines = String(error && (error.message || error) || 'engine failure')
    .split(/\r?\n/)
    .map(line => line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim())
    .filter(Boolean)
    .slice(0, 10);
  if (error && typeof error.code === 'string' && !passthrough.has(error.code)) lines.unshift(`[${error.code}]`);
  const summary = lines.join('\n');
  const redacted = projectDir ? summary.split(projectDir).join('<project>') : summary;
  return redacted.slice(0, 2048);
}
function engineFailure(error, projectDir) {
  if (error && passthrough.has(error.code)) return error;
  return Object.assign(new Error(), { code: 'operation_failed', detail: detail(error, projectDir) });
}
module.exports = { detail, engineFailure };
