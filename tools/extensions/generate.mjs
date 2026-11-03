import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const result=await build({entryPoints:['bridge/extensions/runner.cjs'],bundle:true,platform:'node',target:'node22',format:'cjs',write:false,legalComments:'inline'});
const file='extension/transport/runner.cjs';
let text=result.outputFiles[0].text;
for (const name of ['@grpc/grpc-js','@grpc/proto-loader','google-protobuf','protobufjs','long','lodash.camelcase','yargs','yargs-parser','cliui','wrap-ansi','string-width','strip-ansi','ansi-regex','ansi-styles','color-convert','color-name','emoji-regex','is-fullwidth-code-point','escalade','get-caller-file','require-directory','y18n']) {
 let license;
 for (const file of ['LICENSE','LICENSE.md','LICENSE.txt','LICENSE-MIT.txt']) {try{license=await readFile(`node_modules/${name}/${file}`,'utf8');break;}catch{}}
 if(!license)throw new Error(`missing runner license for ${name}`);
 text+='\n/* '+name+'\n'+license.replaceAll('*/','* /').replace(/\r/g,'').replace(/[ \t]+$/gm,'')+' */\n';
}
text+='\n/* HashiCorp framework protobuf schemas (MPL-2.0)\n'+(await readFile('extension/transport/wire/LICENSE.hashicorp','utf8')).replaceAll('*/','* /')+' */\n';
if(process.argv.includes('--check')){if(await readFile(file,'utf8')!==text)throw new Error('stale extension runner');}else await writeFile(file,text);
