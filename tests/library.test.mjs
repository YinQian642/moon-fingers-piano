import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {archivedSong} from '../dist/lib/library.js';
import {Transport} from '../dist/lib/music.js';

const root = new URL('../dist/assets/music-library/', import.meta.url);
const entry = JSON.parse(readFileSync(new URL('catalog.json', root))).entries.find(e => e.id === 'moscow-nights-eop-1024-piano');
const bytes = readFileSync(new URL(entry.performance, root));
const original = JSON.parse(bytes);
const song = archivedSong(original, entry);

test('published Moscow archive matches the archived file and preserves its melody partition', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'b26500f6e618a583b667c3fc1c1370faaa0ecee77ae0a6e55fb36a1034dc4713');
  assert.deepEqual([song.notes.length, song.cues.length, song.accompaniment.length], [199, 58, 141]);
  assert.equal(song.duration, 31.25);
  assert.equal(song.revision, 'r0001');
  assert.equal(song.key, 'A');
  assert(song.cues.every(c => c.scale === 'minor'));
  assert.deepEqual(song.cues.slice(0, 4).map(c => c.midi), [69, 72, 76, 72]);
});

test('malformed archived scores cannot replace a playable song', () => {
  for (const corrupt of [
    data => { data.songId = 'another-song'; },
    data => { data.notes[0].duration = NaN; },
    data => { data.cues[0].slot = 8; },
    data => { data.cues[0].midi++; },
    data => { data.accompaniment.pop(); },
    data => { data.cues[1] = {...data.cues[0]}; },
    data => { data.accompaniment.reverse(); },
  ]) {
    const data = structuredClone(original);corrupt(data);
    assert.throws(() => archivedSong(data, entry));
  }
});

function fixture(mode, backing = false) {
  let time = 0;const played = [];
  const transport = new Transport({now: () => time, stopAll: () => {}, note: (...args) => played.push(args)});
  transport.mode = mode;transport.speed = 1;transport.load(song);transport.setDreamAccompaniment(backing);
  return {transport, played, at: value => {time = value;transport.tick();}};
}
const pitches = notes => notes.map(n => n.midi).sort((a, b) => a - b);

test('entire Moscow guided performance plays every archived note exactly once', () => {
  const {transport: t, played, at} = fixture('guided');t.start();
  for (let time = 0; time <= song.duration + 1; time += .013) {
    at(time);
    if (t.state === 'waiting') assert.equal(t.hit(t.cue.slot).accepted, true);
  }
  assert.equal(t.state, 'ended');assert.equal(t.hits, 58);
  assert.deepEqual(played.map(n => n[0]).sort((a, b) => a - b), pitches(song.notes));
});

test('Moscow dream melody advances once per tap, including repeated pitches, and waits indefinitely', () => {
  const {transport: t, played, at} = fixture('dream');t.start();
  for (let i = 0; i < 58; i++) {
    at(i * 100);assert.equal(t.index, i);assert.equal(played.length, i);
    assert.equal(t.hit(i % 8).accepted, true);assert.equal(t.index, i + 1);
  }
  at(6000);assert.equal(t.state, 'ended');
  assert.deepEqual(played.map(n => n[0]), song.cues.map(n => n.midi));
});

test('Moscow dream with backing retains all notes when tapped at score tempo', () => {
  const {transport: t, played, at} = fixture('dream', true);t.start();
  for (const cue of song.cues) {at(cue.time);assert.equal(t.hit(4).accepted, true);}
  at(song.duration + 1);assert.equal(t.state, 'ended');
  assert.deepEqual(played.map(n => n[0]).sort((a, b) => a - b), pitches(song.notes));
});
