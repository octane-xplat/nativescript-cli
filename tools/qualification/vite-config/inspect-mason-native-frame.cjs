'use strict';
// Verify the recorded native frame-write path, without replaying mocked UIKit.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
if(process.argv.length!==5||!process.argv.slice(2).every(path.isAbsolute))throw Error('usage: inspect-mason-native-frame ABS_BUILD_JSON ABS_RUNTIME_JSON ABS_NEW_REPORT');
const [buildFile,runtimeFile,output]=process.argv.slice(2),build=JSON.parse(fs.readFileSync(buildFile)),runtime=JSON.parse(fs.readFileSync(runtimeFile));
const artifact=build.build.Artifacts[0];assert.equal(runtime.artifact.Path,artifact.Path);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(fs.readFileSync(path.join(artifact.Path,'NativeScriptApp'))),build.executableSHA256);
for(const [name,digest] of Object.entries(build.bundledModules))assert.equal(sha(fs.readFileSync(path.join(artifact.Path,'app',name))),digest);
assert.equal(runtime.profile,'mason');assert.equal(runtime.firstObserved.Sample.Loaded,true);assert.equal(runtime.firstObserved.Sample.NativeView,true);
const health=runtime.lastObserved,trace=health.Trace;
function one(event){const rows=trace.filter(row=>row.phase==='update'&&row.id==='preset-probe'&&row.event===event);assert.equal(rows.length,1,event);return rows[0];}
const setter=one('_setNativeViewFrame'),modify=one('_modifyNativeViewFrame'),apply=one('applySafeAreaInsets'),insets=one('getSafeAreaInsets'),layout=one('onLayout');
assert.ok(setter.call<modify.call&&modify.call<apply.call&&apply.call<insets.call&&insets.call<layout.call);
const requested=setter.requestedFrame,positioned=setter.receiverBefore.nativeFrame,cached=setter.receiverBefore.cachedFrame,corrupted=modify.receiverAfter.nativeFrame;
assert.deepEqual(positioned,requested);assert.notDeepEqual(cached,requested);
assert.deepEqual(setter.receiverAfter.cachedFrame,requested);
const density=setter.measuredWidth/requested.width;assert.equal(density,setter.measuredHeight/requested.height);assert.equal(density,3);
const safe=insets.safeAreaInsetsDevicePixels;assert.deepEqual(safe,{bottom:0,left:0,right:0,top:126});
assert.deepEqual(apply.requestedFrame,requested);assert.deepEqual(apply.returnedFrame,corrupted);
assert.equal(corrupted.x,requested.x);assert.equal(corrupted.width,requested.width);
assert.equal(corrupted.y,requested.y+safe.top/density);assert.equal(corrupted.height,Math.max(0,requested.height-safe.top/density));
assert.deepEqual(layout.args,[corrupted.x*density,corrupted.y*density,(corrupted.x+corrupted.width)*density,(corrupted.y+corrupted.height)*density]);
assert.equal(health.Sample.Layout.First.Height,corrupted.height);assert.equal(health.Sample.Layout.First.Y,corrupted.y);
const result={scope:'Exact retained native build and observed bounded numeric trace; frame corruption path observed, no accepted fix/full lifecycle/ABI/original app qualification',
 buildFile,runtimeFile,executableSHA256:build.executableSHA256,bundledModules:build.bundledModules,startupHealthObserved:true,
 resizeCorruptionPathObserved:true,completeLifecyclePassed:runtime.passed,density,naturalSafeAreaInsetsDevicePixels:safe,
 cachedBefore:cached,alreadyPositionedNativeFrame:positioned,requestedFrame:requested,cachedAfter:setter.receiverAfter.cachedFrame,corruptedNativeFrame:corrupted,
 onLayoutDevicePixelBounds:layout.args,callIDs:{setter:setter.call,modify:modify.call,apply:apply.call,insets:insets.call,onLayout:layout.call}};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log('Verified actual native cached/frame/inset corruption path; resize acceptance remains failed');
