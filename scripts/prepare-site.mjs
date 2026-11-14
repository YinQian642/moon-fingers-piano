// Rebuild the deployable library from the repository's authoritative archives.
import {validateLibrary} from '../music-library/tools/archive.mjs';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const run = (...args) => execFileSync(process.execPath, args, {cwd, stdio: 'inherit'});
run('music-library/tools/archive.mjs', 'validate');
const catalog = JSON.parse(readFileSync(new URL('../music-library/catalog.json', import.meta.url)));
for (const entry of catalog.entries) {
  // Preserve the existing Moonlight playback. Its archives remain available for later revisions.
  if (entry.id !== 'debussy-clair-de-lune-piano') run('scripts/sync-song.mjs', 'music-library', entry.id);
}
console.log(await validateLibrary(fileURLToPath(new URL('../music-library/pipa/', import.meta.url))));
const pipaCatalog = JSON.parse(readFileSync(new URL('../music-library/pipa/catalog.json', import.meta.url)));
for (const entry of pipaCatalog.entries) run('scripts/sync-song.mjs', 'music-library/pipa', entry.id, 'pipa');
// Pass cached WASM bytes through MediaPipe's factory options without using executable
// Blob URLs or modifying the upstream file that already-open clients verify by hash.
const vendor = new URL('../dist/vendor/', import.meta.url);
const upstream = readFileSync(new URL('vision_bundle.mjs', vendor), 'utf8');
const factoryOptions = 'n.assetLoaderPath,e,{locateFile:t=>';
if (upstream.split(factoryOptions).length !== 2) throw Error('Review the WASM factory adapter for this MediaPipe build.');
const adapted = upstream.replace(factoryOptions, 'n.assetLoaderPath,e,{wasmBinary:n.wasmBinary,locateFile:t=>');
writeFileSync(new URL('vision_bundle_bytes.mjs', vendor),
  '// Modified by Moon Fingers Piano: let callers supply verified WASM bytes to the Emscripten factory.\n' + adapted);
// Serve small immutable objects when an edge connection cannot deliver a large file.
for (const file of ['hand_landmarker.task','wasm/vision_wasm_internal.wasm','wasm/vision_wasm_nosimd_internal.wasm']) {
  const bytes = readFileSync(new URL(file, vendor));
  const digest = createHash('sha256').update(bytes).digest('hex');
  const dir = new URL(`hand-parts/${digest}/`, vendor);
  mkdirSync(dir, {recursive:true});
  const partSize = 512 * 1024;
  for (let start = 0; start < bytes.length; start += partSize) {
    writeFileSync(new URL(`${start / partSize}.bin`, dir), bytes.subarray(start, start + partSize));
  }
}
run('scripts/update-manifest.mjs');
run('verify-dist.mjs');
