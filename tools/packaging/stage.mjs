// Local staging only: no downloads, compilation, publishing or tag creation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('usage: node tools/packaging/stage.mjs binaries.json EMPTY_OUTPUT');
const binaries = JSON.parse(fs.readFileSync(input));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const versionSource = fs.readFileSync(path.join(root, 'version.go'), 'utf8');
if (!versionSource.includes(`const Version = "${pkg.version}"`)) throw new Error('Go/npm version mismatch');
if (fs.existsSync(output)) throw new Error('output must not exist');
const allowed = new Set(['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-arm64', 'win32-x64']);
for (const [target, file] of Object.entries(binaries)) {
  if (!allowed.has(target) || !path.isAbsolute(file) || !fs.statSync(file).isFile()) throw new Error(`invalid binary: ${target}`);
}
if (!Object.keys(binaries).length) throw new Error('at least one binary required');
fs.mkdirSync(output, { recursive: true });
const wrapper = path.join(output, 'launcher');
fs.mkdirSync(wrapper);
const optionalDependencies = {};
for (const [target, file] of Object.entries(binaries)) {
  const [os, cpu] = target.split('-');
  const name = `${pkg.name}-${target}`;
  optionalDependencies[name] = pkg.version;
  const dir = path.join(output, target);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: pkg.version, private: true, license: pkg.license, os: [os], cpu: [cpu], files: ['xplat-ns*', 'LICENSE', 'NOTICES.txt'] }, null, 2));
  const executable = path.join(dir, os === 'win32' ? 'xplat-ns.exe' : 'xplat-ns');
  fs.copyFileSync(file, executable);
  fs.chmodSync(executable, 0o755);
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(dir, 'LICENSE'));
  fs.copyFileSync(path.join(root, 'assets/NOTICES.txt'), path.join(dir, 'NOTICES.txt'));
}
fs.writeFileSync(path.join(wrapper, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, private: true, license: pkg.license, bin: { 'xplat-ns': 'launcher.cjs' }, exports: {'./plugin': {types:'./plugin/index.d.ts',default:'./plugin/index.cjs'}}, files: ['launcher.cjs', 'plugin', 'LICENSE', 'NOTICES.txt'], engines: { node: '>=22' }, optionalDependencies }, null, 2));
fs.copyFileSync(path.join(root, 'npm/launcher.cjs'), path.join(wrapper, 'launcher.cjs'));
fs.chmodSync(path.join(wrapper, 'launcher.cjs'), 0o755);
for (const [source, name] of [['LICENSE', 'LICENSE'], ['assets/NOTICES.txt', 'NOTICES.txt']]) fs.copyFileSync(path.join(root, source), path.join(wrapper, name));

fs.mkdirSync(path.join(wrapper, 'plugin'));
for (const file of ['index.cjs', 'index.d.ts']) fs.copyFileSync(path.join(root, 'plugin', file), path.join(wrapper, 'plugin', file));
