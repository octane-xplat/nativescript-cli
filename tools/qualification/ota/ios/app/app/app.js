import { createClient } from '../node_modules/@octane-xplat/updates/src/client.ts';
try {
const marker = 'P91_EMBEDDED';
P91WriteState('fixture-step','entered');
const read = name => P91ReadState(name);
const client = createClient({endpoint:'https://not-running.invalid',embeddedVersion:'1.0.0'}, {
 platform:'ios', nativeFingerprint:read('fingerprint.txt'), releaseBuild:read('mode.txt')==='release',
 storage:{exists:name=>P91ExistsState(name),read,
 write:(name,value)=>{if(typeof value!=='string')throw new Error('No byte writes in guard fixture');if(!P91WriteState(name,value))throw new Error('write failed');},
 remove:name=>{if(!P91RemoveState(name))throw new Error('remove failed');},
 move:()=>{throw new Error('Installer not exercised by guard fixture');}},
 request:()=>{throw new Error('No server or network transport in offline guard qualification');}
});
const status = client.status();
if(marker==='P91_V2' && (status.currentVersion!=='2.0.0')) throw new Error('Wrong activated version');
client.markHealthy();
if(P91ConsumeRollbackCommand()) client.rollback();
P91StartApplication(marker);

} catch(error) { P91WriteState("fixture-error",String(error.stack || error)); throw error; }
