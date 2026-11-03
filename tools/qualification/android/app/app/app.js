console.log('B2 fresh bundled application: ' + org.example.health.Health.value());
const Probe = java.lang.Runnable.extend({ run() { console.log('B2 generated binding'); } });
new Probe().run();
