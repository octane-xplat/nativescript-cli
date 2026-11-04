import {createClient} from '../node_modules/@octane-xplat/updates/src/client.ts';
const app=com.tns.NativeScriptApplication.getInstance();
const mode=org.example.health.Health.nativeState(app,'mode.txt');
const hash=org.example.health.Health.nativeState(app,'fingerprint.txt');
if(mode!=='debug')throw new Error('Expected genuine debuggable native mode');
let rejected=false;
try {createClient({endpoint:'https://not-running.invalid',embeddedVersion:'1.0.0'},{platform:'android',nativeFingerprint:hash,releaseBuild:false});}
catch(error){rejected=String(error).includes('release binary');}
if(!rejected)throw new Error('Canonical client accepted a debug binary');
let ticks=0;
const handler=new android.os.Handler(android.os.Looper.getMainLooper());
const Heartbeat=java.lang.Runnable.extend('org.example.health.P91Heartbeat',{run(){
 org.example.health.Health.health(app,JSON.stringify({nonce:'P91_ANDROID_NONCE',ticks:++ticks,pid:android.os.Process.myPid(),mode,hash,rejected,native:org.example.health.Health.value()}));
 handler.postDelayed(this,250);
}});
new Heartbeat().run();
