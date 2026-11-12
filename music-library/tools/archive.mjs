import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import tone from '../vendor/tone-midi.cjs';
import midiFile from '../vendor/midi-file/index.js';
import {buildSong,fingerFor,pitchName} from './v5-melody-extractor.mjs';

export const LIBRARY=fileURLToPath(new URL('../',import.meta.url));
const MAJOR=['Cb','Gb','Db','Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#'];
const MINOR=['Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#','G#','D#','A#'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=object=>JSON.stringify(object,null,2)+'\n';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
const text=value=>typeof value==='string'&&value.trim().length>0;
export const keyName=signature=>(signature.mode==='minor'?MINOR:MAJOR)[signature.fifths+7];
const sortNotes=notes=>[...notes].sort((a,b)=>a.ticks-b.ticks||b.midi-a.midi||a.id.localeCompare(b.id));

export function validateScore(score){
  check(score?.schemaVersion===1,'score.schemaVersion must be 1');
  check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(score.id||'')&&score.id.length<=100,'id must be an ASCII kebab-case identifier');
  check(text(score.title)&&text(score.composer),'title and composer are required (use Unknown if genuinely unknown)');
  check(text(score.provenance?.kind)&&text(score.provenance?.description)&&text(score.provenance?.license),'provenance kind, description and license are required');
  check(['draft','needs-review','ready'].includes(score.quality?.status),'quality.status must be draft, needs-review or ready');
  check(Array.isArray(score.quality.uncertainSpans),'quality.uncertainSpans is required');
  check(typeof score.quality.notes==='string','quality.notes is required');
  for(const span of score.quality.uncertainSpans)check(integer(span.startTicks,0,1e9)&&integer(span.endTicks,span.startTicks+1,1e9)&&text(span.reason),'invalid uncertain span');
  check(score.quality.status!=='ready'||!score.quality.uncertainSpans.length,'Uncertain spans cannot be marked ready');
  const h=score.header;
  check(integer(h?.ppq,1,32767),'header.ppq must be 1..32767 ticks per quarter note');
  function timeline(events,label,validate){
    check(Array.isArray(events)&&events.length>0&&events[0].ticks===0,label+' must start at tick 0');
    events.forEach((e,i)=>{check(integer(e.ticks,0,1e9)&&(i===0||e.ticks>events[i-1].ticks),label+' ticks must strictly increase');validate(e);});
  }
  timeline(h.tempos,'tempos',e=>check(finite(e.bpm,4,1000),'tempo bpm must be 4..1000'));
  timeline(h.timeSignatures,'timeSignatures',e=>check(integer(e.numerator,1,255)&&[1,2,4,8,16,32,64,128].includes(e.denominator),'invalid time signature'));
  timeline(h.keySignatures,'keySignatures',e=>check(integer(e.fifths,-7,7)&&['major','minor'].includes(e.mode),'key signatures use fifths -7..7 and major/minor mode'));
  check(Array.isArray(score.tracks)&&score.tracks.length>0&&score.tracks.length<=128,'tracks must contain 1..128 tracks');
  const ids=new Map(),trackIds=new Set();
  score.tracks.forEach((track,ti)=>{
    check(text(track.id)&&!trackIds.has(track.id),'track ids must be unique');trackIds.add(track.id);
    check(text(track.name)&&integer(track.channel,0,15)&&track.channel!==9&&integer(track.program,0,127),'track needs name, pitched MIDI channel (not 9), and program 0..127');
    check(Array.isArray(track.notes),'track.notes is required');
    for(const note of track.notes){
      check(text(note.id)&&!ids.has(note.id),'note ids must be globally unique: '+note.id);
      check(integer(note.midi,0,127)&&integer(note.ticks,0,1e9)&&integer(note.durationTicks,1,1e9)&&finite(note.velocity,1/127,1),'invalid pitch, ticks, durationTicks or velocity: '+note.id);
      ids.set(note.id,{...note,track:ti});
    }
    for(const cc of track.controlChanges||[])check(integer(cc.number,0,127)&&integer(cc.ticks,0,1e9)&&finite(cc.value,0,1),'invalid controller');
    for(const bend of track.pitchBends||[])check(integer(bend.ticks,0,1e9)&&finite(bend.value,-1,1),'invalid pitch bend');
  });
  check(ids.size>0&&ids.size<=60000,'score must contain 1..60000 notes');
  check(Array.isArray(score.melodyNoteIds)&&score.melodyNoteIds.length>0,'melodyNoteIds must explicitly identify the playable melody');
  let last=-1;const used=new Set();
  for(const id of score.melodyNoteIds){const note=ids.get(id);check(note&&!used.has(id),'unknown/duplicate melody note id: '+id);check(note.ticks>last,'Only one melody event per onset; put other chord notes in accompaniment');used.add(id);last=note.ticks;}
  const seconds=ticksToSeconds(h);
  check(Math.max(...[...ids.values()].map(n=>seconds(n.ticks+n.durationTicks)))<=3600,'Current webpage supports songs up to one hour');
  return ids;
}

