'use strict';
// Diagnostic JS restaging over a retained native executable, never a Build.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { transformSync } = require('esbuild');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const expectedBundle = '7b6299092eed145a7b5a195e4caa2e61396c6229c45eeef148497b1464cc9c4b';
if (process.platform !== 'darwin' || process.argv.length !== 5 || !process.argv.slice(2).every(path.isAbsolute)) {
  throw Error('usage on Darwin: node restage-mason-geometry.cjs ABS_SOURCE_BUILD_JSON ABS_NEW_DIRECTORY ABS_NEW_RECEIPT');
}
const [sourceBuild, destination, output] = process.argv.slice(2);
if (fs.existsSync(destination) || fs.existsSync(output)) throw Error('Requires absent owned destination and receipt');
const sourceBytes = fs.readFileSync(sourceBuild), built = JSON.parse(sourceBytes);
if (built.derivation || built.build.Artifacts.length !== 1) throw Error('Requires original native build evidence');
const artifact = built.build.Artifacts[0], original = artifact.Path;
if (artifact.Kind !== 'app' || artifact.Identity.Target.Platform !== 'ios' ||
    artifact.Identity.Target.Configuration !== 'debug' || artifact.Identity.Target.Destination.Kind !== 'simulator') {
  throw Error('Requires retained unsigned iOS debug simulator app');
}
function inventory(root) {
  const result = {};
  function visit(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name), stat = fs.lstatSync(file), relative = path.relative(root, file);
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) result[relative] = { sha256: sha(fs.readFileSync(file)), bytes: stat.size, mode: stat.mode & 0o777 };
      else throw Error('Unsupported retained app entry: ' + relative);
    }
  }
  visit(root);
  return result;
}
const before = inventory(original);
if (before.NativeScriptApp?.sha256 !== built.executableSHA256 || before['app/bundle.mjs']?.sha256 !== expectedBundle ||
    built.bundledModules['bundle.mjs'] !== expectedBundle || before['_CodeSignature/CodeResources']) {
  throw Error('Requires exact known unsigned native trace inputs');
}
for (const [name, digest] of Object.entries(built.bundledModules)) {
  if (before['app/' + name]?.sha256 !== digest) throw Error('Retained module hash differs');
}
const bundle = fs.readFileSync(path.join(original, 'app/bundle.mjs'), 'utf8');
const marker = '// src/layout-trace.ts', start = bundle.indexOf(marker), end = bundle.indexOf('\n// src/main.tsx', start);
if (start < 0 || end < start || bundle.indexOf(marker, start + marker.length) !== -1) throw Error('Trace module boundary differs');
const helper = path.join(__dirname, 'runtime/layout-trace.ts'), source = fs.readFileSync(helper, 'utf8');
if ((source.match(/export function /g) || []).length !== 1 || !source.includes('export function createLayoutTracer(')) {
  throw Error('Trace export contract differs');
}
const compiled = transformSync(source.replace('export function createLayoutTracer(', 'function createLayoutTracer('),
  { loader: 'ts', target: 'es2022', format: 'esm', sourcemap: false }).code;
// Keep helper-local names private even when other bundled modules use them.
const replacement = bundle.slice(0, start) + marker + '\nvar createLayoutTracer = (() => {\n' +
  compiled + '\nreturn createLayoutTracer;\n})();\n' + bundle.slice(end);
// A source map for the old bundle must not be advertised for diagnostic bytes.
const diagnostic = replacement.replace(/^\/\/# sourceMappingURL=.*$/gm, '');
const totalBytes = Object.values(before).reduce((total, file) => total + file.bytes, 0);
const available = fs.statfsSync(path.dirname(destination));
// Budget a full logical clone plus the changed JS, filesystem overhead and128MiB reserve.
const required = totalBytes + Buffer.byteLength(diagnostic) + 16 * 1024 ** 2 + 128 * 1024 ** 2;
if (available.bavail * available.bsize < required) throw Error('Insufficient bounded diagnostic restaging headroom');
fs.mkdirSync(destination);
const target = path.join(destination, 'NativeScriptApp.app');
fs.mkdirSync(target);
// Node/libuv's forced clone can be unavailable on Darwin; call clonefile itself.
execFileSync('python3', ['-c', `
import ctypes, json, os, sys
from pathlib import Path
source, target = map(Path, sys.argv[1:3])
clone = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True).clonefile
clone.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int]
clone.restype = ctypes.c_int
for relative, record in json.loads(sys.argv[3]).items():
    destination = target / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    if clone(os.fsencode(source / relative), os.fsencode(destination), 0):
        raise OSError(ctypes.get_errno(), 'clonefile failed; no deep-copy fallback')
    destination.chmod(record['mode'])
`, original, target, JSON.stringify(before)], { stdio: 'pipe' });
fs.writeFileSync(path.join(target, 'app/bundle.mjs'), diagnostic);
const after = inventory(target), unchanged = inventory(original);
if (JSON.stringify(before) !== JSON.stringify(unchanged)) throw Error('Original retained app changed');
const changed = Object.keys(before).filter(name => before[name].sha256 !== after[name].sha256);
if (changed.length !== 1 || changed[0] !== 'app/bundle.mjs') throw Error('Unexpected diagnostic app delta');
const derivedBuild = structuredClone(built.build);
derivedBuild.Artifacts[0].Path = target;
const receipt = {
  scope: 'Owned JavaScript-only geometry diagnostic over retained native compilation; not a fresh public Build, repair or gate acceptance',
  derivation: { nativeBuildPerformed: false, sourceBuild, sourceBuildSHA256: sha(sourceBytes), originalApp: original,
    geometrySource: helper, geometrySourceSHA256: sha(source), replacedModuleSHA256: sha(bundle.slice(start, end)),
    changedFiles: changed, originalFiles: before, diagnosticFiles: after, originalPreserved: true,
    cloneMode: 'Darwin clonefile; no deep-copy fallback', requiredHeadroomBytes: required,
    oldSourceMapAdvertised: false },
  build: derivedBuild, executableSHA256: built.executableSHA256,
  bundledModules: { ...built.bundledModules, 'bundle.mjs': after['app/bundle.mjs'].sha256 }
};
fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log('Restaged diagnostic JS only; all native bytes and original app preserved. No new Build performed.');
