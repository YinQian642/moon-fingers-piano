// Independent instrument archive; shares the score format, never the piano catalog.
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {saveRevision, validateLibrary} from '../music-library/tools/archive.mjs';
const root=fileURLToPath(new URL('../music-library/pipa/',import.meta.url));
const [command,input]=process.argv.slice(2);
if(command==='add'&&input){
  await mkdir(root,{recursive:true});
  try{await writeFile(new URL('../music-library/pipa/catalog.json',import.meta.url),'{"schemaVersion":1,"entries":[]}\n',{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
  console.log(await saveRevision(JSON.parse(await readFile(input,'utf8')),{root,sources:[input]}));
}else if(command==='validate')console.log(await validateLibrary(root));
else throw Error('Usage: node scripts/pipa-library.mjs add <score.json> | validate');
