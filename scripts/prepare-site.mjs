// Rebuild the deployable library from the repository's authoritative archives.
import {validateLibrary} from '../music-library/tools/archive.mjs';
import {readFileSync} from 'node:fs';
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
run('scripts/update-manifest.mjs');
run('verify-dist.mjs');
