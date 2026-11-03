import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
// simple-plist emits UMD with a shadowed require; expose static imports to esbuild.
const result = await build({ entryPoints: ['bridge/host/main.cjs'], bundle: true, platform: 'node', target: 'node18', format: 'cjs', write: false, plugins: [{ name: 'static-umd-require', setup(build) { build.onLoad({ filter: /simple-plist\/dist\/.*\.js$/ }, async ({path}) => ({ contents: (await readFile(path, 'utf8')).replace(/function \(require, exports\)/g, 'function (_umdRequire, exports)'), loader: 'js' })); } }], legalComments: 'inline' });
const files = new Map([['assets/helper.cjs', result.outputFiles[0].text]]);
let notices = 'Embedded helper third-party notices\n\n';
for (const name of ['xcode', 'simple-plist', 'bplist-creator', 'bplist-parser', 'stream-buffers', 'big-integer', 'base64-js', 'plist', 'xmlbuilder', 'uuid', '@xmldom/xmldom']) {
  const pkg = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
  let license;
  for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE-MIT.txt', 'LICENSE.txt', 'UNLICENSE']) {
    try { license = await readFile(`node_modules/${name}/${file}`, 'utf8'); break; } catch {}
  }
  if (!license && name === 'bplist-parser') license = (await readFile(`node_modules/${name}/README.md`, 'utf8')).split('## License')[1];
  if (name === 'xcode') license += '\n' + await readFile('node_modules/xcode/NOTICE', 'utf8');
  if (!license) throw new Error(`Missing license for ${name}`);
  notices += `\n=== ${name} ${pkg.version} (${pkg.license}) ===\n${license}\n`;
}
files.set('assets/NOTICES.txt', notices);
for (const [file, original] of files) {
  const text = original.replace(/[ \t\r]+$/gm, "").trimEnd() + "\n";
  if (process.argv.includes('--check')) {
    if (await readFile(file, 'utf8') !== text) throw new Error(`Stale payload: ${file}`);
  } else await writeFile(file, text);
}
