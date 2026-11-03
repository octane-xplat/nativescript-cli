console.log('B2 fresh bundled application: ' + org.example.health.Health.value());
const Probe = java.lang.Runnable.extend('org.example.health.G3Probe', { run() { console.log('B2 generated binding'); } });
new Probe().run();
// The qualification runner replaces this token in its fresh source copy.
let ticks = 0;
const handler = new android.os.Handler(android.os.Looper.getMainLooper());
const Heartbeat = java.lang.Runnable.extend('org.example.health.G3Heartbeat', { run() {
  console.log('G3 health G3_NONCE tick=' + (++ticks) + ' native=' + org.example.health.Health.value());
  handler.postDelayed(this, 250);
} });
new Heartbeat().run();
