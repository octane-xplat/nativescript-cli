import { Application, File, Label, knownFolders } from '@nativescript/core';
import { token } from './value';

const nonce = 'G5_NONCE';
const boot = String(Date.now()) + ':' + String(Math.random());
let observed = token;
let ticks = 0;
let hotUpdates = 0;
const health = File.fromPath(knownFolders.documents().path + '/go-dev-health.json');
if (import.meta.hot) {
  import.meta.hot.accept('./value', next => {
    if (!next) throw new Error('Missing hot value module');
    observed = next.token;
    hotUpdates++;
  });
}
setInterval(() => {
  const pid = global.isIOS ? NSProcessInfo.processInfo.processIdentifier : android.os.Process.myPid();
  const state = globalThis as any;
  const resource = global.isIOS ? NSBundle.mainBundle.pathForResourceOfType('qualification','json') : null;
  const nativeResourceRevision = resource ? JSON.parse(File.fromPath(resource).readTextSync()).revision : 0;
  health.writeTextSync(JSON.stringify({ nonce, boot, ticks: ++ticks, pid, token: observed, hotUpdates,
    nativeResourceRevision,
    hotAvailable: !!import.meta.hot, bootComplete: !!state.__NS_HMR_BOOT_COMPLETE__,
    fullSocketReady: !!state.__NS_HMR_CLIENT_SOCKET_READY__,
    fallbackSocketReady: !!state.__NS_HMR_BROWSER_RUNTIME_SOCKET_READY__,
    hasWebSocket: typeof state.WebSocket === 'function',
    acceptAdapterReady: !!state.__XPLAT_HMR_ACCEPT_METADATA__,
    dependencyAcceptors: state.__NS_HOT_REGISTRY__?.getDepAcceptors('/app/value.ts').length || 0,
  }));
}, 250);
Application.run({ create() { const label = new Label(); label.text = 'Go native development qualification'; return label; } });
