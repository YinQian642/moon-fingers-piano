import {readdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(path.join(root, dir), {withFileTypes: true})) {
    const name = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await walk(name));
    else if (entry.isFile()) files.push(name);
  }
  return files;
}
const files = [];
for (const name of [...await walk('dist'), 'serve.mjs'].sort()) {
  const bytes = await readFile(path.join(root, name));
  files.push({path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
}
await writeFile(path.join(root, 'MANIFEST.sha256.json'), JSON.stringify({
  schemaVersion: 1, algorithm: 'SHA-256',
  repository: 'https://github.com/YinQian642/moon-fingers-piano',
  files,
}, null, 2) + '\n');
console.log(`Updated checksums for ${files.length} runtime files.`);
