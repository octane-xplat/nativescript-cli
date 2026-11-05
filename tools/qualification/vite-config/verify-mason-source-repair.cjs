'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{transformSync}=require('esbuild');
if(process.argv.length!==6||!process.argv.slice(2).every(path.isAbsolute))throw Error('usage: verify-mason-source-repair ABS_PREPARED_DIRECTORY ABS_TYPESCRIPT_PACKAGE ABS_NATIVE_BUILD_JSON ABS_NEW_REPORT');
const [prepared,compiler,nativeBuildFile,output]=process.argv.slice(2),ts=require(compiler);assert.equal(ts.version,'5.9.3');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const receipt=JSON.parse(fs.readFileSync(path.join(prepared,'receipt.json'))),inputs=JSON.parse(fs.readFileSync(receipt.inputs));
assert.equal(sha(fs.readFileSync(receipt.inputs)),receipt.inputsSHA256);
for(const [name,input] of Object.entries(inputs.inputs))assert.equal(sha(fs.readFileSync(path.join(inputs.sourceRoot,name))),input.sha256);
assert.equal(sha(fs.readFileSync(receipt.patch)),receipt.patchSHA256);
const parse=(name,text)=>ts.createSourceFile(name,text,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);
function method(text){const file=parse('common.ts',text),found=[];function visit(node){if(ts.isMethodDeclaration(node)&&node.name.getText(file)==='_masonLayoutForeignDescendants')found.push(node.getText(file));ts.forEachChild(node,visit);}visit(file);assert.equal(found.length,1);return found[0];}
function exported(text,name){const file=parse('foreign.ts',text);const found=file.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert.equal(found.length,1);return found[0].getText(file);}
const common='packages/nativescript-masonkit/common.ts',foreign='packages/nativescript-mason-core/foreign-layout.ts';
const base=fs.readFileSync(path.join(prepared,'base',common),'utf8'),changed=fs.readFileSync(path.join(prepared,'changed',common),'utf8');
const foreignText=fs.readFileSync(path.join(prepared,'changed',foreign),'utf8');
for(const [name,digest] of Object.entries(receipt.changed)){
 assert.equal(sha(fs.readFileSync(path.join(prepared,'changed',name))),digest);
 assert.equal(sha(fs.readFileSync(path.join(prepared,'check',name))),digest);
}
const candidate=fs.readFileSync(receipt.candidateSource,'utf8');assert.equal(sha(candidate),receipt.candidateSourceSHA256);
const helper=exported(foreignText,'adoptMasonForeignFrame');assert.equal(helper,exported(candidate,'adoptMasonForeignFrame'));
// Execute the reviewed upstream projection functions, without importing its SDK
// or installing dependencies. The explicit helper source is the real input.
const projectionText=fs.readFileSync(path.join(inputs.sourceRoot,'tools/mason-core/runtime-sources.mjs'),'utf8');
const projectionFile=parse('runtime-sources.mjs',projectionText);
const functions=['nameOf','required','apply','coreForeignLayoutSource'].map(name=>{
 const node=projectionFile.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert.ok(node);return node.getText(projectionFile).replace(/^export /,'');
});
const project=vm.runInNewContext(functions.join('\n')+'\ncoreForeignLayoutSource',{ts});
const projected=project(foreignText);assert.equal(exported(projected,'adoptMasonForeignFrame'),helper);
const build=JSON.parse(fs.readFileSync(nativeBuildFile)),vendorFile=path.join(build.build.Artifacts[0].Path,'app/vendor.mjs'),vendor=fs.readFileSync(vendorFile,'utf8');
assert.equal(sha(vendor),build.bundledModules['vendor.mjs']);
function normalized(text){return transformSync('class Captured { '+text+' }',{loader:'ts',target:'es2022',define:{__APPLE__:'true'},minifySyntax:true,minifyWhitespace:true}).code;}
const aliases=method(base).replace(/\bNSView\b/g,()=> 'View$1').replace(/\bUtils\.layout\b/g,()=> 'layout$1');
assert.equal(normalized(aliases),normalized(method(vendor)),'Tagged foreign-layout method differs from retained native method');
const dispatch=[];
for(const [apple,ios] of [[false,false],[true,false],[true,true]]){
 const calls=[],child={nativeViewProtected:{},_getCurrentLayoutBounds:()=>({left:3,top:6,right:33,bottom:66}),layout:(...args)=>calls.push({kind:'layout',args})};
 const parent={eachChildView:callback=>callback(child)},pixels={EXACTLY:1073741824,makeMeasureSpec:(size,mode)=>size|mode};
 const core={measureChild(parentArg,childArg,w,h){assert.equal(this,core);assert.equal(parentArg,parent);assert.equal(childArg,child);calls.push({kind:'measure',args:[w,h]});}};
 const context={__APPLE__:apple,__IOS__:ios,isMasonView_:Symbol('mason'),NSView:core,Utils:{layout:pixels},
  adoptMasonForeignFrame(parentArg,childArg,measure,layout){assert.equal(parentArg,parent);assert.equal(childArg,child);assert.equal(layout,pixels);calls.push({kind:'adopt'});measure(parentArg,childArg,30,60);}};
 const code=ts.transpileModule('class Captured { '+method(changed)+' }',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const foreignMethod=vm.runInNewContext(code+'\nCaptured.prototype._masonLayoutForeignDescendants',context);
 foreignMethod.call(parent);
 assert.deepEqual(calls.map(row=>row.kind),apple?(ios?['adopt','measure']:['measure','layout']):[]);
 if(apple&&!ios)assert.deepEqual(Array.from(calls[1].args),[3,6,33,66]);
 dispatch.push({apple,ios,calls});
}
const result={scope:'Five verified tagged source inputs, exact candidate helper, actual upstream helper projection, normalized tagged/native method agreement and fixture platform dispatch; not a full SDK build, fresh native compile or applied production repair',
 sourceCommit:receipt.sourceCommit,sourceTag:receipt.sourceTag,patch:receipt.patch,patchSHA256:receipt.patchSHA256,
 candidateHelperExact:true,coreHelperProjectionPreservesCandidate:true,taggedMethodMatchesRetainedNative:true,retainedVendorSHA256:sha(vendor),platformDispatch:dispatch,
 sourceCheckoutChanged:false,productionRepairQualified:false};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log('Verified exact source/helper projection, tagged/native method agreement and iOS/non-iOS dispatch; production integration remains pending');
