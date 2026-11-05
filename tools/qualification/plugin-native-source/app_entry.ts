import { Application, File, Label, knownFolders } from '@nativescript/core';

console.log('Plugin selector native', __PROJECT_CONFIG_VALUE__);
const nonce = 'PLUGIN_SELECTOR_NONCE';
const boot = String(Date.now()) + ':' + String(Math.random());
const file = File.fromPath(knownFolders.documents().path + '/go-plugin-selector-health.json');
let tick = 0;
setInterval(() => {
  try {
    const present = typeof PluginSelectorProbe !== 'undefined';
    const value = present ? PluginSelectorProbe.answer() : null;
    file.writeTextSync(JSON.stringify({ nonce, boot, pid: NSProcessInfo.processInfo.processIdentifier,
      tick: ++tick, present, value, failure: '' }));
  } catch (error) {
    file.writeTextSync(JSON.stringify({ nonce, boot, pid: NSProcessInfo.processInfo.processIdentifier,
      tick: ++tick, failure: String(error) }));
  }
}, 250);
Application.run({ create() { const label = new Label(); label.text = 'Native plugin selector qualification'; return label; } });
