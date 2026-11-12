import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {LIBRARY,validateScore,ticksToSeconds,keyName,performanceFromScore,encodeMidi,scoreFromMidi,saveRevision,validateLibrary} from './archive.mjs';
import tone from '../vendor/tone-midi.cjs';
import midiFile from '../vendor/midi-file/index.js';
const example=JSON.parse(await fs.readFile(new URL('../examples/four-notes.score.json',import.meta.url),'utf8'));
const copy=()=>structuredClone(example);

test('explicit melody preserves repeated pitches as distinct events',()=>{
  const p=performanceFromScore(copy());assert.equal(p.notes.length,5);assert.equal(p.cues.length,4);assert.equal(p.accompaniment.length,1);
  assert.deepEqual(p.cues.map(n=>n.midi),[64,60,60,67]);assert.notEqual(p.cues[1].id,p.cues[2].id);
  assert(Math.abs(p.cues[3].time-2)<1e-10);
});
test('tempo changes and rests retain tick timing',()=>{
  const convert=ticksToSeconds(example.header);assert.equal(convert(0),0);assert.equal(convert(1440),2);assert.equal(convert(1920),2.6);
});
test('fifths represent actual minor tonic and MIDI export uses the signed raw value',()=>{
  const s=copy();s.header.keySignatures=[{ticks:0,fifths:-5,mode:'major'},{ticks:960,fifths:4,mode:'minor'}];
  assert.equal(keyName(s.header.keySignatures[1]),'C#');assert.equal(performanceFromScore(s).cues[2].tonic,'C#');
  const raw=midiFile.parseMidi(encodeMidi(s).bytes);
  assert.deepEqual(raw.tracks.flat().filter(e=>e.type==='keySignature').map(e=>[e.key,e.scale]),[[-5,0],[4,1]]);
});
test('full MIDI keeps overlapping melody durations while web MIDI keeps every cue',()=>{
  const s=copy(),full=encodeMidi(s),web=encodeMidi(s,true);
  assert.equal(new tone.Midi(full.bytes).tracks[0].notes[0].durationTicks,720);
  assert.equal(new tone.Midi(web.bytes).tracks[0].notes[0].durationTicks,480);
  assert.deepEqual(web.shortened,['m1']);assert.equal(performanceFromScore(s).cues[0].durationTicks,720);
});
test('invalid note references, duplicate onsets, unsafe ids and uncertain ready status are rejected',()=>{
  for(const edit of [s=>s.melodyNoteIds.push('missing'),s=>s.melodyNoteIds.push('m1'),s=>s.tracks[0].notes[1].ticks=0,s=>s.id='../escape',s=>s.tracks[0].notes[0].midi=128,s=>s.header.tempos[0].ticks=10,s=>s.tracks[0].channel=9,s=>{s.quality.status='ready';s.quality.uncertainSpans=[{startTicks:0,endTicks:480,reason:'unknown pitch'}];}]){
    const s=copy();edit(s);assert.throws(()=>validateScore(s));
  }
});
test('local archive creates immutable revisions and detects corruption',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'moon-library-test-'));
  try{
    await fs.writeFile(path.join(root,'catalog.json'),JSON.stringify({schemaVersion:1,entries:[]}));
    const s=copy(),first=await saveRevision(s,{root,sources:[fileURLToPath(new URL('../examples/four-notes.score.json',import.meta.url))]});
    const previous=await fs.readFile(path.join(first.directory,'score.json'));
    s.title='Revised example';const second=await saveRevision(s,{root});
    assert.equal(first.revision,'r0001');assert.equal(second.revision,'r0002');
    assert.deepEqual(await fs.readFile(path.join(first.directory,'score.json')),previous);
    assert.deepEqual(await validateLibrary(root),{songs:1,revisions:2,valid:true});
    const catalog=JSON.parse(await fs.readFile(path.join(root,'catalog.json')));assert.equal(catalog.entries[0].currentRevision,'r0002');
    await fs.appendFile(path.join(second.directory,'web.mid'),'bad');await assert.rejects(validateLibrary(root),/Checksum mismatch/);
  }finally{
    const resolved=path.resolve(root),temp=path.resolve(os.tmpdir());
    assert(resolved.startsWith(temp+path.sep)&&path.basename(resolved).startsWith('moon-library-test-'));
    await fs.rm(resolved,{recursive:true,force:true});
  }
});
test('archived Clair de lune contains the entire original MIDI and matches v5 melody pitches/ticks',async()=>{
  const dir=path.join(LIBRARY,'songs/debussy-clair-de-lune-piano/revisions/r0001');
  const original=await fs.readFile(path.join(dir,'sources/clair-de-lune.mid'));
  const score=JSON.parse(await fs.readFile(path.join(dir,'score.json'))),p=performanceFromScore(score);
  const imported=scoreFromMidi(original,{id:score.id,title:score.title,'clair-opening':true});
  assert.equal(p.notes.length,1468);assert.equal(p.cues.length,306);assert.equal(p.duration,322.5);assert.equal(p.cues[0].midi,68);
  assert.deepEqual(score.melodyNoteIds,imported.melodyNoteIds);
  const meta=JSON.parse(await fs.readFile(path.join(dir,'metadata.json')));
  assert.equal(createHash('sha256').update(original).digest('hex'),meta.files['sources/clair-de-lune.mid'].sha256);
  assert.deepEqual(score.header.keySignatures.map(keyName),['Db','C#','Db']);
  const report=await validateLibrary();const catalog=JSON.parse(await fs.readFile(path.join(LIBRARY,'catalog.json')));assert.equal(report.songs,catalog.entries.length);assert(report.revisions>=report.songs);assert(report.valid);
});
