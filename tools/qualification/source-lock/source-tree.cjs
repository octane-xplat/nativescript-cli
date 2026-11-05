'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const parentTree='ea8c71e61e325d3aa185d3626de6f8b2dacc10ec';
const parentGitlinks={
 'packages/lottie/src/vendor/ui-lottie':'7c8a2745a9c35200f97f2dee6851a8c54d13baaa',
 'packages/ui/src/vendor/ui-svg':'9ca8f44e1e6509b78b0773ad86507ea93751d62b',
 'packages/image-manipulator/platforms/macos/vendor/libwebp':'4fa21912338357f89e4fd51cf2368325b59e9bd9',
};
function object(kind,bytes){return crypto.createHash('sha1').update(kind+' '+bytes.length+'\0').update(bytes).digest();}
function tree(root,gitlinks={},relative=''){
 const names=new Set(fs.existsSync(root)?fs.readdirSync(root):[]),entries=[];
 for(const pin of Object.keys(gitlinks)){
  const prefix=relative?relative+'/':'';
  if(pin.startsWith(prefix))names.add(pin.slice(prefix.length).split('/')[0]);
 }
 for(const name of names){
  if(name==='.git')continue;
  const file=path.join(root,name),rel=relative?relative+'/'+name:name;
  let mode,hash,directory=false;
  if(Object.hasOwn(gitlinks,rel)){mode='160000';hash=Buffer.from(gitlinks[rel],'hex');}
  else{
   let info;try{info=fs.lstatSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(!info){mode='40000';hash=tree(file,gitlinks,rel);directory=true;}
   else if(info.isSymbolicLink()){mode='120000';hash=object('blob',Buffer.from(fs.readlinkSync(file)));}
   else if(info.isFile()){mode=info.mode&0o111?'100755':'100644';hash=object('blob',fs.readFileSync(file));}
   else if(info.isDirectory()){
    mode='40000';hash=tree(file,gitlinks,rel);directory=true;
    if(hash.equals(object('tree',Buffer.alloc(0))))continue;
   }else throw new Error('Unsupported source tree entry');
  }
  entries.push({key:Buffer.from(name+(directory?'/':'')),value:Buffer.concat([Buffer.from(mode+' '+name+'\0'),hash])});
 }
 entries.sort((a,b)=>Buffer.compare(a.key,b.key));return object('tree',Buffer.concat(entries.map(e=>e.value)));
}
function assertUnmaterialized(root,gitlinks){
 for(const relative of Object.keys(gitlinks)){
  const file=path.join(root,relative);
  let info;try{info=fs.lstatSync(file);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  if(!info.isDirectory()||fs.readdirSync(file).length)throw new Error('Source gitlink must be unmaterialized: '+relative);
 }
}
module.exports={tree,parentTree,parentGitlinks,assertUnmaterialized};
