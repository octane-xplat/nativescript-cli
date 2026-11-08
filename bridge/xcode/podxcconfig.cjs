'use strict';
const fs = require('node:fs');
const path = require('node:path');
const xcconfig = require('./xcconfig.cjs');
const fail = code => { throw Object.assign(new Error(), {code}); };
// Upstream CocoaPodsService.mergePodXcconfigFile: after `pod install`, each
// generated Pods-<target>.<configuration>.xcconfig merges into the matching
// plugins-<configuration>.xcconfig through XcconfigService.mergeFiles. The
// merge only runs when the Pods target-support directory exists.
module.exports = async ({ directory, target }) => {
  if (!path.isAbsolute(directory || '') || typeof target !== 'string' || !target || target.includes('/') || target.includes('\\')) fail('invalid_input');
  const merged = [];
  const podFolder = path.join(directory, 'Pods', 'Target Support Files', `Pods-${target}`);
  if (!fs.existsSync(podFolder)) return { directory, merged };
  for (const mode of ['debug', 'release']) {
    const source = path.join(podFolder, `Pods-${target}.${mode}.xcconfig`);
    if (!fs.lstatSync(source, {throwIfNoEntry: false})?.isFile()) continue;
    const destination = path.join(directory, `plugins-${mode}.xcconfig`);
    let destinationText = '';
    try { destinationText = fs.readFileSync(destination, 'utf8'); } catch { fail('unavailable'); }
    let sourceText;
    try { sourceText = fs.readFileSync(source, 'utf8'); } catch { fail('unavailable'); }
    const { text } = xcconfig.mergeFiles(sourceText, destinationText);
    if (text !== destinationText) {
      const temp = destination + '.p1-tmp';
      fs.writeFileSync(temp, text);
      fs.renameSync(temp, destination);
    }
    merged.push(destination);
  }
  return { directory, merged };
};
