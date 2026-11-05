const fs=require('node:fs/promises'),crypto=require('node:crypto');
module.exports={
 manifest:{id:'dev-qualification',version:'1.0.0',api:'1',phases:['collect','prepared','post_build'],required:['native_files','generated_files','build_artifacts']},
 async invoke(input,{signal}){
  const control=JSON.parse(await fs.readFile(process.env.NS_DEV_EXTENSION_CONTROL,'utf8'));
  const record={processId:process.pid,version:control.version,input,artifactSHA256:''};
  if(input.phase==='post_build'){
   if(input.artifacts.length!==1)throw Error('expected one completed artifact');
   record.artifactSHA256=crypto.createHash('sha256').update(await fs.readFile(input.artifacts[0].path,{signal})).digest('hex');
  }else if(input.artifacts.length)throw Error('artifact exposed before compilation');
  await fs.appendFile(process.env.NS_DEV_EXTENSION_TRACE,JSON.stringify(record)+'\n',{mode:0o600});
  if(control.block===input.phase)await new Promise((resolve,reject)=>{const cancel=()=>reject(Error('development hook cancelled'));if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true});});
  if(control.fail===input.phase)throw Error('development hook rejected '+input.phase);
  const result={files:[{path:input.phase+'.json',content:JSON.stringify(record)}]};
  if(input.phase==='collect')result.nativeFiles=[{platform:input.platform,kind:'source',path:'Development.swift',content:Buffer.from('class DevelopmentNative { static let value = '+control.version+' }')}];
  return result;
 }
};
