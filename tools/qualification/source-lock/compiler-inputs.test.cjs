'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {collectInstalled}=require('./compiler-inputs.cjs');
function write(root,name,bytes){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
function fixture(t){const container=fs.mkdtempSync(path.join(os.tmpdir(),'ns-compiler-graph-'));t.after(()=>fs.rmSync(container,{recursive:true,force:true}));const workspace=path.join(container,'fixture'),app=path.join(workspace,'apps/mobile');fs.mkdirSync(app,{recursive:true});return {container,workspace,app};}
test('collector follows an alias to an owned package without loading its entry or hooks',t=>{
 const {workspace,app}=fixture(t),pkg=path.join(workspace,'packages/compiler');
 write(app,'package.json',JSON.stringify({name:'app',version:'1.0.0',devDependencies:{'compiler-alias':'npm:compiler@1.0.0',nativescript:'9.1.1'}}));
 write(pkg,'package.json',JSON.stringify({name:'compiler',version:'1.0.0',main:'index.cjs',scripts:{postinstall:'exit 99'}}));
 write(pkg,'index.cjs',"throw new Error('PACKAGE_CODE_MUST_NOT_RUN');");fs.mkdirSync(path.join(app,'node_modules'));fs.symlinkSync(pkg,path.join(app,'node_modules/compiler-alias'),'dir');
 const result=collectInstalled(app,workspace,['compiler-alias']);assert.equal(result.project.Packages.length,2);assert.equal(result.project.Dependencies.length,1);assert.equal(result.project.Dependencies[0].Name,'compiler-alias');assert.equal(result.project.Packages[1].Name,'compiler');assert.equal(result.outside.length,0);assert.equal(result.absent.length,0);
});
test('collector records an ambient optional peer without reading outside package metadata',t=>{
 const {container,workspace,app}=fixture(t);
 write(app,'package.json',JSON.stringify({name:'app',version:'1.0.0',peerDependencies:{ambient:'*'},peerDependenciesMeta:{ambient:{optional:true}}}));
 write(container,'node_modules/ambient/package.json','INVALID_JSON_MUST_NOT_BE_READ');
 const result=collectInstalled(app,workspace,[]);assert.equal(result.project.Packages.length,1);assert.equal(result.project.Dependencies.length,0);assert.equal(result.outside.length,1);assert.equal(result.outside[0].name,'ambient');assert.equal(result.outside[0].optional,true);assert.equal(result.absent[0].reason,'outside-fixture');
});
test('collector retains missing required compiler inputs as missing',t=>{
 const {workspace,app}=fixture(t);write(app,'package.json',JSON.stringify({name:'app',version:'1.0.0',devDependencies:{'missing-compiler':'1'}}));
 const result=collectInstalled(app,workspace,['missing-compiler']);assert.equal(result.absent.length,1);assert.equal(result.absent[0].name,'missing-compiler');assert.equal(result.absent[0].optional,false);
});
