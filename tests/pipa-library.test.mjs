import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {archivedSong} from '../dist/lib/library.js';
import {Transport} from '../dist/lib/music.js';

const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const catalog=read('../dist/assets/pipa-library/catalog.json');
const entry=catalog.entries[0];
const source=read('../dist/assets/pipa-library/'+entry.performance);
const song=archivedSong(source,entry);
const pitches=notes=>notes.map(n=>n.midi).sort((a,b)=>a-b);

test('Jasmine is published only in the independent pipa library with immutable source data',()=>{
  assert.deepEqual(catalog.entries.map(e=>e.id),['jasmine-pipa']);
  assert(!read('../dist/assets/music-library/catalog.json').entries.some(e=>e.id===entry.id));
  assert.deepEqual(source,read('../music-library/pipa/songs/jasmine-pipa/revisions/r0001/performance.json'));
  assert.deepEqual([song.notes.length,song.cues.length,song.accompaniment.length],[93,77,16]);
  assert.deepEqual(song.cues.slice(0,7).map(n=>n.midi),[68,68,71,73,76,76,73]);
  assert.equal(song.key,'E');
});

for(const mode of ['guided','dream'])test(`Jasmine ${mode} uses the shared transport without losing repeated notes or accompaniment`,()=>{
  let time=0;const played=[];
  const t=new Transport({now:()=>time,stopAll(){},note:(midi)=>played.push({midi})});
  t.mode=mode;t.speed=1;t.load(song);t.setDreamAccompaniment(true);t.start();
  if(mode==='guided'){
    for(time=0;time<song.duration+2;time+=.01){t.tick();if(t.state==='waiting')assert(t.hit(t.cue.slot).accepted);}
  }else{
    for(const [i,cue] of song.cues.entries()){
      time=cue.time;t.tick();assert.equal(t.index,i);assert(t.hit(i%4).accepted);assert.equal(t.index,i+1);
    }
    time=song.duration+2;t.tick();
  }
  assert.equal(t.state,'ended');assert.equal(t.hits,77);
  assert.deepEqual(pitches(played),pitches(song.notes));
});