export function ticksToSeconds(header){
  let elapsed=0;
  const tempos=header.tempos.map((tempo,i,list)=>{if(i)elapsed+=(tempo.ticks-list[i-1].ticks)*60/(header.ppq*list[i-1].bpm);return {...tempo,time:elapsed};});
  return ticks=>{let t=tempos[0];for(const next of tempos){if(next.ticks>ticks)break;t=next;}return t.time+(ticks-t.ticks)*60/(header.ppq*t.bpm);};
}

export function performanceFromScore(score){
  const ids=validateScore(score),seconds=ticksToSeconds(score.header);
  const notes=sortNotes([...ids.values()]).map(n=>({...n,time:seconds(n.ticks),duration:seconds(n.ticks+n.durationTicks)-seconds(n.ticks)}));
  const byId=new Map(notes.map(n=>[n.id,n])),melody=new Set(score.melodyNoteIds);
  const cues=score.melodyNoteIds.map(id=>{const n=byId.get(id),sig=score.header.keySignatures.filter(k=>k.ticks<=n.ticks).at(-1),tonic=keyName(sig);return {...n,slot:fingerFor(n.midi,tonic,sig.mode),pitch:pitchName(n.midi,sig.fifths<0),tonic,scale:sig.mode};});
  return {schemaVersion:1,songId:score.id,title:score.title,composer:score.composer,notes,cues,accompaniment:notes.filter(n=>!melody.has(n.id)),duration:Math.max(...notes.map(n=>n.time+n.duration)),tracks:score.tracks.map((t,i)=>({index:i,name:t.name,count:t.notes.length})),trackIndex:0,builtin:false,key:keyName(score.header.keySignatures[0]),bpm:score.header.tempos[0].bpm};
}

export function encodeMidi(score,forWeb=false){
  validateScore(score);
  const headerEvents=[];
  for(const t of score.header.tempos)headerEvents.push({ticks:t.ticks,type:'setTempo',microsecondsPerBeat:Math.round(60000000/t.bpm),meta:true});
  for(const t of score.header.timeSignatures)headerEvents.push({ticks:t.ticks,type:'timeSignature',numerator:t.numerator,denominator:t.denominator,metronome:24,thirtyseconds:8,meta:true});
  // Write raw signed fifths. Avoid the legacy encoder's key-signature offset bug.
  for(const t of score.header.keySignatures)headerEvents.push({ticks:t.ticks,type:'keySignature',key:t.fifths,scale:t.mode==='minor'?1:0,meta:true});
  const shortened=[],melodyIds=new Set(score.melodyNoteIds);
  let tracks=score.tracks;
  if(forWeb){
    const byId=new Map(score.tracks.flatMap(t=>t.notes).map(n=>[n.id,n]));
    const notes=score.melodyNoteIds.map((id,i)=>{const n=byId.get(id),next=byId.get(score.melodyNoteIds[i+1]);const durationTicks=next&&next.midi<=n.midi?Math.min(n.durationTicks,next.ticks-n.ticks):n.durationTicks;if(durationTicks!==n.durationTicks)shortened.push(id);return {...n,durationTicks};});
    tracks=[{name:'Melody',channel:0,program:0,notes},...score.tracks.map((t,i)=>({...t,name:'Backing '+(i+1),channel:(i%14)+1>=9?(i%14)+2:(i%14)+1,program:0,notes:t.notes.filter(n=>!melodyIds.has(n.id))})).filter(t=>t.notes.length)];
  }
  function deltas(events){let previous=0;const sorted=events.map((e,i)=>({...e,order:i})).sort((a,b)=>a.ticks-b.ticks||(a.type==='noteOff'?0:1)-(b.type==='noteOff'?0:1)||a.order-b.order);return [...sorted.map(({ticks,order,...e})=>{const deltaTime=ticks-previous;previous=ticks;return {...e,deltaTime};}),{deltaTime:0,meta:true,type:'endOfTrack'}];}
  const encoded=[deltas(headerEvents)];
  for(const track of tracks){
    const events=[{ticks:0,meta:true,type:'trackName',text:track.name},{ticks:0,type:'programChange',channel:track.channel,programNumber:track.program}];
    for(const n of track.notes){events.push({ticks:n.ticks,type:'noteOn',channel:track.channel,noteNumber:n.midi,velocity:Math.max(1,Math.round(n.velocity*127))});events.push({ticks:n.ticks+n.durationTicks,type:'noteOff',channel:track.channel,noteNumber:n.midi,velocity:0});}
    for(const cc of track.controlChanges||[])events.push({ticks:cc.ticks,type:'controller',channel:track.channel,controllerType:cc.number,value:Math.round(cc.value*127)});
    for(const bend of track.pitchBends||[])events.push({ticks:bend.ticks,type:'pitchBend',channel:track.channel,value:Math.max(-8192,Math.min(8191,Math.round(bend.value*8192)))});
    encoded.push(deltas(events));
  }
  return {bytes:Buffer.from(midiFile.writeMidi({header:{format:1,ticksPerBeat:score.header.ppq},tracks:encoded})),shortened};
}

