// Host-only wire qualification against the real installed native Vite engine.
// This does not execute app modules or claim native-runtime HMR behavior.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const [origin, file] = process.argv.slice(2);
const messages = [];
const socket = new WebSocket(origin.replace(/^http/, 'ws') + '/ns-hmr?ns_hmr_role=full');
socket.addEventListener('message', event => messages.push(JSON.parse(String(event.data))));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Native graph observation timed out');
    await sleep(25);
  }
}
try {
  await until(() => messages.some(message => message.type === 'ns:hmr-full-graph'));
  assert.match(await (await fetch(origin + '/ns/m/app/value')).text(), /native-value-before/);
  await sleep(250);
  messages.length = 0;
  await writeFile(file, 'export const nativeValue = "native-value-after";\n');
  const changes = () => messages.filter(message => message.type === 'ns:hmr-delta')
    .flatMap(message => message.changed.filter(module => module.id === '/app/value.ts')
      .map(module => ({ baseVersion: message.baseVersion, newVersion: message.newVersion, ...module })));
  await until(() => changes().length > 0);
  // A native client re-fetches after the first delta. Reading the module must
  // neither publish a second edit nor replace its authoritative graph hash.
  assert.match(await (await fetch(origin + '/ns/m/app/value')).text(), /native-value-after/);
  await sleep(1000);
  assert.equal(changes().length, 1, 'One save must produce one changed-module transaction');
  await writeFile(file, 'export const nativeValue = "native-value-after";\n');
  await sleep(1000);
  assert.equal(changes().length, 1, 'Saving identical bytes must not manufacture an update');
  await writeFile(file, 'export const nativeValue = "native-value-after-next";\n');
  await until(() => changes().length > 1);
  assert.match(await (await fetch(origin + '/ns/m/app/value')).text(), /native-value-after-next/);
  await sleep(1000);
  console.log(JSON.stringify({ changes: changes() }));
  assert.equal(changes().length, 2, 'A later edit must remain independently deliverable once');
  assert.equal(changes()[1].baseVersion, changes()[0].newVersion);
} finally {
  socket.close();
}
