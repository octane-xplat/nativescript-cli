console.log('js initialization log');
module.exports = {
 manifest:{id:'fixture',version:'1.0.0',api:'1',phases:['collect','post_build'],required:['generated_files','build_artifacts','native_files']},
 async invoke(input,{signal}) {
 if(input.revision==='native')return {nativeFiles:[{platform:input.platform,kind:'resource',path:'assets/data.bin',content:Buffer.from([0,1,255])}]};
 if(input.phase==='post_build') {
  if(input.artifacts.length!==1)throw new Error('missing artifact context');
  const a=input.artifacts[0];
  const data=await require('node:fs/promises').readFile(a.path,'utf8');
  return {files:[{path:'artifact.txt',content:[a.path,a.kind,a.applicationId,data].join('\n')}]};
 }
 if(input.revision==='fail')throw new Error('async failure');
 if(input.revision==='cancel')await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});});
 return {files:[{path:'hello.txt',content:input.platform}]};
 }
};
