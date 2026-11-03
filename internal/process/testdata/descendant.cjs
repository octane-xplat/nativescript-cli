// Component fixture only. F1 must qualify real process-tree cancellation per host.
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
console.log(JSON.stringify({ parent: process.pid, descendant: child.pid }));
setInterval(() => {}, 1000);
