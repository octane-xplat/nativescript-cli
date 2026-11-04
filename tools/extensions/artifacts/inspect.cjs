module.exports = {
 manifest: {id:'javascript',version:'1.0.0',api:'1',phases:['post_build'],required:['build_artifacts','generated_files']},
 async invoke(input,{signal}) {
  if(input.phase!=='post_build'||!input.artifacts.length)throw new Error('missing completed artifact context');
  const records=[];
  for(const a of input.artifacts) {
   const data=await require('node:fs/promises').readFile(a.path,{signal});
   records.push({path:a.path,kind:a.kind,applicationId:a.applicationId,sha256:require('node:crypto').createHash('sha256').update(data).digest('hex')});
  }
  return {files:[{path:'artifacts.json',content:JSON.stringify(records)}]};
 }
};
