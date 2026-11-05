'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
if(process.argv.length!==6||!process.argv.slice(2).every(path.isAbsolute))throw Error('usage: inspect-mason-adoption-controls ABS_RECEIPT ABS_RUNTIME ABS_OWNERSHIP ABS_NEW_REPORT');
const [receiptFile,runtimeFile,ownershipFile,output]=process.argv.slice(2);
const read=file=>JSON.parse(fs.readFileSync(file)),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const receipt=read(receiptFile),runtime=read(runtimeFile),ownership=read(ownershipFile);
const derived=receipt.derivation,artifact=receipt.build.Artifacts[0];
assert.equal(derived.nativeBuildPerformed,false);assert.equal(runtime.artifact.Path,artifact.Path);
assert.equal(derived.frameAdoptionCandidate.nativeRepairQualified,false);
for(const input of [derived.frameAdoptionCandidate,derived.frameAdoptionControls])assert.equal(sha(fs.readFileSync(input.source)),input.sourceSHA256);
for(const [name,input] of Object.entries(derived.diagnosticFiles))assert.equal(sha(fs.readFileSync(path.join(artifact.Path,name))),input.sha256);
for(const [name,input] of Object.entries(derived.originalFiles))assert.equal(sha(fs.readFileSync(path.join(derived.originalApp,name))),input.sha256);
assert.deepEqual(derived.changedFiles,['app/bundle.mjs','app/vendor.mjs']);
assert.equal(runtime.passed,true);assert.equal(runtime.ownedPIDRetired,true);
assert.deepEqual(runtime.lastObserved.Snapshots.map(row=>row.Phase),['mount','update','unmount','remount']);
const controls=runtime.lastObserved.Trace.filter(row=>row.event==='frame-adoption-controls');assert.equal(controls.length,1);
const control=controls[0];assert.equal(control.passed,true);assert.equal(control.restored,true);assert.equal(control.error,'');
assert.deepEqual(control.records.map(row=>row.name),['unchanged-repeated-layout','scale-and-rotation','transformed-bounds-origin-and-anchor','non-Mason-Core-safe-area']);
function near(actual,expected){assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);}
function same(actual,expected){for(const key of Object.keys(expected))typeof expected[key]==='number'?near(actual[key],expected[key]):same(actual[key],expected[key]);}
for(const [index,row] of control.records.slice(0,3).entries()){
 for(const key of ['frame','bounds','position','anchor','transform']){same(row.after[key],row.before[key]);same(row.repeated[key],row.before[key]);}
 same(row.after.cached,row.expectedCache);same(row.repeated.cached,row.expectedCache);
 assert.equal(row.events,index===2?1:0);assert.equal(row.repeatedEvents,0);
}
const transformed=control.records[1],anchored=control.records[2];
near(transformed.before.transform.m11,1.25*Math.cos(23*Math.PI/180));
near(transformed.before.transform.m12,1.25*Math.sin(23*Math.PI/180));
near(transformed.before.transform.m21,-0.75*Math.sin(23*Math.PI/180));
near(transformed.before.transform.m22,0.75*Math.cos(23*Math.PI/180));
assert.notEqual(transformed.before.frame.width,transformed.before.bounds.width);
same(anchored.before.bounds,{x:3,y:7,width:80,height:30});same(anchored.before.anchor,{x:0.25,y:0.75});
same(anchored.after.cached,{x:40,y:38/3,width:80,height:30});
const normal=control.records[3];assert.equal(normal.parentIsPage,true);assert.equal(normal.loaded,true);assert.equal(normal.naturalCalls,1);
same(normal.requestedDevicePixels,{left:0,top:0,right:300,bottom:600});
same(normal.naturalInsetsDevicePixels,{left:0,top:186,right:0,bottom:0});same(normal.after,{x:0,y:62,width:100,height:138});
assert.equal(ownership.build,receiptFile);assert.equal(ownership.runtimeExitCode,0);
for(const key of ['applicationAbsentBeforeRun','ownedInstallationRetired','ownedBootRetired','cleanupPassed'])assert.equal(ownership[key],true);
assert.equal(ownership.resources.length,2);assert.equal(ownership.resources[0].action,'acquire');assert.equal(ownership.resources[1].action,'release');assert.equal(ownership.resources[0].id,ownership.resources[1].id);
const pid=runtime.lastObserved.PID;assert.ok(pid>0);
let absent=false;try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH')absent=true;else throw error;}assert.equal(absent,true,'Observed app PID remains present');
const result={scope:'Independent assertions over actual retained-native candidate geometry/events and positive non-Mason Core safe-area control; no fresh Build, production integration or original-app/full-gate acceptance',
 receiptFile,runtimeFile,ownershipFile,candidateSourceSHA256:derived.frameAdoptionCandidate.sourceSHA256,controlsSourceSHA256:derived.frameAdoptionControls.sourceSHA256,
 lifecyclePassed:true,actualUIKitControls:control.records,geometryRestoredBeforeNormalCoreControl:true,normalCoreContentReplacedAfterMasonLifecycle:true,
 originalFilesPreserved:Object.keys(derived.originalFiles).length,observedPID:pid,observedPIDAbsent:true,ownedCleanupPassed:true,nativeBuildPerformed:false,productionRepairQualified:false};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log('Verified actual scale/rotation, origin/anchor, cache/event repetition, normal positive Core inset and owned cleanup; production integration remains open');