function timelineUnique(events,fallback){const byTick=new Map();for(const e of events){const old=byTick.get(e.ticks);check(!old||json(old)===json(e),'Conflicting global MIDI events at tick '+e.ticks);byTick.set(e.ticks,e);}if(!byTick.has(0))byTick.set(0,fallback);return [...byTick.values()].sort((a,b)=>a.ticks-b.ticks);}
export function scoreFromMidi(bytes,options){
  const midi=new tone.Midi(bytes),raw=midiFile.parseMidi(bytes),keys=[];
  check(raw.header.ticksPerBeat,'SMPTE MIDI timing is not supported; convert to PPQ first');
  for(const track of raw.tracks){let ticks=0;for(const e of track){ticks+=e.deltaTime;if(e.type==='keySignature')keys.push({ticks,fifths:e.key,mode:e.scale?'minor':'major'});}}
  const trackIndex=Number(options['melody-track']||0);check(integer(trackIndex,0,midi.tracks.length-1)&&midi.tracks[trackIndex].notes.length,'Choose an existing nonempty melody track');
  const song=buildSong(midi,{trackIndex,builtin:options['clair-opening']===true});
  return {schemaVersion:1,id:options.id,title:options.title,composer:options.composer||'Unknown',provenance:{kind:'midi',description:options.description||'Imported MIDI; melody selected by the v5 upper-voice heuristic.',url:options.url||'',license:options.license||'unknown'},quality:{status:options.status||'needs-review',notes:options.notes||'MIDI notes preserved; automatically selected melody requires musical review.',uncertainSpans:[]},header:{ppq:midi.header.ppq,tempos:timelineUnique(midi.header.tempos.map(t=>({ticks:t.ticks,bpm:t.bpm})),{ticks:0,bpm:120}),timeSignatures:timelineUnique(midi.header.timeSignatures.map(t=>({ticks:t.ticks,numerator:t.timeSignature[0],denominator:t.timeSignature[1]})),{ticks:0,numerator:4,denominator:4}),keySignatures:timelineUnique(keys,{ticks:0,fifths:0,mode:'major'})},tracks:midi.tracks.map((t,i)=>({id:'track-'+i,name:t.name||'Track '+(i+1),channel:t.channel,program:t.instrument.number,notes:t.notes.map((n,j)=>({id:i+':'+j,midi:n.midi,ticks:n.ticks,durationTicks:n.durationTicks,velocity:n.velocity})),controlChanges:Object.entries(t.controlChanges).flatMap(([number,list])=>list.map(n=>({number:Number(number),ticks:n.ticks,value:n.value}))),pitchBends:t.pitchBends.map(n=>({ticks:n.ticks,value:n.value}))})),melodyNoteIds:song.cues.map(n=>n.id)};
}

