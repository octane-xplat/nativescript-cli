const test = require('node:test');
const assert = require('node:assert/strict');
const { detail, engineFailure } = require('./native-failure.cjs');

test('engine errors become operation_failed carrying a sanitized detail summary', () => {
  const rollup = Object.assign(new Error('"missing" is not exported by "/private/proj/app/value.ts", imported by "/private/proj/app/app.ts"'), { code: 'MISSING_EXPORT' });
  const error = engineFailure(rollup, '/private/proj');
  assert.equal(error.code, 'operation_failed');
  assert.match(error.detail, /^\[MISSING_EXPORT\]/);
  assert.match(error.detail, /is not exported by "<project>\/app\/value\.ts", imported by "<project>\/app\/app\.ts"/);
  assert.equal(error.detail.includes('/private/proj'), false);
});

test('helper-owned codes pass through untouched', () => {
  for (const code of ['invalid_input', 'unavailable', 'EADDRINUSE', 'server_closed', 'restart_required', 'operation_failed']) {
    const coded = Object.assign(new Error(), { code });
    assert.equal(engineFailure(coded, '/proj'), coded);
  }
  const detailed = Object.assign(new Error(), { code: 'operation_failed', detail: 'kept' });
  assert.equal(engineFailure(detailed).detail, 'kept');
});

test('detail is bounded, ANSI-stripped and tolerates missing fields', () => {
  const many = new Error(Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n'));
  assert.equal(detail(many).split('\n').length, 10);
  assert.ok(detail(new Error('x'.repeat(9000))).length <= 2048);
  assert.equal(detail(Object.assign(new Error('plain'), { code: undefined })), 'plain');
  assert.equal(detail(new Error('\x1b[31mcolored failure\x1b[0m')), 'colored failure');
  assert.equal(detail(null), 'engine failure');
});
