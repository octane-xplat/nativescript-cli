'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {tree,assertUnmaterialized}=require('./source-tree.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ns-source-tree-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function git(root,...args){return execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();}
test('tree identity agrees with Git for modes, links, directory ordering and unmaterialized gitlinks',t=>{
 const root=fixture(t);git(root,'init','--quiet');
 fs.writeFileSync(path.join(root,'a.c'),'plain');fs.mkdirSync(path.join(root,'a'));fs.writeFileSync(path.join(root,'a/child'),'child');
 fs.writeFileSync(path.join(root,'run'),'executable',{mode:0o755});fs.symlinkSync('missing',path.join(root,'dangling'));
 fs.mkdirSync(path.join(root,'empty/nested'),{recursive:true});
 git(root,'add','.');const pin='1111111111111111111111111111111111111111';
 git(root,'update-index','--add','--cacheinfo','160000',pin,'vendor/deep/plugin');
 const pins={'vendor/deep/plugin':pin},expected=git(root,'write-tree');
 assert.equal(tree(root,pins).toString('hex'),expected);assertUnmaterialized(root,pins);
 fs.writeFileSync(path.join(root,'a/child'),'changed');assert.notEqual(tree(root,pins).toString('hex'),expected);
 fs.writeFileSync(path.join(root,'a/child'),'child');fs.chmodSync(path.join(root,'run'),0o644);assert.notEqual(tree(root,pins).toString('hex'),expected);
});
test('source gitlinks must be absent or empty directories before staging',t=>{
 const root=fixture(t),pins={plugin:'2222222222222222222222222222222222222222'};
 assertUnmaterialized(root,pins);fs.mkdirSync(path.join(root,'plugin'));assertUnmaterialized(root,pins);
 fs.writeFileSync(path.join(root,'plugin/unverified'),'unexpected');assert.throws(()=>assertUnmaterialized(root,pins),/must be unmaterialized/);
 fs.rmSync(path.join(root,'plugin'),{recursive:true});fs.symlinkSync('missing',path.join(root,'plugin'));assert.throws(()=>assertUnmaterialized(root,pins),/must be unmaterialized/);
});