function assertMidiRoundtrip(bytes,score){
  const actual=new tone.Midi(bytes).tracks.flatMap(t=>t.notes).map(n=>[n.midi,n.ticks,n.durationTicks]).sort();
  const expected=score.tracks.flatMap(t=>t.notes).map(n=>[n.midi,n.ticks,n.durationTicks]).sort();
  check(json(actual)===json(expected),'MIDI round-trip altered note events; overlapping identical pitches in the same track may be ambiguous');
}

export async function saveRevision(score,{root=LIBRARY,sources=[]}={}){
  const performance=performanceFromScore(score),full=encodeMidi(score),web=encodeMidi(score,true);
  assertMidiRoundtrip(full.bytes,score);
  const webSong=buildSong(new tone.Midi(web.bytes),{trackIndex:0});
  check(webSong.cues.length===performance.cues.length&&webSong.cues.every((n,i)=>n.midi===performance.cues[i].midi&&n.ticks===performance.cues[i].ticks),'Web MIDI did not preserve every explicit melody event');
  const lockPath=path.join(root,'.archive.lock'),lock=await fs.open(lockPath,'wx').catch(()=>{throw Error('Library is busy (.archive.lock); retry after the other writer finishes.');});
  let staging;
  try{
    const catalog=JSON.parse(await fs.readFile(path.join(root,'catalog.json'),'utf8'));
    const versions=path.join(root,'songs',score.id,'revisions');await fs.mkdir(versions,{recursive:true});
    const numbers=(await fs.readdir(versions)).filter(n=>/^r\d+$/.test(n)).map(n=>Number(n.slice(1)));
    const revision='r'+String(Math.max(0,...numbers)+1).padStart(4,'0');
    staging=path.join(versions,'.staging-'+randomUUID());await fs.mkdir(staging);
    const artifacts={'score.json':Buffer.from(json(score)),'performance.json':Buffer.from(json(performance)),'full.mid':full.bytes,'web.mid':web.bytes};
    const sourceInfo=[];
    for(const source of sources){const name=path.basename(source);check(!sourceInfo.some(x=>x.name===name),'Source filenames must be distinct');const bytes=await fs.readFile(source);artifacts['sources/'+name]=bytes;sourceInfo.push({name,sha256:hash(bytes),bytes:bytes.length});}
    const metadata={schemaVersion:1,id:score.id,revision,title:score.title,composer:score.composer,createdAt:new Date().toISOString(),status:score.quality.status,sourceFiles:sourceInfo,noteCount:performance.notes.length,melodyCount:performance.cues.length,accompanimentCount:performance.accompaniment.length,durationSeconds:performance.duration,keyChanges:score.header.keySignatures.map(s=>({...s,key:keyName(s)})),webAdaptation:{melodyTrack:0,shortenedMelodyNoteIds:web.shortened,reason:'Only web.mid clips overlapping melody durations so the v5 importer does not discard lower legato notes. score.json, full.mid and performance.json retain original durations.'},files:Object.fromEntries(Object.entries(artifacts).map(([name,bytes])=>[name,{sha256:hash(bytes),bytes:bytes.length}]))};
    artifacts['metadata.json']=Buffer.from(json(metadata));
    for(const [name,bytes] of Object.entries(artifacts)){const target=path.join(staging,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}
    const target=path.join(versions,revision);await fs.rename(staging,target);staging=null;
    const prior=catalog.entries.find(e=>e.id===score.id),base=`songs/${score.id}/revisions/${revision}`;
    const entry={id:score.id,title:score.title,composer:score.composer,currentRevision:revision,status:score.quality.status,metadata:base+'/metadata.json',score:base+'/score.json',performance:base+'/performance.json',webMidi:base+'/web.mid',fullMidi:base+'/full.mid',revisions:[...(prior?.revisions||[]),revision]};
    catalog.entries=catalog.entries.filter(e=>e.id!==score.id);catalog.entries.push(entry);catalog.entries.sort((a,b)=>a.id.localeCompare(b.id));
    const temp=path.join(root,'.catalog-'+randomUUID()+'.json');await fs.writeFile(temp,json(catalog));await fs.rename(temp,path.join(root,'catalog.json'));
    return {id:score.id,revision,noteCount:performance.notes.length,melodyCount:performance.cues.length,directory:target};
  }finally{if(staging){const temp=path.resolve(staging);check(temp.startsWith(path.resolve(root)+path.sep)&&path.basename(temp).startsWith('.staging-'),'Refusing cleanup outside this library');await fs.rm(temp,{recursive:true,force:true});}await lock.close();await fs.unlink(lockPath);}
}

export async function validateLibrary(root=LIBRARY){
  const catalog=JSON.parse(await fs.readFile(path.join(root,'catalog.json'),'utf8'));check(catalog.schemaVersion===1&&Array.isArray(catalog.entries),'Invalid catalog');
  const ids=new Set();let revisions=0;
  for(const entry of catalog.entries){
    check(!ids.has(entry.id),'Duplicate catalog song id');ids.add(entry.id);check(entry.revisions.includes(entry.currentRevision),'Current revision missing');
    for(const revision of entry.revisions){
      check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)&&/^r\d{4,}$/.test(revision),'Unsafe catalog path');
      const dir=path.join(root,'songs',entry.id,'revisions',revision),meta=JSON.parse(await fs.readFile(path.join(dir,'metadata.json'),'utf8'));
      check(meta.id===entry.id&&meta.revision===revision,'Metadata/catalog mismatch');
      for(const [name,expected] of Object.entries(meta.files)){const file=path.resolve(dir,name);check(file.startsWith(dir+path.sep),'Unsafe metadata path');const bytes=await fs.readFile(file);check(bytes.length===expected.bytes&&hash(bytes)===expected.sha256,'Checksum mismatch: '+file);}
      const score=JSON.parse(await fs.readFile(path.join(dir,'score.json'),'utf8')),performance=performanceFromScore(score);
      check(json(performance)===await fs.readFile(path.join(dir,'performance.json'),'utf8'),'Stale performance.json');
      assertMidiRoundtrip(await fs.readFile(path.join(dir,'full.mid')),score);
      const web=buildSong(new tone.Midi(await fs.readFile(path.join(dir,'web.mid'))),{trackIndex:0});
      check(web.cues.length===performance.cues.length&&web.cues.every((n,i)=>n.midi===performance.cues[i].midi&&n.ticks===performance.cues[i].ticks),'Web melody mismatch');
      check(meta.noteCount===performance.notes.length&&meta.melodyCount===performance.cues.length,'Incorrect note counts');revisions++;
    }
    const base=`songs/${entry.id}/revisions/${entry.currentRevision}`;
    for(const [key,name] of Object.entries({metadata:'metadata.json',score:'score.json',performance:'performance.json',webMidi:'web.mid',fullMidi:'full.mid'}))check(entry[key]===base+'/'+name,'Catalog path does not point to current revision');
  }
  return {songs:catalog.entries.length,revisions,valid:true};
}

