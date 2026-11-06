// Public createUpdates installer over the caller-authorized HTTPS origin.
// Async work starts before UIApplicationMain (inside P91StartApplication);
// its promises settle once the run loop runs. The host writes any command
// into the existing data container before launch; a fresh install has none.
import { createUpdates } from '@octane-xplat/updates';
import { File, knownFolders, path } from '@nativescript/core';
const marker = 'P91_EMBEDDED';
const documents = knownFolders.documents().path;
const commandPath = path.join(documents, 'p91-command.json');
let command = { id: 'initial', check: true };
const result = { id: command.id, marker, supported: false };
try {
  if (File.exists(commandPath)) {
    const file = File.fromPath(commandPath);
    command = JSON.parse(file.readTextSync());
    file.removeSync();
    result.id = command.id;
  }
} catch (error) {
  result.fatal = 'command: ' + String(error && error.stack || error);
}
(async () => {
  try {
    if (result.fatal) return;
    const client = createUpdates({ endpoint: '__P91_OTA_ORIGIN__', embeddedVersion: '1.0.0', timeout: 20000 });
    result.supported = client.supported;
    result.before = client.status();
    client.markHealthy();
    result.afterHealthy = client.status();
    if (command.rollback) { client.rollback(); result.rollbackRequested = true; }
    let checked;
    if (command.check !== false) {
      try { result.check = checked = await client.check(); }
      catch (error) { result.checkError = String(error && error.stack || error); }
    }
    const manifest = command.installManifest ?? checked?.manifest;
    if (command.install) {
      try { await client.install(manifest); result.installed = true; }
      catch (error) { result.installError = String(error && error.stack || error); }
    }
    if (command.installTwice) {
      try { await client.install(manifest); }
      catch (error) { result.secondInstallError = String(error && error.stack || error); }
    }
    result.after = client.status();
  } catch (error) {
    result.fatal = String(error && error.stack || error);
  } finally {
    result.done = true;
    File.fromPath(path.join(documents, 'p91-ota-result.json')).writeTextSync(JSON.stringify(result));
  }
})();
P91StartApplication(marker);
