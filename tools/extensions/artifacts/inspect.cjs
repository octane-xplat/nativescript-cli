module.exports = {
 manifest: {id:'javascript',version:'1.0.0',api:'1',phases:['collect','post_build'],required:['build_artifacts','generated_files','native_files']},
 async invoke(input,{signal}) {
  if(input.phase==='collect')return {nativeFiles:[{platform:input.platform,kind:'source',path:'org/example/generated/FromJavascript.java',content:Buffer.from('package org.example.generated; public class FromJavascript { public static int value() { return 42; } }')}]};
  if(input.phase!=='post_build'||!input.artifacts.length)throw new Error('missing completed artifact context');
  const records=[];
  for(const a of input.artifacts) {
   const data=await require('node:fs/promises').readFile(a.path,{signal});
   records.push({path:a.path,kind:a.kind,applicationId:a.applicationId,sha256:require('node:crypto').createHash('sha256').update(data).digest('hex')});
  }
  return {files:[{path:'artifacts.json',content:JSON.stringify(records)}]};
 }
};
