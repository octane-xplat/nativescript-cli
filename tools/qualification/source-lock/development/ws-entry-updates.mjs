// Full-app host wire check: preserve entry contents and record protocol metadata
// only. No guest executes these modules and no native hot application is claimed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
const [ios, android, file, route, moduleId] = process.argv.slice(2);
const original = await readFile(file, 'utf8');
const token = '"native-value-before"';
assert.equal(original.split(token).length, 2, 'Entry marker must occur exactly once');
const after = original.replace(token, '"native-value-after"');
const next = original.replace(token, '"native-value-after-next"');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const targets = [{platform:'ios',origin:ios}, {platform:'android',origin:android}].map(target => {
 const socket = new WebSocket(target.origin.replace(/^http/, 'ws') + '/ns-hmr?ns_hmr_role=full');
 const messages = [];
 let invalid = false;
 socket.addEventListener('message', event => {try {messages.push(JSON.parse(String(event.data)));} catch {invalid = true;}});
 return {...target,socket,messages,valid:()=>!invalid};
});
let phase = 'initial graph';
async function until(predicate) {
 const deadline = Date.now()+20000;
 while (!predicate()) {if(Date.now()>deadline)throw Error('Timed out');await sleep(25);}
}
async function read(target, marker) {
 const response=await fetch(target.origin+route);
 const body=await response.text();
 target.bodySHA256=createHash('sha256').update(body).digest('hex');
 (target.responses??=[]).push({marker,sha256:target.bodySHA256});
 assert.ok(response.ok && body.includes(marker), 'Selected entry marker not served');
}
function changes(target) {
 return target.messages.filter(message=>message.type==='ns:hmr-delta')
  .flatMap(message=>(message.changed??[]).filter(module=>module.id===moduleId)
   .map(()=>({baseVersion:message.baseVersion,newVersion:message.newVersion})));
}
try {
 await until(()=>targets.every(target=>target.messages.some(message=>message.type==='ns:hmr-full-graph')));
 phase='initial full-app entry';
 for(const target of targets)await read(target,'native-value-before');
 await sleep(500);
 for(const target of targets)target.messages.length=0;
 phase='first edit';
 await writeFile(file,after);
 await until(()=>targets.every(target=>changes(target).length>0));
 for(const target of targets)await read(target,'native-value-after');
 await sleep(1000);
 for(const target of targets)assert.equal(changes(target).length,1,'One save must produce one transaction per target');
 phase='identical save';
 await writeFile(file,after);await sleep(1000);
 for(const target of targets)await read(target,'native-value-after');
 for(const target of targets)assert.equal(changes(target).length,1,'Identical bytes must not produce another transaction');
 phase='second edit';
 await writeFile(file,next);
 await until(()=>targets.every(target=>changes(target).length>1));
 for(const target of targets)await read(target,'native-value-after-next');
 await sleep(1000);
 for(const target of targets){
  assert.ok(target.valid(),'Invalid protocol JSON');
  assert.equal(changes(target).length,2,'Two saves must produce two transactions per target');
  assert.equal(changes(target)[1].baseVersion,changes(target)[0].newVersion,'Transactions must remain ordered');
 }
 console.log(JSON.stringify({passed:true,scope:'host entry transform/delta delivery only; no native runtime module execution',targets:targets.map(target=>({platform:target.platform,changes:changes(target)}))}));
} catch {
 console.log(JSON.stringify({passed:false,phase,targets:targets.map(target=>({platform:target.platform,changes:changes(target),responses:target.responses,rawAfterSHA256:createHash('sha256').update(after).digest('hex')}))}));process.exitCode=1;
} finally {
 for(const target of targets)target.socket.close();
}
