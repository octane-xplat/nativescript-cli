const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'layout-trace.ts'),'utf8');
const compiled=require('esbuild').transformSync(source,{loader:'ts',format:'cjs',target:'es2022'}).code;
const context={module:{exports:{}}};vm.runInNewContext(compiled,context);
const {createLayoutTracer}=context.module.exports;
const rect=(x,y,width,height)=>({origin:{x,y},size:{width,height}});
const plain=value=>JSON.parse(JSON.stringify(value));
test('trace preserves native calls/results and observes only natural inset queries',()=>{
 let insetQueries=0,frameWrites=0;const records=[],result={left:0,top:126,right:0,bottom:0};
 const view={id:'label',nativeViewProtected:{frame:rect(20,20,100,40)},_cachedFrame:rect(20,20,80,30),
  getMeasuredWidth:()=>300,getMeasuredHeight:()=>120,width:100,height:40,
  getSafeAreaInsets(){insetQueries++;return result;},
  applySafeAreaInsets(frame){assert.equal(this,view);assert.equal(frame.size.height,40);this.getSafeAreaInsets();return rect(20,62,100,0);},
  _modifyNativeViewFrame(native,frame){frameWrites++;native.frame=this.applySafeAreaInsets(frame);return 'original-result';},
  _setNativeViewFrame(native,frame){return this._modifyNativeViewFrame(native,frame);}};
 const trace=createLayoutTracer(()=>'update',()=>view,records);trace(view);trace(view);
 assert.equal(insetQueries,0);
 assert.equal(view._setNativeViewFrame(view.nativeViewProtected,rect(20,20,100,40)),'original-result');
 assert.equal(insetQueries,1);assert.equal(frameWrites,1);assert.equal(records.length,4);
 const inset=records.find(record=>record.event==='getSafeAreaInsets');assert.deepEqual(plain(inset.safeAreaInsetsDevicePixels),result);
 const setter=records.find(record=>record.event==='_setNativeViewFrame');
 assert.deepEqual(plain(setter.before.nativeFrame),{x:20,y:20,width:100,height:40});
 assert.deepEqual(plain(setter.before.cachedFrame),{x:20,y:20,width:80,height:30});
 assert.deepEqual(plain(setter.after.nativeFrame),{x:20,y:62,width:100,height:0});
 assert.deepEqual(plain(setter.requestedFrame),{x:20,y:20,width:100,height:40});
 assert.deepEqual(plain(setter.args),[]);assert.ok(setter.call<inset.call);
 view.nativeViewProtected.frame.size.height=999;assert.equal(setter.after.nativeFrame.height,0);
 assert.equal(view.getSafeAreaInsets(),result);assert.equal(insetQueries,2);
});
test('trace is bounded, tolerates diagnostic getters and preserves thrown errors',()=>{
 const records=[],failure=Error('original-layout-error');let calls=0;
 const view={id:'label',getMeasuredWidth(){throw Error('diagnostic only');},
  onLayout(...args){calls++;if(args[0]===-1)throw failure;return args.length;}};
 createLayoutTracer(()=>'update',()=>view,records,3)(view);
 for(let i=0;i<5;i++)assert.equal(view.onLayout(i,1,2,3),4);
 assert.equal(calls,5);assert.equal(records.length,3);assert.deepEqual(plain(records[2].args),[4,1,2,3]);
 assert.equal(records[2].nativeFrame,null);
 assert.throws(()=>view.onLayout(-1),error=>error===failure);assert.equal(calls,6);
});
