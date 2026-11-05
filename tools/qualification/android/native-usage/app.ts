import {Application, File, Label, knownFolders} from '@nativescript/core';

const nonce = 'NATIVE_USAGE_NONCE';
const boot = String(Date.now()) + ':' + String(Math.random());
const nativeClassName = String(com.swmansion.gesturehandler.PanGestureHandler.class.getName());
if (nativeClassName !== 'com.swmansion.gesturehandler.PanGestureHandler') {
  throw new Error('Native gesture class binding differs');
}
let ticks = 0;
const health = File.fromPath(knownFolders.documents().path + '/go-native-usage-health.json');
setInterval(() => health.writeTextSync(JSON.stringify({
  nonce, boot, ticks: ++ticks, pid: android.os.Process.myPid(), nativeClassName,
})), 250);
Application.run({create() {
  const label = new Label();
  label.text = 'Native metadata usage qualification';
  return label;
}});
