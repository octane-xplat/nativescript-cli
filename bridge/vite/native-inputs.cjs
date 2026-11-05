'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Compare notifications with R1's actual input identity. Filesystem events can
// describe attribute changes or tool cache writes, not changed native sources.
module.exports = function nativeInputs(inputs, sources, groups=[], projectDir) {
  const baseline = new Map(sources.map(source => [source.Path,source.Digest]));
  const packageRoots = sources.filter(source => path.basename(source.Path)==='Package.swift' || source.Path.endsWith('.podspec')).map(source => path.dirname(source.Path));
  const platformRoots = inputs.filter(input => path.basename(input)==='platforms');
  const gradleCaches = platformRoots.map(input => path.join(input,'android','.gradle'));
  const within = (root,file) => file===root || file.startsWith(root+path.sep);
  const explicitRoots = [...new Set([...inputs.filter(input=>!platformRoots.includes(input)),...baseline.keys()])];
  // Match R1's automatic ios/android discovery. Other platform trees remain
  // inactive unless a caller explicitly selects an input within that tree.
  const inactivePlatform = file => platformRoots.some(root => {
    if(file===root || !within(root,file))return false;
    const platform=path.relative(root,file).split(path.sep)[0];
    return !['ios','android'].includes(platform) && !explicitRoots.some(input=>within(input,file)||within(file,input));
  });
  const gradleCache = file => gradleCaches.some(cache => {
    const relative=path.relative(cache,file);
    if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))return false;
    try{return fs.lstatSync(cache).isDirectory();}catch(error){if(error.code==='ENOENT')return true;throw error;}
  });
  const ignored = file => !baseline.has(file) && (inactivePlatform(file) || gradleCache(file) || packageRoots.some(root => {
    const relative = path.relative(root,file);
    return relative !== '..' && !relative.startsWith('..'+path.sep) && relative.split(path.sep).some(part => ['.build','.swiftpm'].includes(part));
  }));
  const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const configuredFiles=new Set(groups.flatMap(group=>group.files));
  function configuredChanged(file){
    if(!groups.length||file&&!groups.some(group=>file===group.root||file.startsWith(group.root+path.sep)))return false;
    let selected;
    try{selected=new Set(require('../resolve/native-sources.cjs')(projectDir,groups.map(({name,path})=>({name,path}))).flatMap(group=>group.files.map(f=>f.realPath)));}
    catch{return true;}
    return selected.size!==configuredFiles.size||[...selected].some(file=>!configuredFiles.has(file)||baseline.get(file)!==digest(file));
  }
  function snapshot(root,result) {
    if (ignored(root)) return;
    let stat;
    try { stat = fs.lstatSync(root); } catch(error) { if(error.code==='ENOENT')return; throw error; }
    if(stat.isSymbolicLink()) throw new Error('Native input symlink changed');
    if(stat.isDirectory()) {
      for(const name of fs.readdirSync(root)) snapshot(path.join(root,name),result);
    } else if(stat.isFile()) result.set(root,digest(root));
  }
  return file => {
    if(configuredChanged(file))return true;
    if (file && (!inputs.some(input => file===input || file.startsWith(input+path.sep)) || ignored(file))) return false;
    const roots = file ? [file] : inputs;
    const current = new Map();
    for(const root of roots) snapshot(root,current);
    const expected = new Map([...baseline].filter(([source]) => roots.some(root => source===root || source.startsWith(root+path.sep))));
    return current.size!==expected.size || [...current].some(([source,hash]) => expected.get(source)!==hash);
  };
};
