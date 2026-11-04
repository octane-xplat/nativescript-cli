'use strict';
const grpc = require('@grpc/grpc-js');
const wire = require('../../plugin/generated/extension_pb.js');
const {ExtensionService} = require('../../plugin/generated/extension_grpc_pb.js');
const {GRPCControllerService} = require('../../plugin/generated/grpc_controller_grpc_pb.js');
const {GRPCStdioService} = require('../../plugin/generated/grpc_stdio_grpc_pb.js');
const {GRPCBrokerService} = require('../../plugin/generated/grpc_broker_grpc_pb.js');
const {StdioData} = require('../../plugin/generated/grpc_stdio_pb.js');
const {Empty} = require('../../plugin/generated/grpc_controller_pb.js');
const {createRequire} = require('node:module');
const path = require('node:path');
const util = require('node:util');
const handshake = process.stdout.write.bind(process.stdout);
let stream;
const pending = [];
function log(channel,data) { const v=new StdioData();v.setChannel(channel);v.setData(Buffer.from(data));if(stream)stream.write(v);else if(pending.length<256)pending.push(v); }
// Module initialization logs must never corrupt the handshake.
console.log = (...args) => log(1,util.format(...args)+'\n');
console.error = (...args) => log(2,util.format(...args)+'\n');
process.stdout.write = (data) => {log(1,String(data));return true;};
process.stderr.write = (data) => {log(2,String(data));return true;};
function manifest(v) {const m=new wire.Manifest();m.setId(v.id||'');m.setVersion(v.version||'');m.setApi(v.api||'');for(const [key,set] of [['phases','setPhasesList'],['after','setAfterList'],['platforms','setPlatformsList'],['required','setRequiredList']])m[set](v[key]||[]);return m;}
async function main(){
 if(process.env.NATIVESCRIPT_EXTENSION!=='1')throw new Error('run through NativeScript extension host');
 const mod=await import(require('node:url').pathToFileURL(path.resolve(process.argv[2])).href);
 const impl=mod.default||mod;
 const server=new grpc.Server();
 server.addService(ExtensionService,{
 describe:async(call,cb)=>{try{cb(null,manifest(typeof impl.manifest==='function'?await impl.manifest():impl.manifest));}catch(e){cb(e);}},
 invoke:async(call,cb)=>{const controller=new AbortController();call.on('cancelled',()=>controller.abort());try{
 const v=call.request;const input={phase:v.getPhase(),project:v.getProject(),platform:v.getPlatform(),configuration:v.getConfiguration(),revision:v.getRevision(),pins:v.getPinsList().map(p=>({name:p.getName(),version:p.getVersion()})),artifacts:v.getArtifactsList().map(a=>({path:a.getPath(),kind:a.getKind(),applicationId:a.getApplicationid()}))};
 const out=await impl.invoke(input,{signal:controller.signal});const result=new wire.Result();result.setFilesList((out.files||[]).map(f=>{const v=new wire.File();v.setPath(f.path);v.setContent(f.content);return v;}));result.setDiagnosticsList(out.diagnostics||[]);cb(null,result);
 }catch(e){cb({code:controller.signal.aborted?grpc.status.CANCELLED:grpc.status.INTERNAL,message:e.message});}}
 });
 server.addService(GRPCControllerService,{shutdown:(call,cb)=>{cb(null,new Empty());server.tryShutdown(()=>process.exit(0));}});
 server.addService(GRPCStdioService,{streamStdio:call=>{stream=call;for(const v of pending)call.write(v);pending.length=0;call.on('cancelled',()=>{stream=null;});}});
 server.addService(GRPCBrokerService,{startStream:call=>{call.on('data',()=>{});call.on('end',()=>call.end());}});
 server.bindAsync('127.0.0.1:0',grpc.ServerCredentials.createInsecure(),(e,port)=>{if(e)throw e;handshake(`1|1|tcp|127.0.0.1:${port}|grpc\n`);});
}
main().catch(e=>{log(2,e.message);process.exitCode=1;});
