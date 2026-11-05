#!/usr/bin/env node
'use strict';
// Execute captured bundle methods with explicit UIKit/measurement fixtures.
// Matching a historical frame is a sufficient mechanism, not native attribution.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function main(){
 if(process.argv.length!==6||!process.argv.slice(2).every(path.isAbsolute))throw Error('usage: mason-frame-replay ABS_BUILD_JSON ABS_RUNTIME_JSON ABS_TYPESCRIPT_CONSUMER ABS_NEW_REPORT');
 const [buildFile,runtimeFile,consumer,reportFile]=process.argv.slice(2),build=JSON.parse(fs.readFileSync(buildFile)),runtime=JSON.parse(fs.readFileSync(runtimeFile));
 if(fs.existsSync(reportFile))throw Error('Report must be new');
 const artifact=build.build.Artifacts[0],app=path.join(artifact.Path,'app');assert.equal(runtime.artifact.Path,artifact.Path);
 assert.equal(sha(fs.readFileSync(path.join(artifact.Path,'NativeScriptApp'))),build.executableSHA256);
 for(const [file,hash] of Object.entries(build.bundledModules))assert.equal(sha(fs.readFileSync(path.join(app,file))),hash);
 const vendorFile=path.join(app,'vendor.mjs'),vendor=fs.readFileSync(vendorFile,'utf8');assert.equal(sha(vendor),build.bundledModules['vendor.mjs']);
 const req=createRequire(path.join(consumer,'package.json')),ts=req('typescript');assert.equal(ts.version,'5.9.3');
 const source=ts.createSourceFile(vendorFile,vendor,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS),classes=[];
 function visit(node){if(ts.isClassDeclaration(node)||ts.isClassExpression(node)){const methods=new Map(node.members.filter(ts.isMethodDeclaration).map(method=>[method.name.getText(source),method]));classes.push({name:node.name?.text,methods});}ts.forEachChild(node,visit);}visit(source);
 function owner(names){const matches=classes.filter(candidate=>names.every(name=>candidate.methods.has(name)));assert.equal(matches.length,1,'Captured class must be unambiguous');return matches[0];}
 const core=owner(['layout','layoutNativeView','_modifyNativeViewFrame','_setNativeViewFrame','applySafeAreaInsets']),common=owner(['_setCurrentLayoutBounds','_getNativeViewsCount']),helper=owner(['getPositionFromFrame','getFrameFromPosition','shrinkToSafeArea']),mason=owner(['_masonLayoutForeignDescendants']);
 const trace=runtime.lastObserved.Trace,layoutIndex=trace.findIndex(event=>event.event==='onLayout'&&event.id==='preset-probe');assert.ok(layoutIndex>0);
 const observed=trace[layoutIndex],before=trace.slice(0,layoutIndex).reverse().find(event=>event.nativeFrame?.height>0).nativeFrame,initial=trace[0].nativeFrame;
 const density=trace[layoutIndex-1].measuredWidth/before.width;assert.equal(density,3);
 const safeTop=observed.nativeFrame.y-before.y;assert.equal(safeTop,42);
 const methodSHA256={};
 function replay({top=safeTop,freshCache=false,skipFrame=false}={}){
  const rect=(x,y,width,height)=>({origin:{x,y},size:{width,height}}),plain=frame=>frame?{x:frame.origin.x,y:frame.origin.y,width:frame.size.width,height:frame.size.height}:null;
  const pixels={EXACTLY:1073741824,toDevicePixels:value=>value*density,toDeviceIndependentPixels:value=>value/density,round:Math.round,makeMeasureSpec:(size,mode)=>size|mode};
  const sandbox={SDK_VERSION:27,Trace:{isEnabled:()=>false},CGRectMake:rect,CGRectEqualToRect:(a,b)=>JSON.stringify(a)===JSON.stringify(b),layout:pixels,layout$1:pixels,isMasonView_:Symbol('mason')};
  const context=vm.createContext(sandbox);
  function capture(group,name){const node=group.methods.get(name);assert.ok(node,name);const text=node.getText(source);methodSHA256[group.name+'.'+name]=sha(text);const captured=vm.runInContext('(class Captured { '+text+' })',context);return node.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.StaticKeyword)?captured[name]:captured.prototype[name];}
  const ios={};sandbox.IOSHelper=ios;
  for(const name of ['getPositionFromFrame','getFrameFromPosition','shrinkToSafeArea'])ios[name]=capture(helper,name);
  let measured=[],nativeWrites=0,layoutArgs=[];
  sandbox[core.name]={measureChild:(_parent,child,w,h)=>{measured=[w,h];child._privateFlags|=4;}};
  const child={nativeViewProtected:{frame:rect(initial.x,initial.y,initial.width,initial.height),bounds:rect(0,0,initial.width,initial.height),layoutIfNeeded(){}},isCollapsed:false,_isTransformed:false,_isLaidOut:false,_privateFlags:4,
   iosIgnoreSafeArea:false,iosOverflowSafeArea:false,iosOverflowSafeAreaEnabled:false,
   getSafeAreaInsets:()=>({left:0,top:top*density,right:0,bottom:0}),onLayout:(...args)=>{layoutArgs=args;},updateBackground(){},_raiseLayoutChangedEvent(){}};
  for(const name of ['layout','layoutNativeView','_modifyNativeViewFrame','_setNativeViewFrame','applySafeAreaInsets','_getCurrentLayoutBounds'])child[name]=capture(core,name);
  child._setCurrentLayoutBounds=capture(common,'_setCurrentLayoutBounds');
  const modify=child._modifyNativeViewFrame;child._modifyNativeViewFrame=function(...args){nativeWrites++;return modify.apply(this,args);};
  const foreign=capture(mason,'_masonLayoutForeignDescendants'),parent={eachChildView:callback=>callback(child)};
  foreign.call(parent);const first=plain(child.nativeViewProtected.frame);assert.deepEqual(first,initial);
  child.nativeViewProtected.frame=rect(before.x,before.y,before.width,before.height);
  if(freshCache)child._cachedFrame=rect(before.x,before.y,before.width,before.height);
  if(skipFrame){const layout=child.layout;child.layout=function(...args){return layout.call(this,...args,false);};}
  nativeWrites=0;foreign.call(parent);
  return {initial:first,frame:plain(child.nativeViewProtected.frame),cachedFrame:plain(child._cachedFrame),layoutArgs,measureSpecs:measured,nativeFrameWrites:nativeWrites};
 }
 const baseline=replay(),noInset=replay({top:0}),freshCache=replay({freshCache:true}),skipFrame=replay({skipFrame:true});
 assert.deepEqual(baseline.frame,observed.nativeFrame);assert.deepEqual(baseline.layoutArgs,observed.args);assert.equal(baseline.nativeFrameWrites,1);
 assert.deepEqual(noInset.frame,before);assert.deepEqual(freshCache.frame,before);assert.equal(freshCache.nativeFrameWrites,0);
 assert.deepEqual(skipFrame.frame,before);assert.deepEqual(skipFrame.cachedFrame,initial);
 const report={mechanismReproduced:true,nativeCauseProven:false,scope:'Exact retained bundle methods with mocked UIKit frames, measurement and safe-area inputs; no new native run, installed dependency mutation or accepted fix.',inputs:{buildFile,runtimeFile,vendorFile,vendorSHA256:sha(vendor),executableSHA256:build.executableSHA256,methodSHA256},assumptions:{density,shrinkSafeAreaBranch:true,staleCachedFrame:initial,inferredSafeAreaTopDIP:safeTop,note:'Safe-area inset and cached-frame values were not measured by the old native trace. The inferred inset is a sufficient input, not proof it occurred.'},baseline,controls:{noInset,freshCache,skipFrame},nextNativeMeasurement:'Capture natural getSafeAreaInsets return values, requested/native/cached frames and native-frame setter boundaries without adding diagnostic inset reads.'};
 fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({mechanismReproduced:true,nativeCauseProven:false,baseline:baseline.frame,controlsPreserveNativeFrame:true,skipFrameRetainsStaleCache:true}));
}
try{main();}catch(error){console.error(error.stack);process.exitCode=1;}