async function main(){
  const args=process.argv.slice(2),command=args.shift();
  if(command==='validate'){console.log(json(await validateLibrary()));return;}
  if(command==='list'){console.log(await fs.readFile(path.join(LIBRARY,'catalog.json'),'utf8'));return;}
  const input=args.shift(),options={},sources=[];
  while(args.length){const key=args.shift();check(key?.startsWith('--'),'Expected --option');if(key==='--clair-opening'){options['clair-opening']=true;continue;}const value=args.shift();check(value&&!value.startsWith('--'),'Missing value for '+key);if(key==='--source')sources.push(path.resolve(value));else options[key.slice(2)]=value;}
  if(command==='add'){
    check(input,'Usage: archive.mjs add score.json [--source original-file]');
    const score=JSON.parse(await fs.readFile(input,'utf8'));console.log(json(await saveRevision(score,{sources:[path.resolve(input),...sources]})));return;
  }
  if(command==='from-midi'){
    check(input&&options.id&&options.title,'Usage: archive.mjs from-midi file.mid --id song-id --title Title [--composer Name] [--melody-track 0] [--source original-file]');
    const bytes=await fs.readFile(input),score=scoreFromMidi(bytes,options);console.log(json(await saveRevision(score,{sources:[path.resolve(input),...sources]})));return;
  }
  throw Error('Commands: list | validate | add score.json [--source file] | from-midi file.mid --id ID --title TITLE ...');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
