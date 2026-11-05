'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');

// The published 2.1.0 package retains this inert producer/livesync marker next
// to Java sources. Neither Gradle nor the app consumes it as source or assets.
module.exports=function marker(pkg,dir,read){
  if(pkg.name!=='@nativescript-community/gesturehandler'||pkg.version!=='2.1.0')return [];
  const file=path.join(dir,'platforms/android/sync');
  if(!fs.existsSync(file))return [];
  if(!fs.lstatSync(file).isFile()||crypto.createHash('sha256').update(read(file)).digest('hex')!=='0d943433d4a07b21b932a01fdbe81c66c2cecd977d79cd22601e97a9d34076b2'){
    throw Object.assign(new Error(),{code:'unavailable'});
  }
  return [fs.realpathSync(file)];
};
