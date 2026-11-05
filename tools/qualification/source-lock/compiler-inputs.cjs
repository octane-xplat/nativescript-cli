#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto'),os=require('node:os');
const {audit,declarations,expectedPackage,lookup}=require('./audit.cjs');
const {inside,compilerInputs}=require('./stage-frozen.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');

function collectInstalled(root,workspace,rootDevInputs){
 root=fs.realpathSync(root);workspace=fs.realpathSync(workspace);
 const packages=new Map(),dependencies=[],absent=[],outside=[],queue=[root],manifests=[];
 while(queue.length){
  const directory=queue.shift();if(packages.has(directory))continue;
  if(!inside(workspace,directory))throw new Error('Installed lookup escaped selected fixture');
  const bytes=fs.readFileSync(path.join(directory,'package.json')),metadata=JSON.parse(bytes.toString('utf8'));
  packages.set(directory,{Name:metadata.name,Version:metadata.version,Directory:directory});
  manifests.push({directory,sha256:hash(bytes)});
  const {deps,optional}=declarations(metadata,directory===root,rootDevInputs);
  for(const name of Object.keys(deps).sort()){
   if(!/^(?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+$/.test(name))throw new Error('Unsupported dependency lookup name');
   let target;
   for(const base of Module._nodeModulePaths(directory)){
    const manifest=path.join(base,name,'package.json');
    if(fs.existsSync(manifest)){target=fs.realpathSync(path.dirname(manifest));break;}
   }
   if(target){
    if(!inside(workspace,target)){
     outside.push({from:directory,name,optional:optional.has(name)});
     absent.push({from:directory,name,optional:optional.has(name),reason:'outside-fixture'});continue;
    }
    dependencies.push({From:directory,Name:name,Directory:target});queue.push(target);
   }else absent.push({from:directory,name,optional:optional.has(name)});
  }
 }
 return {project:{Directory:root,Packages:[...packages.values()],Dependencies:dependencies},absent,outside,manifests};
}
function inspect(source,ts,fixture){
 const proof=JSON.parse(fs.readFileSync(path.join(fixture,'stage-proof.json'),'utf8'));
 const lockBytes=fs.readFileSync(path.join(source,'bun.lock')),parsed=ts.parseConfigFileTextToJson('bun.lock',lockBytes.toString('utf8'));
 if(parsed.error||!parsed.config?.packages||proof.originalLockSHA256!==hash(lockBytes))throw new Error('Original input does not match staged proof');
 if(proof.projectedLockSHA256!==hash(fs.readFileSync(path.join(fixture,'bun.lock'))))throw new Error('Staged lock changed');
 const originalManifests=new Map(proof.records.filter(r=>r.kind==='file'&&path.basename(r.path)==='package.json').map(r=>[r.path,r.sha256]));
 const workspace=folder=>{
  const dir=path.resolve(source,folder);if(dir!==source&&!inside(source,dir))throw new Error('Workspace escapes source');
  const bytes=fs.readFileSync(path.join(dir,'package.json'));
  if(originalManifests.get(path.relative(source,path.join(dir,'package.json')))!==hash(bytes))throw new Error('Original workspace manifest changed');
  return JSON.parse(bytes.toString('utf8'));
 };
 const collected=collectInstalled(path.join(fixture,'apps/mobile'),fixture,compilerInputs);
 const compared=audit({lock:parsed.config,project:collected.project,workspace,rootDevInputs:compilerInputs});
 const rootPackage=collected.project.Packages.find(p=>p.Directory===collected.project.Directory),packages=new Map(collected.project.Packages.map(p=>[p.Directory,p]));
 const roots=compilerInputs.map(name=>{
  const edge=collected.project.Dependencies.find(e=>e.From===collected.project.Directory&&e.Name===name),actual=edge&&packages.get(edge.Directory),locator=lookup(parsed.config.packages,rootPackage.Name,name),expected=expectedPackage(parsed.config,locator,workspace);
  return {lookupName:name,expectedLocator:locator,expectedName:expected.name,expectedVersion:expected.version,actualName:actual?.Name,actualVersion:actual?.Version,directory:actual?.Directory};
 });
 const result={scope:'private fixture-bounded installed graph with explicit compiler/runtime dev roots; outside lookups fail qualification; metadata/identity/edge comparison only, not public-library/API execution, artifact integrity, patch, bundle or native acceptance',rootDevInputs:compilerInputs,inputSHA256:{originalLock:hash(lockBytes),projectedLock:proof.projectedLockSHA256},roots,graph:collected.project,absentInstalledLookups:collected.absent,outsideFixtureLookups:collected.outside,manifestHashes:collected.manifests,audit:compared};
 const passed=Object.entries(compared.counts).every(([key,count])=>!count||['identity-match','absent-optional-edge'].includes(key))&&!compared.unverifiedParents.length&&!collected.absent.some(row=>!row.optional)&&!collected.outside.length;
 result.passed=passed;return result;
}
function main(){
 if(process.argv.length!==6&&!(process.argv.length===7&&process.argv[6]==='--isolated-view'))throw new Error('usage: compiler-inputs ORIGINAL_SOURCE INSTALLED_TYPESCRIPT_DIR STAGED_WORKSPACE NEW_OUTPUT_JSON [--isolated-view]');
 const source=fs.realpathSync(process.argv[2]),ts=require(path.resolve(process.argv[3])),fixture=fs.realpathSync(process.argv[4]),output=path.resolve(process.argv[5]);
 try{fs.lstatSync(output);throw new Error('Output already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
 let temporary,result,view=fixture;
 try{
  if(process.argv[6]==='--isolated-view'){
   temporary=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'ns-compiler-view-'));view=path.join(temporary,'workspace');
   console.log(JSON.stringify({scope:'owned temporary host-only metadata view',directory:temporary}));
   fs.cpSync(fixture,view,{recursive:true,verbatimSymlinks:true,mode:fs.constants.COPYFILE_FICLONE});
  }
  result=inspect(source,ts,view);
 }finally{if(temporary)fs.rmSync(temporary,{recursive:true,force:true});}
 result.inputFixture=fixture;
 if(temporary)result.temporaryView={directory:temporary,retired:true,scope:'host-only copy; no install or package execution'};
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({scope:result.scope,roots:result.roots.length,packages:result.graph.Packages.length,edges:result.graph.Dependencies.length,counts:result.audit.counts,unverifiedParents:result.audit.unverifiedParents.length,outsideFixtureLookups:result.outsideFixtureLookups.length,passed:result.passed,output}));
 if(!result.passed)process.exitCode=1;
}
module.exports={collectInstalled,inspect};
if(require.main===module)main();
