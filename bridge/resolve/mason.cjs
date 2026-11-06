'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

// These are producer provenance records in the published Mason core payload,
// not Android resources or app dependency declarations. Keep this adapter
// scoped to the published 1.0.0-beta.* line; the artifact inventory remains the
// gate, and unknown package layouts retain normal strict classification.
module.exports=function masonMetadata(pkg,dir,read){
  const result=new Set();
  if(pkg.name!=='@octane-xplat/nativescript-mason-core'||!pkg.version.startsWith('1.0.0-beta.'))return result;
  const file=path.join(dir,'artifact-inventory.json');
  if(!fs.existsSync(file))return result;
  const inventory=JSON.parse(read(file));
  if(!Array.isArray(inventory))throw new Error('Invalid Mason inventory');
  const hashes=new Map();
  for(const item of inventory){
    if(!item||typeof item.name!=='string'||!/^([a-f0-9]{64})$/.test(item.sha256)||hashes.has(item.name))throw new Error('Invalid Mason inventory');
    hashes.set(item.name,item.sha256);
  }
  for(const name of ['platforms/ios/manifest.json','platforms/ios/device-manifest.json','platforms/ios/simulator-manifest.json','platforms/android/manifest.json']){
    const input=path.join(dir,name);
    if(!fs.existsSync(input))continue;
    const bytes=fs.readFileSync(input);
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==hashes.get(name))throw new Error('Mason provenance differs from inventory');
    const data=JSON.parse(read(input));
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Invalid Mason provenance');
    result.add(fs.realpathSync(input));
  }
  return result;
};
