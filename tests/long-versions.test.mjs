import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {archivedSong} from '../dist/lib/library.js';
import {Transport} from '../dist/lib/music.js';
import tone from '../music-library/vendor/tone-midi.cjs';

const root=new URL('../',import.meta.url);
const catalog=JSON.parse(readFileSync(new URL('dist/assets/music-library/catalog.json',root)));
const specs=[
 ['moscow-nights-21405ff9-piano',1928,216,184.407707675,'21405ff9.mid'],
 ['merry-christmas-mr-lawrence-murashin-piano',2272,640,270.906047596,'Merry.Christmas.MrLawrence.p.mid'],
];
const tuple=ns=>ns.map(n=>[n.midi,n.ticks,n.durationTicks,Math.round(n.velocity*127)].join(',')).sort();
const pitches=ns=>ns.map(n=>n.midi).sort((a,b)=>a-b);
for(const [id,noteCount,cueCount,duration,source]of specs){
 const entry=catalog.entries.find(e=>e.id===id);
 const song=archivedSong(JSON.parse(readFileSync(new URL('dist/assets/music-library/'+entry.performance,root))),entry);
 const dir=`music-library/songs/${id}/revisions/r0001/`;
 test(`${id}: complete source pitches and timing survive piano conversion and publication`,()=>{
  const midi=new tone.Midi(readFileSync(new URL(dir+'sources/'+source,root)));
  assert.deepEqual(tuple(song.notes),tuple(midi.tracks.filter(t=>t.channel!==9).flatMap(t=>t.notes)));
  assert.deepEqual([song.notes.length,song.cues.length],[noteCount,cueCount]);
  assert.ok(Math.abs(song.duration-duration)<1e-8);
 });
 test(`${id}: entire guided performance includes original accompaniment and ending`,()=>{
  let now=0;const played=[];
  const t=new Transport({now:()=>now,note:m=>played.push(m),stopAll(){}});
  t.mode='guided';t.speed=1;t.load(song);t.start();
  // Each simulated response can add one frame of waiting to the score clock.
  for(now=0;now<=song.duration+cueCount*.013+2;now+=.013){t.tick();if(t.state==='waiting')assert.equal(t.hit(t.cue.slot).accepted,true);}
  assert.equal(t.state,'ended');assert.equal(t.hits,cueCount);
  assert.deepEqual(played.sort((a,b)=>a-b),pitches(song.notes));
 });
 test(`${id}: repeated-pitch cues each require a distinct dream tap`,()=>{
  let now=0;const played=[];
  const t=new Transport({now:()=>now,note:m=>played.push(m),stopAll(){}});
  t.mode='dream';t.load(song);
  for(let i=0;i<cueCount;i++){now=i*10;t.tick();assert.equal(t.index,i);assert.equal(t.hit(i%8).accepted,true);assert.equal(t.index,i+1);}
  assert.deepEqual(played,song.cues.map(n=>n.midi));
 });
}
