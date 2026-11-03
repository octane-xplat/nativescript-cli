console.log('js initialization log');
module.exports = {
 manifest:{id:'fixture',version:'1.0.0',api:'1',phases:['collect'],required:['generated_files']},
 async invoke(input,{signal}) {
 if(input.revision==='fail')throw new Error('async failure');
 if(input.revision==='cancel')await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});});
 return {files:[{path:'hello.txt',content:input.platform}]};
 }
};
