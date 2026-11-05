'use strict';
// Inspect recorded bundle bytes without executing any native SDK module.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
if(process.argv.length!==5)throw Error('usage: audit-mason-module-identity ABS_INPUTS_JSON ABS_TYPESCRIPT_CONSUMER ABS_NEW_REPORT');
const [manifest,consumer,output]=process.argv.slice(2);
if(![manifest,consumer,output].every(path.isAbsolute))throw Error('absolute paths required');
const ts=createRequire(path.join(consumer,'package.json'))('typescript-classic');
if(ts.version!=='5.9.3')throw Error('requires explicit installed TypeScript5.9.3 parser');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const rows=JSON.parse(fs.readFileSync(manifest));
if(!Array.isArray(rows)||!rows.length)throw Error('requires explicit evidence inputs');
const result=rows.map(({label,report,directory,kind})=>{
 if(typeof label!=='string'||!path.isAbsolute(report)||!path.isAbsolute(directory)||!['native','host'].includes(kind))throw Error('invalid evidence input');
 const recorded=JSON.parse(fs.readFileSync(report));
 const files=kind==='native'?recorded.bundledModules:recorded.filesSHA256;
 if(kind==='native'&&path.resolve(recorded.build.Artifacts[0].Path,'app')!==directory)throw Error('native artifact directory differs');
 if(kind==='host'&&recorded.passed!==true)throw Error('host producer did not pass');
 if(!files||!Object.hasOwn(files,'vendor.mjs'))throw Error('recorded vendor module required');
 for(const [name,digest] of Object.entries(files)){
  if(path.isAbsolute(name)||name.split(/[\\/]/).includes('..')||sha(fs.readFileSync(path.join(directory,name)))!==digest)throw Error('recorded module bytes differ');
 }
 const vendor=path.join(directory,'vendor.mjs'),text=fs.readFileSync(vendor,'utf8');
 const source=ts.createSourceFile(vendor,text,ts.ScriptTarget.Latest,true);
 if(source.parseDiagnostics.length)throw Error('vendor parse failed');
 const definitions=[];
 function visit(node){
  if(ts.isMethodDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='_masonLayoutForeignDescendants')definitions.push(sha(node.getText(source)));
  ts.forEachChild(node,visit);
 }
 visit(source);
 if(!definitions.length)throw Error('Mason foreign-layout method absent');
 const markers={};
 for(const line of text.split('\n'))if(line.startsWith('// ')&&line.includes('nativescript-mason-core/')&&/\.[mc]?[jt]s$/.test(line)){
  const name=line.slice(3).replace(/^.*?(patched-runtime\/|node_modules\/)/,'$1');markers[name]=(markers[name]??0)+1;
 }
 return {label,kind,report,verifiedModuleFiles:Object.keys(files).length,vendorSHA256:files['vendor.mjs'],
  foreignLayoutDefinitions:definitions,moduleMarkers:Object.keys(markers).length?markers:null,
  singleForeignLayoutDefinition:definitions.length===1};
});
fs.writeFileSync(output,JSON.stringify({scope:'Recorded bundle-byte and parser evidence; no native execution, startup cause, resize or ABI qualification',rows:result},null,2)+'\n',{flag:'wx'});
console.log('Audited '+result.length+' recorded native/host bundle inputs; native acceptance unchanged');
