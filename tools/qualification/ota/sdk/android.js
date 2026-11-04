// Genuine debug mode must remain unavailable for public SDK installation.
import {createUpdates} from '@octane-xplat/updates';
const client=createUpdates({endpoint:'https://not-running.invalid',embeddedVersion:'1.0.0'});
if(client.supported)throw new Error('Public SDK accepted a debuggable binary');
const app=com.tns.NativeScriptApplication.getInstance();
const mode=org.example.health.Health.nativeState(app,'mode.txt');
const hash=org.example.health.Health.nativeState(app,'fingerprint.txt');
if(mode!=='debug')throw new Error('Expected genuine debug mode');
let ticks=0;
const handler=new android.os.Handler(android.os.Looper.getMainLooper());
const Heartbeat=java.lang.Runnable.extend('org.example.health.P91PublicSDKHeartbeat',{run(){
 org.example.health.Health.health(app,JSON.stringify({nonce:'P91_ANDROID_NONCE',ticks:++ticks,pid:android.os.Process.myPid(),mode,hash,rejected:!client.supported,native:org.example.health.Health.value()}));
 handler.postDelayed(this,250);
}});
new Heartbeat().run();
