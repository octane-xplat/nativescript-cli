'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Compare notifications with R1's actual input identity. Filesystem events can
// describe attribute changes or tool cache writes, not changed native sources.
module.exports = function nativeInputs(inputs, sources) {
  const baseline = new Map(sources.map(source => [source.Path,source.Digest]));
  const packageRoots = sources.filter(source => path.basename(source.Path)==='Package.swift' || source.Path.endsWith('.podspec')).map(source => path.dirname(source.Path));
  const ignored = file => !baseline.has(file) && packageRoots.some(root => {
    const relative = path.relative(root,file);
    return relative !== '..' && !relative.startsWith('..'+path.sep) && relative.split(path.sep).some(part => ['.build','.swiftpm'].includes(part));
  });
  const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
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
    if (file && (!inputs.some(input => file===input || file.startsWith(input+path.sep)) || ignored(file))) return false;
    const roots = file ? [file] : inputs;
    const current = new Map();
    for(const root of roots) snapshot(root,current);
    const expected = new Map([...baseline].filter(([source]) => roots.some(root => source===root || source.startsWith(root+path.sep))));
    return current.size!==expected.size || [...current].some(([source,hash]) => expected.get(source)!==hash);
  };
};
