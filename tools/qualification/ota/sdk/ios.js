// Public SDK baseline: no server, host staging or private client factory.
import {createUpdates} from '@octane-xplat/updates';
const client=createUpdates({endpoint:'https://not-running.invalid',embeddedVersion:'1.0.0'});
if(!client.supported)throw new Error('Release public SDK is unsupported');
client.markHealthy();
const status=client.status();
if(status.currentVersion!=='1.0.0'||status.needsConfirmation)throw new Error('Unexpected public SDK baseline');
if(!P91WriteState('sdk-status',JSON.stringify({supported:client.supported,status})))throw new Error('SDK evidence write failed');
P91StartApplication('P91_PUBLIC_SDK');
