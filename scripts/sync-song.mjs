// Usage: node scripts/sync-song.mjs <music-library directory> <song-id>
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {archivedSong} from '../dist/lib/library.js';

const [archivePath, songId, instrument = 'piano'] = process.argv.slice(2);
if (!archivePath || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(songId || '')) {
  throw Error('Usage: node scripts/sync-song.mjs <music-library directory> <song-id>');
}
if (!['piano', 'pipa'].includes(instrument)) throw Error('Instrument must be piano or pipa');
const root = resolve(archivePath);
function withinArchive(path) {
  const full = resolve(root, path), rel = relative(root, full);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || resolve(root, rel) !== full) throw Error('Invalid archive path');
  return full;
}
const catalog = JSON.parse(await readFile(resolve(root, 'catalog.json'), 'utf8'));
const source = catalog.entries.find(entry => entry.id === songId);
if (!source || !/^r\d{4}$/.test(source.currentRevision)) throw Error('Song or revision not found');
const metadata = JSON.parse(await readFile(withinArchive(source.metadata), 'utf8'));
const bytes = await readFile(withinArchive(source.performance));
if (metadata.id !== songId || metadata.revision !== source.currentRevision ||
    metadata.files['performance.json'].sha256 !== createHash('sha256').update(bytes).digest('hex')) {
  throw Error('Archive identity or performance checksum mismatch');
}
const entry = {
  id: songId, revision: source.currentRevision, title: source.title.split(' · ')[0],
  composer: source.composer.split('（')[0], status: source.status,
  duration: metadata.durationSeconds,
  performance: `${songId}/${source.currentRevision}/performance.json`,
};
const performance = archivedSong(JSON.parse(bytes), entry);
if (performance.notes.length !== metadata.noteCount || performance.cues.length !== metadata.melodyCount ||
    performance.accompaniment.length !== metadata.accompanimentCount || performance.duration !== entry.duration) {
  throw Error('Archive counts mismatch');
}
const output = fileURLToPath(new URL(instrument === 'pipa' ? '../dist/assets/pipa-library/' : '../dist/assets/music-library/', import.meta.url));
const catalogPath = resolve(output, 'catalog.json');
let published = {schemaVersion: 1, entries: []};
try { published = JSON.parse(await readFile(catalogPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const target = resolve(output, entry.performance);
await mkdir(dirname(target), {recursive: true});
await writeFile(target, bytes);
await writeFile(resolve(dirname(target), 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
const index = published.entries.findIndex(item => item.id === songId);
if (index >= 0) published.entries[index] = entry;
else published.entries.push(entry);
await writeFile(catalogPath, JSON.stringify(published, null, 2) + '\n');
console.log(`Synced ${songId} ${entry.revision}: ${performance.notes.length} notes, ${performance.cues.length} cues.`);
