import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {scoreFromMidi,validateScore,encodeMidi,performanceFromScore} from '../tools/archive.mjs';
import tone from '../vendor/tone-midi.cjs';
import mf from '../vendor/midi-file/index.js';
import {buildSong} from '../tools/v5-melody-extractor.mjs';

const inputRoot=fileURLToPath(new URL('./',import.meta.url));
const configs=[
 {folder:'moscow-nights-long',file:'21405ff9.mid',id:'moscow-nights-21405ff9-piano',title:'莫斯科郊外的晚上（合奏钢琴化长版）',composer:'Vasily Solovyov-Sedoy（瓦西里·索洛维约夫-谢多伊）',url:'https://www.midi-karaoke.info/21405ff9.ru.html',download:'https://www.midi-karaoke.info/21405ff9.mid'},
 {folder:'merry-christmas-mr-lawrence',file:'Merry.Christmas.MrLawrence.p.mid',id:'merry-christmas-mr-lawrence-murashin-piano',title:'Merry Christmas Mr. Lawrence（钢琴版）',composer:'Ryuichi Sakamoto（坂本龙一）',url:'https://murashin.sakura.ne.jp/cgi-bin/adtunetr4mid.cgi?smf=../upload/Merry.Christmas.MrLawrence.p.mid',download:'https://murashin.sakura.ne.jp/upload/Merry.Christmas.MrLawrence.p.mid'},
];
const tuple=notes=>notes.map(n=>[n.midi,n.ticks,n.durationTicks,Math.round(n.velocity*127)].join(',')).sort();
for(const c of configs){
 const dir=inputRoot+c.folder+'/',bytes=await fs.readFile(dir+c.file),midi=new tone.Midi(bytes),raw=mf.parseMidi(bytes);
 const score=scoreFromMidi(bytes,{id:c.id,title:c.title,composer:c.composer,'melody-track':'0',url:c.url,license:'unknown'});
 const excluded=[],reviewedArpeggios=[];
 if(c.folder==='moscow-nights-long'){
  for(const t of score.tracks.filter(t=>t.channel===9))excluded.push({trackId:t.id,channel:t.channel,notes:t.notes.length,reason:'原始GM鼓轨，非有音高钢琴声部；完整原文件保留，未将鼓号误作钢琴音高。'});
  score.tracks=score.tracks.filter(t=>t.channel!==9);
  // No MIDI key meta event exists. Infer C minor from the C/Eb/G opening,
  // recurring Ab/B leading tone, and C cadences. Mark this inference for review.
  score.header.keySignatures=[{ticks:0,fifths:-3,mode:'minor'}];
  const names=['Melody (source channel 15)','Bass (source channel 2)','Piano backing (source channel 3)','Piano figures (source channel 7)'];
  score.tracks.forEach((t,i)=>{t.name=names[i];t.program=0;});
  score.melodyNoteIds=score.tracks[0].notes.map(n=>n.id);
  score.provenance.description='MIDI Music Collection文件21405ff9，页面名“Подмосковные Вечера 1.mid”，编配者未署名。实际读取完整MIDI，原始音符时长184.407707675秒；没有循环旧31秒版本、没有增写小节或拉慢速度凑时长。源文件是多乐器合奏，本版明确钢琴化：保留所有1928个有音高事件及原始八度、力度、时值、起音和控制器；只排除GM通道10的893个鼓事件，将保留声部的program设为钢琴0。不是合唱录音的逐音扒谱，原始2821音符MIDI完整附存。源文件缺少调号事件，C小调为依据旋律和终止音的编辑判断。';
  score.quality={status:'needs-review',notes:'主旋律来自独立的源channel15（零基14）共216个单音，完整保留重复起音；其余1712音归伴奏。检查开头C4/Eb4/G4/Eb4、主题再现及尾部C4终止，与同曲旋律相符。源节拍4/4、PPQ240、速度约65，原有演奏时值未量化。调号是显式推断；合奏钢琴化后多声部的平衡与尾奏需试听。未取得对应录音，未实际试听；原MIDI精确保留不等于原作逐音认证。授权unknown。',uncertainSpans:[{startTicks:0,endTicks:47946,reason:'整曲的来源编配者未署名，未独立对照出版谱或录音；C小调为缺失调号的编辑推断。钢琴化多声部平衡尚未试听，源鼓轨仅在原材料保留。'},{startTicks:45696,endTicks:47946,reason:'主旋律终止后的原始伴奏尾奏（约175.75–184.41秒）保留；声部角色和结尾听感待试听。'}]};
 }else{
  score.tracks[0].name='Piano upper staff (melody and inner voices)';score.tracks[1].name='Piano lower staff (accompaniment)';
  // Source has two explicit staffs. Select highest simultaneous upper-staff
  // voice; inner Bb3 at 48000/55680 remains under held Eb4, as reviewed.
  // Rolled chords have staggered onsets and a common release: retain only
  // their highest note as a cue, keeping EVERY lower note in accompaniment.
  const selected=new Set(score.melodyNoteIds),notes=score.tracks[0].notes;
  for(let i=0;i<notes.length;i++){
   const first=notes[i];
   const group=notes.filter(n=>n.ticks>=first.ticks&&n.ticks<=first.ticks+120&&Math.abs((n.ticks+n.durationTicks)-(first.ticks+first.durationTicks))<=2);
   if(group.length<3||new Set(group.map(n=>n.ticks)).size<3||group.some(n=>n.durationTicks<150))continue;
   if(reviewedArpeggios.some(g=>g.noteIds.includes(first.id)))continue;
   const top=group.reduce((a,b)=>b.midi>a.midi?b:a);
   group.forEach(n=>selected.delete(n.id));selected.add(top.id);
   reviewedArpeggios.push({startTicks:first.ticks,endTicks:Math.max(...group.map(n=>n.ticks+n.durationTicks)),noteIds:group.map(n=>n.id),melodyNoteId:top.id,reason:'紧邻起音、共同释放的展开和弦；上方音作旋律，其余原样保留为伴奏。'});
  }
  score.melodyNoteIds=notes.filter(n=>selected.has(n.id)).sort((a,b)=>a.ticks-b.ticks).map(n=>n.id);
  score.provenance.description='来自murashin.sakura.ne.jp公开MIDI上传目录的Merry.Christmas.MrLawrence.p.mid，目录署上传者E、登记2023-10-16，编曲/制谱者未核实。采用原始SMF，不采用该站调律转换文件。两条钢琴声部共2272音，源时长270.906047596秒，保留原始八度、起音、时值、力度、1551个控制器事件、17个速度标记及12/8→4/4变化；没有重排段落或补写音符。源文件调号为5降号/major，原样保留Db大调元数据，不将其擅改为C大调。';
  score.quality={status:'needs-review',notes:'已检查原始两轨的开头高音主题F6/Eb6/F6/Bb6、tick46080中低音主题、76800和弦段、92160高音再现、122880重复和弦段及184320起尾声。右手同刻和弦只取最高声部；tick48000和55680的Bb3在持续Eb4下作为内声部；共同释放的短促展开和弦按最高音归旋律，全部内声部保留。全曲精确音符和控制事件经程序比对；尚未逐小节对照出版谱或实际试听，不能认证为坂本龙一某场演奏原版。网页暂不执行MIDI踏板/弯音，档案仍保留。授权unknown。',uncertainSpans:[{startTicks:0,endTicks:199583,reason:'网络钢琴MIDI版本，编曲者未核实；未对照出版谱或实际试听。保留来源的高音八度、Db major调号及所有演奏数据，是否匹配用户期望版本仍待确认。'},{startTicks:46080,endTicks:76800,reason:'中低音主题与内声部交错；暂采用上谱表最高声部并排除两处持续旋律下的Bb3，需人工声部复核。'},{startTicks:76800,endTicks:122880,reason:'和弦、琶音与高音再现段的主旋律归属待试听；详细展开和弦事件见source-audit.json。'},{startTicks:184320,endTicks:199583,reason:'尾声的低音震音和右手重复和弦完整保留，旋律逐次起音的安排及收尾听感待试听。'}]};
 }
 const ids=validateScore(score),perf=performanceFromScore(score),full=encodeMidi(score),web=encodeMidi(score,true);
 const retained=midi.tracks.filter(t=>t.channel!==9).flatMap(t=>t.notes),all=score.tracks.flatMap(t=>t.notes);
 assert.deepEqual(tuple(all),tuple(retained),'Canonical notes must match all pitched source notes');
 assert.deepEqual(tuple(new tone.Midi(full.bytes).tracks.flatMap(t=>t.notes)),tuple(all));
 assert.equal(perf.duration,midi.duration);
 const imported=buildSong(new tone.Midi(web.bytes),{trackIndex:0});
 assert.deepEqual(imported.cues.map(n=>[n.midi,n.ticks]),perf.cues.map(n=>[n.midi,n.ticks]));
 const sourceRawTempo=[];for(const track of raw.tracks){let ticks=0;for(const e of track){ticks+=e.deltaTime;if(e.type==='setTempo')sourceRawTempo.push({ticks,microsecondsPerBeat:e.microsecondsPerBeat});}}
 const exportedRaw=mf.parseMidi(full.bytes);assert.deepEqual(exportedRaw.tracks[0].filter(e=>e.type==='setTempo').map(e=>e.microsecondsPerBeat),score.header.tempos.map(t=>Math.round(60000000/t.bpm)));
 const melody=perf.cues,repeats=melody.slice(1).filter((n,i)=>n.midi===melody[i].midi).length;
 const audit={sourcePage:c.url,downloadUrl:c.download,sourceFile:c.file,sourceSha256:createHash('sha256').update(bytes).digest('hex'),sourceBytes:bytes.length,sourceNoteCount:midi.tracks.flatMap(t=>t.notes).length,sourceTracks:midi.tracks.map((t,i)=>({index:i,name:t.name,channel:t.channel,program:t.instrument.number,notes:t.notes.length})),retainedNotes:all.length,excluded,melodyEvents:melody.length,accompanimentNotes:perf.accompaniment.length,repeatedConsecutiveMelodyPairs:repeats,originalTimingAndPitchesPreserved:true,durationSeconds:perf.duration,ppq:score.header.ppq,header:score.header,rawSourceTempo:sourceRawTempo,reviewedArpeggios,programChecks:{sourcePitchedNoteEquality:true,fullMidiRoundtrip:true,webMelodyEquality:true,webShortenedMelodyIds:web.shortened,controllersPreserved:score.tracks.every(t=>JSON.stringify(t.controlChanges)===JSON.stringify(scoreFromMidi(bytes,{id:c.id,title:c.title}).tracks.find(x=>x.id===t.id).controlChanges))},actualListening:false,license:'unknown',sourceSearchNote:c.folder==='moscow-nights-long'?'39.43秒的Seonaidh Morton合唱MIDI和127.03秒的Kombrig合奏候选未采用；未将短版复制凑长。':'比较了单轨285.625秒与227.969秒候选，采用两谱表、含速度变化的270.906秒版本。目录来源https://murashin.sakura.ne.jp/cgi-bin/upload.cgi?dir=&page=Main&sort=filename；上传者E，2023-10-16，19751 bytes。'};
 await fs.writeFile(dir+'score.json',JSON.stringify(score,null,2)+'\n');
 await fs.writeFile(dir+'source-audit.json',JSON.stringify(audit,null,2)+'\n');
 await fs.writeFile(dir+'source-notes.txt',[c.title,c.url,c.download,score.provenance.description,score.quality.notes,...score.quality.uncertainSpans.map(x=>`${x.startTicks}–${x.endTicks} ticks: ${x.reason}`),'程序对比通过；实际试听未进行。','原始MIDI、来源网页、source-audit.json与score.json一并归档。','生成脚本：music-library/inbox/import-long-versions.mjs。历史修订不得覆盖。'].join('\n\n')+'\n');
 console.log(JSON.stringify({id:c.id,notes:all.length,melody:melody.length,accompaniment:perf.accompaniment.length,duration:perf.duration,rolls:reviewedArpeggios.length,webShortened:web.shortened.length,repeats}));
}
