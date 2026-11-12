import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {encodeMidi,validateScore,performanceFromScore} from '../../tools/archive.mjs';
import tone from '../../vendor/tone-midi.cjs';
import midiFile from '../../vendor/midi-file/index.js';
import {buildSong} from '../../tools/v5-melody-extractor.mjs';

const folder=fileURLToPath(new URL('./',import.meta.url));
const score=JSON.parse(await fs.readFile(folder+'score.json','utf8'));
const map=JSON.parse(await fs.readFile(folder+'transcription-map.json','utf8'));
// Second reading: numbered-notation image, in original 1=C syllables.
// + = upper octave dot, - = lower dot, -- = two lower dots; unit = 16th.
// Separate reference from the alphabetic transcription of the staff image.
const numbered=[
 ['6/2 +1/2 +3/2 +1/2', '--6/1 -3/1 -6/1 1/1 3/2 -6/2'],
 ['+2/4 +1/2 7/2', '-2/1 -6/1 2/1 4/1 6/2 2/2'],
 ['+3/4 +2/4', '--3/1 --7/1 -3/1 -#5/1 -7/2 -3/2'],
 ['6/8', '--6/1 -3/1 -6/1 1/1 3/2 -6/2'],
 ['+1/2 +3/2 +5/2 +5/2', '-1/1 -5/1 1/1 3/1 5/2 1/2'],
 ['+6/4 +5/2 +4/2', '-2/1 -6/1 2/1 4/1 6/2 2/2'],
 ['+3/8', '--6/1 -3/1 -6/1 1/1 3/2 -6/2'],
 ['+#4/4 +#5/4', '--2/1 --6/1 -2/1 -#4/1 --3/1 --7/1 -3/1 -#5/1'],
 ['+7/2 +6/2 +3/4~', '--6/1 -3/1 -6/1 1/1 3/2 -6/2'],
 ['+3/2 7/4 6/2', '[-6,1,3]/8'],
 ['+3/2 +2/2 +4/4', '--2/1 --6/1 -2/1 -4/1 -6/2 -2/2'],
 ['+3/4 +5/2 +4/2', '[-2,-4,-6]@/4 R/4'],
 ['+3/4 +2/2 +1/2', '--3/1 --7/1 -3/1 -#5/1 -7/2 -3/2'],
 ['+3/4 +2/4', '--6/1 -3/1 -6/1 1/1 3/2 -6/2'],
 ['6/8', '--6/1 -3/1 -6/1 1/1 3/2 1/2'],
 ['6/8', '--6/1 -3/1 -6/1 1/1 3/2 1/2'],
 ['+6/8', '--6/1 -3/1 -6/1 1/1 3/2 1/2'],
 ['[+1,+3,+6]@/8', '[--6,-3,-6]/8'],
];
function degreeToMidi(p){
  const [,oct,sharp,degree]=/^(--|-|\+)?(#?)([1-7])$/.exec(p);
  return 60+12*({'+':1,'-':-1,'--':-2}[oct]||0)+[0,2,4,5,7,9,11][Number(degree)-1]+(sharp?1:0);
}
function letterToMidi(p){
  const [,letter,sharp,oct]=/^([A-G])(#?)([0-8])$/.exec(p);
  return 12*(Number(oct)+1)+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[letter]+(sharp?1:0);
}
function normalize(line,convert){
  return line.split(' ').map(token=>{
    const [p,duration]=token.split('/');
    return {pitches:p==='R'?[]:p.replace(/[\[\]@]/g,'').split(',').map(convert),units:Number(duration.replace('~','')),tie:duration.endsWith('~'),roll:p.endsWith('@')};
  });
}
numbered.forEach(([rh,lh],index)=>{
  for(const [hand,value] of [['rh',rh],['lh',lh]])assert.deepEqual(normalize(map.writtenMeasures[index][hand],letterToMidi),normalize(value,degreeToMidi),`Two image readings disagree at source bar ${index+1} ${hand}`);
});
const ids=validateScore(score),all=[...ids.values()],melody=score.melodyNoteIds.map(id=>ids.get(id));
const performance=performanceFromScore(score),full=encodeMidi(score),web=encodeMidi(score,true);
const tuple=notes=>notes.map(n=>[n.midi,n.ticks,n.durationTicks,Math.round(n.velocity*127)].join(',')).sort();
assert.deepEqual(tuple(new tone.Midi(full.bytes).tracks.flatMap(t=>t.notes)),tuple(all));
assert.deepEqual(tuple(new tone.Midi(web.bytes).tracks.flatMap(t=>t.notes)),tuple(all));
assert.equal(web.shortened.length,0);
const webSong=buildSong(new tone.Midi(web.bytes),{trackIndex:0});
assert.deepEqual(webSong.cues.map(n=>[n.midi,n.ticks]),melody.map(n=>[n.midi,n.ticks]));
const raw=midiFile.parseMidi(full.bytes);
assert.equal(raw.header.ticksPerBeat,480);
assert.deepEqual(raw.tracks.flat().filter(e=>e.type==='keySignature').map(e=>[e.key,e.scale]),[[0,1]]);
assert.deepEqual(raw.tracks.flat().filter(e=>e.type==='setTempo').map(e=>e.microsecondsPerBeat),[625000]);
assert.deepEqual(raw.tracks.flat().filter(e=>e.type==='timeSignature').map(e=>[e.numerator,e.denominator]),[[2,4]]);
assert.equal(performance.duration,31.25);
assert.equal(all.length,199); assert.equal(melody.length,58); assert.equal(performance.accompaniment.length,141);
for(const {noteId,ticks,durationTicks} of map.tieMerges){
  assert.equal(ids.get(noteId).durationTicks,720);
  assert.equal(ids.get(noteId).ticks+720,ticks+durationTicks);
  assert.ok(!melody.some(n=>n.ticks===ticks),'Tie continuation was rearticulated');
}
const restSpans=map.eventMap.filter(e=>e.kind==='rest');
assert.equal(restSpans.length,2);
for(const r of restSpans)assert.ok(score.tracks[1].notes.every(n=>n.ticks>=r.ticks+r.durationTicks||n.ticks+n.durationTicks<=r.ticks),'LH rest contains a sounding note');
const repeated=melody.slice(1).flatMap((n,i)=>n.midi===melody[i].midi?[{previous:melody[i].id,current:n.id,midi:n.midi,previousTicks:melody[i].ticks,ticks:n.ticks}]:[]);
assert.deepEqual(repeated.map(r=>[r.midi,r.previousTicks,r.ticks]),[[79,4320,4560],[69,13440,14400],[81,22080,23100]]);
for(const r of repeated){assert.notEqual(r.previous,r.current);assert.ok(r.ticks>r.previousTicks);}
const sharpNotes=all.filter(n=>[6,8].includes(n.midi%12));
assert.equal(sharpNotes.length,11);
const result={valid:true,scope:'two image readings, canonical events, exported MIDI and v5 extractor; not auditory verification',sourcePagesRead:2,writtenMeasures:18,playbackMeasures:25,notes:199,melody:58,accompaniment:141,durationSeconds:31.25,pitchRange:[Math.min(...all.map(n=>n.midi)),Math.max(...all.map(n=>n.midi))],key:'A minor',ppq:480,timeSignature:'2/4',tempoBpm:96,tempoChangeCount:0,sharpNoteCount:sharpNotes.length,tieMergeCount:map.tieMerges.length,lhQuarterRests:restSpans.map(e=>({sourceBar:e.sourceBar,playbackBar:e.playbackBar,ticks:e.ticks,durationTicks:e.durationTicks})),repeatedMelodyPairs:repeated,fullMidiRoundtrip:true,webMidiRoundtrip:true,webMelodyMatches:true,shortenedMelodyCount:web.shortened.length,actualListening:false};
await fs.writeFile(folder+'program-verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
