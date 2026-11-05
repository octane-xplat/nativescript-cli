#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {expectedPackage}=require('./audit.cjs');

// Read-only qualification against the existing frozen fixture. Package code is
// not loaded: resolve package.json through Node's directory lookup rules.
if(process.argv.length!==6)throw new Error('usage: qualify-peers ORIGINAL_SOURCE INSTALLED_TYPESCRIPT_DIR PUBLIC_PROJECT_JSON NEW_OUTPUT_JSON');
const source=fs.realpathSync(process.argv[2]),ts=require(path.resolve(process.argv[3])),projectFile=path.resolve(process.argv[4]),output=path.resolve(process.argv[5]);
const lockBytes=fs.readFileSync(path.join(source,'bun.lock')),parsed=ts.parseConfigFileTextToJson('bun.lock',lockBytes.toString('utf8'));
assert.equal(parsed.error,undefined);const lock=parsed.config,project=JSON.parse(fs.readFileSync(projectFile,'utf8'));
const packages=new Map(project.Packages.map(p=>[p.Directory,p]));
function expected(locator){
 const p=expectedPackage(lock,locator,()=>{throw new Error('Registry-only qualification');});
 assert.ok(p,'Missing locked identity '+locator);return p;
}
function selected(locator){
 const want=expected(locator),found=project.Packages.filter(p=>p.Name===want.name&&p.Version===want.version);
 assert.equal(found.length,1,'Expected one actual identity for '+locator);return live(found[0].Directory);
}
function live(directory){
 const canonical=fs.realpathSync(directory),m=JSON.parse(fs.readFileSync(path.join(canonical,'package.json'),'utf8')),record=packages.get(canonical);
 assert.ok(record,'Live package missing from public snapshot');assert.equal(record.Name,m.name);assert.equal(record.Version,m.version);
 return {directory:canonical,name:m.name,version:m.version};
}
function lookup(from,name){
 for(const base of Module._nodeModulePaths(fs.realpathSync(from.directory))){
  const manifest=path.join(base,name,'package.json');
  if(fs.existsSync(manifest)){
   const result=live(path.dirname(manifest));
   assert.ok(project.Dependencies.some(e=>e.From===from.directory&&e.Name===name&&e.Directory===result.directory),'Live lookup differs from public snapshot');
   return result;
  }
 }
 throw new Error('Missing live lookup '+name);
}
const core=selected('octane/@tsrx/core'),parser=lookup(core,'@sveltejs/acorn-typescript'),acorn=lookup(core,'acorn'),parserPeer=lookup(parser,'acorn');
assert.equal(acorn.version,expected('octane/@tsrx/core/acorn').version);assert.notEqual(acorn.version,expected('acorn').version);assert.equal(parserPeer.directory,acorn.directory);
const webpack=selected('webpack'),browser=lookup(webpack,'browserslist'),updater=lookup(browser,'update-browserslist-db'),selfPeer=lookup(updater,'browserslist');
assert.equal(browser.version,expected('webpack/browserslist').version);assert.notEqual(browser.version,expected('browserslist').version);assert.equal(selfPeer.directory,browser.directory);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const result={scope:'live physical identities and Node peer lookups against explicit original lock records; no artifact-integrity, semver compatibility, compiler, frozen-install or native acceptance',inputSHA256:{originalLock:hash(lockBytes),publicProject:hash(fs.readFileSync(projectFile))},checks:[
 {kind:'consumer-dependency',consumer:core,child:parser,provider:acorn,peer:parserPeer,providerLocator:'octane/@tsrx/core/acorn',lexicalFallbackVersion:expected('acorn').version},
 {kind:'consumer-self',incomingConsumer:webpack,lookupName:'browserslist',consumer:browser,child:updater,peer:selfPeer,providerLocator:'webpack/browserslist',lexicalFallbackVersion:expected('browserslist').version},
]};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({scope:result.scope,checks:result.checks.length,output}));
