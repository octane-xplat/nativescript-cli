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

function peers({alias=false,self=false}={}){
 const key=alias?'host-alias':'host';
 const metadata={name:'app',version:'1.0.0',dependencies:{consumer:'1',host:'1'}};
 const parentDeps=self?{[key]:'2'}:{host:'2','peer-tool':'1'};
 const lock={packages:{app:['app@workspace:app'],consumer:['consumer@1.0.0','',{dependencies:parentDeps}],host:['host@1.0.0'],['consumer/'+key]:['host@2.0.0','',self?{dependencies:{'peer-tool':'1'}}:{}],'peer-tool':['peer-tool@1.0.0','',{peerDependencies:{host:'*'}}]}};
 const project={Directory:'/app',Packages:[{Name:'app',Version:'1.0.0',Directory:'/app'},{Name:'consumer',Version:'1.0.0',Directory:'/consumer'},{Name:'host',Version:'1.0.0',Directory:'/host1'},{Name:'host',Version:'2.0.0',Directory:'/host2'},{Name:'peer-tool',Version:'1.0.0',Directory:'/peer'}],Dependencies:[{From:'/app',Name:'consumer',Directory:'/consumer'},{From:'/app',Name:'host',Directory:'/host1'},{From:'/consumer',Name:key,Directory:'/host2'},{From:self?'/host2':'/consumer',Name:'peer-tool',Directory:'/peer'},{From:'/peer',Name:'host',Directory:alias?'/host1':'/host2'}]};
 return {lock,project,workspace:()=>metadata};
}
test('peer binding uses the consumer own dependency rather than a hoisted locator',()=>{
 const f=peers(),r=audit(f),peer=r.records.find(row=>row.fromLocator==='peer-tool'&&row.lookupName==='host');
 assert.equal(r.counts['identity-drift'],undefined);assert.equal(r.unverifiedParents.length,0);
 assert.equal(peer.expectedLocator,'consumer/host');assert.equal(peer.peerProvider.kind,'consumer-dependency');
 f.project.Dependencies.find(e=>e.From==='/peer').Directory='/host1';
 assert.equal(audit(f).counts['identity-drift'],1,'a wrong peer must not pass merely because it is locked elsewhere');
});
test('self-provided peer cycles terminate and retain the nested provider identity',()=>{
 const f=peers({self:true}),r=audit(f),peer=r.records.find(row=>row.fromLocator==='peer-tool');
 assert.equal(peer.expectedVersion,'2.0.0');assert.equal(peer.peerProvider.kind,'consumer-self');
 assert.equal(r.unverifiedParents.length,0);assert.ok(r.records.length<20);assert.deepEqual(audit(f),r);
});
test('an npm alias does not provide a peer under its manifest name',()=>{
 const f=peers({self:true,alias:true}),r=audit(f),peer=r.records.find(row=>row.fromLocator==='peer-tool');
 assert.equal(peer.expectedVersion,'1.0.0');assert.equal(peer.peerProvider,undefined);assert.equal(r.counts['identity-drift'],undefined);
 f.project.Dependencies.find(e=>e.From==='/peer').Directory='/host2';assert.equal(audit(f).counts['identity-drift'],1);
});
test('a package own dependency wins over a consumer-provided peer',()=>{
 const f=peers();f.lock.packages['peer-tool'][2].dependencies={host:'3'};f.lock.packages['peer-tool/host']=['host@3.0.0'];
 f.project.Packages.push({Name:'host',Version:'3.0.0',Directory:'/host3'});f.project.Dependencies.find(e=>e.From==='/peer').Directory='/host3';
 const r=audit(f),peer=r.records.find(row=>row.fromLocator==='peer-tool');assert.equal(peer.expectedVersion,'3.0.0');assert.equal(peer.peerProvider,undefined);assert.equal(r.counts['identity-drift'],undefined);
});
test('a workspace peer keeps its explicit local dev binding',()=>{
 const f=peers();f.lock.packages['peer-tool']=['peer-tool@workspace:tool'];
 const app=f.workspace();f.workspace=folder=>folder==='app'?app:{name:'peer-tool',version:'1.0.0',peerDependencies:{host:'*'},devDependencies:{host:'1'}};
 f.project.Dependencies.find(e=>e.From==='/peer').Directory='/host1';
 const r=audit(f),peer=r.records.find(row=>row.fromLocator==='peer-tool');assert.equal(peer.expectedVersion,'1.0.0');assert.equal(peer.peerProvider,undefined);assert.equal(r.counts['identity-drift'],undefined);
});
test('one physical peer package is checked in every consumer provision context',()=>{
 const f=peers(),app=f.workspace();app.dependencies.other='1';
 f.lock.packages.other=['other@1.0.0','',{dependencies:{host:'1','peer-tool':'1'}}];
 f.project.Packages.push({Name:'other',Version:'1.0.0',Directory:'/other'});
 f.project.Dependencies.push({From:'/app',Name:'other',Directory:'/other'},{From:'/other',Name:'host',Directory:'/host1'},{From:'/other',Name:'peer-tool',Directory:'/peer'});
 const r=audit(f),comparisons=r.records.filter(row=>row.fromLocator==='peer-tool'&&row.lookupName==='host');
 assert.equal(comparisons.length,2);assert.equal(r.counts['identity-drift'],1);
 assert.deepEqual(comparisons.map(row=>row.expectedVersion).sort(),['1.0.0','2.0.0']);
});
