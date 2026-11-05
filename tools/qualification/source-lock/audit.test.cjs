'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ancestors,lookup,audit}=require('./audit.cjs');
function fixture(){
 const manifests={app:{name:'@app/mobile',version:'0.0.0',dependencies:{'@scope/tool':'1','typescript-classic':'5'},peerDependencies:{optional:'1'},peerDependenciesMeta:{optional:{optional:true}}}};
 const lock={packages:{'@app/mobile':['@app/mobile@workspace:app'],'@scope/tool':['@scope/tool@1.0.0','',{dependencies:{leaf:'1'}}],leaf:['leaf@2.0.0'],'@scope/tool/leaf':['leaf@1.0.0'],'typescript-classic':['typescript@5.9.3']}};
 const project={Directory:'/app',Packages:[{Name:'@app/mobile',Version:'0.0.0',Directory:'/app'},{Name:'@scope/tool',Version:'1.0.0',Directory:'/tool'},{Name:'typescript',Version:'5.9.3',Directory:'/compiler'},{Name:'leaf',Version:'1.0.0',Directory:'/nested-leaf'}],Dependencies:[{From:'/app',Name:'@scope/tool',Directory:'/tool'},{From:'/app',Name:'typescript-classic',Directory:'/compiler'},{From:'/tool',Name:'leaf',Directory:'/nested-leaf'}]};
 return {lock,project,workspace:folder=>manifests[folder],manifests};
}
test('scoped locators resolve nearest nested entries before hoisted ones',()=>{
 assert.deepEqual(ancestors('@scope/tool/@other/inner'),['@scope/tool/@other/inner','@scope/tool']);
 const f=fixture();assert.equal(lookup(f.lock.packages,'@scope/tool','leaf'),'@scope/tool/leaf');
 assert.equal(lookup(f.lock.packages,'unrelated','leaf'),'leaf');
 const result=audit(f);assert.equal(result.counts['identity-match'],3);assert.equal(result.counts['absent-optional-edge'],1);assert.equal(result.unverifiedParents.length,0);
 assert.equal(result.records.find(r=>r.lookupName==='leaf').expectedVersion,'1.0.0');
 assert.equal(result.records.find(r=>r.lookupName==='typescript-classic').actualName,'typescript');
 assert.deepEqual(audit(f),result);
});
test('version drift stops descendant claims instead of comparing different parents',()=>{
 const f=fixture();f.project.Packages.find(p=>p.Name==='@scope/tool').Version='1.1.0';
 f.project.Dependencies.push({From:'/tool',Name:'different-child',Directory:'/new-child'});
 const result=audit(f);assert.equal(result.counts['identity-drift'],1);assert.equal(result.unverifiedParents.length,1);
 assert.equal(result.records.some(r=>r.lookupName==='leaf'||r.lookupName==='different-child'),false);
 assert.equal(result.unreachedActualPackages.some(p=>p.directory==='/nested-leaf'),true);
});
test('missing required edges and non-root injected dependencies remain failures',()=>{
 const f=fixture();f.manifests.app.dependencies.missing='1';f.lock.packages.missing=['missing@1.0.0'];
 f.project.Dependencies.push({From:'/tool',Name:'unexpected',Directory:'/unexpected'});
 f.project.Dependencies.push({From:'/app',Name:'hoisted-fixture-input',Directory:'/fixture-input'});
 const result=audit(f);assert.equal(result.counts['missing-actual-edge'],1);assert.equal(result.counts['unexpected-actual-edge'],1);assert.equal(result.stagingRootInjections.length,1);
 assert.equal(result.records.some(r=>r.lookupName==='hoisted-fixture-input'),false);
});
test('unsupported lock target identities remain unverified',()=>{
 const f=fixture();f.lock.packages['typescript-classic']=['typescript@unsupported-source'];
 const result=audit(f);assert.equal(result.counts['unverified-target'],1);
 assert.equal(result.records.some(r=>r.lookupName==='typescript-classic'&&r.status==='identity-match'),false);
});
