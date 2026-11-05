import { Application, File, Label, knownFolders } from '@nativescript/core';
import { token } from './value';

declare const DevNativeProbe: any;
const nonce = 'G5_NONCE';
const entryName = 'app';
const boot = String(Date.now()) + ':' + String(Math.random());
let observed = token;
let ticks = 0;
let hotUpdates = 0;
let hotPending = 0;
let maxHotPending = 0;
let hotFailures = 0;
const hotTokens: string[] = [];
const health = File.fromPath(knownFolders.documents().path + '/go-dev-health.json');
if (import.meta.hot) {
  import.meta.hot.accept('./value', async next => {
    if (!next) throw new Error('Missing hot value module');
    hotPending++;
    maxHotPending = Math.max(maxHotPending, hotPending);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      if (next.token === 'G5_REJECT') {
        hotFailures++;
        throw new Error('Qualification accept rejection');
      }
      observed = next.token;
      hotTokens.push(observed);
      hotUpdates++;
    } finally {
      hotPending--;
    }
  });
}
setInterval(() => {
  const pid = global.isIOS ? NSProcessInfo.processInfo.processIdentifier : android.os.Process.myPid();
  const state = globalThis as any;
  const resource = global.isIOS ? NSBundle.mainBundle.pathForResourceOfType('qualification','json') : null;
  let nativeResourceRevision = resource ? JSON.parse(File.fromPath(resource).readTextSync()).revision : 0;
  if (global.isAndroid) {
    const context = Application.android.context;
    const resources = context.getResources();
    const revisionID = resources.getIdentifier('qualification_revision', 'string', context.getPackageName());
    nativeResourceRevision = revisionID ? Number(resources.getString(revisionID)) : 0;
  }
  health.writeTextSync(JSON.stringify({ nonce, boot, ticks: ++ticks, pid, token: observed, hotUpdates,
    entry: entryName, nativeProbe: typeof DevNativeProbe !== 'undefined' ? DevNativeProbe.answer() : null,
    nativeResourceRevision, hotPending, maxHotPending, hotFailures, hotTokens,
    hotAvailable: !!import.meta.hot, bootComplete: !!state.__NS_HMR_BOOT_COMPLETE__,
    fullSocketReady: !!state.__NS_HMR_CLIENT_SOCKET_READY__,
    fallbackSocketReady: !!state.__NS_HMR_BROWSER_RUNTIME_SOCKET_READY__,
    hasWebSocket: typeof state.WebSocket === 'function',
    acceptAdapterReady: !!state.__XPLAT_HMR_ACCEPT_METADATA__,
    dependencyAcceptors: state.__NS_HOT_REGISTRY__?.getDepAcceptors('/app/value.ts').length || 0,
  }));
}, 250);
Application.run({ create() { const label = new Label(); label.text = 'Go native development qualification'; return label; } });
