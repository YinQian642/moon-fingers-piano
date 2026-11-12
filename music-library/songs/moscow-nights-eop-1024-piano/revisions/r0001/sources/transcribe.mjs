import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {validateScore} from '../../tools/archive.mjs';

// Manually read from both archived EOP 1024 PNGs. No remembered melody or OMR.
// Unit = sixteenth note = 120 ticks. A measure contains 8 units (2/4).
// Format: pitch/duration; ~ marks a tie into the following written measure.
// Brackets are simultaneous chords; @ means the source has an arpeggio sign.
export const measures = [
  {bar:1,  rh:'A4/2 C5/2 E5/2 C5/2',       lh:'A2/1 E3/1 A3/1 C4/1 E4/2 A3/2'},
  {bar:2,  rh:'D5/4 C5/2 B4/2',             lh:'D3/1 A3/1 D4/1 F4/1 A4/2 D4/2'},
  {bar:3,  rh:'E5/4 D5/4',                  lh:'E2/1 B2/1 E3/1 G#3/1 B3/2 E3/2'},
  {bar:4,  rh:'A4/8',                       lh:'A2/1 E3/1 A3/1 C4/1 E4/2 A3/2'},
  {bar:5,  rh:'C5/2 E5/2 G5/2 G5/2',       lh:'C3/1 G3/1 C4/1 E4/1 G4/2 C4/2'},
  {bar:6,  rh:'A5/4 G5/2 F5/2',             lh:'D3/1 A3/1 D4/1 F4/1 A4/2 D4/2'},
  {bar:7,  rh:'E5/8',                       lh:'A2/1 E3/1 A3/1 C4/1 E4/2 A3/2'},
  {bar:8,  rh:'F#5/4 G#5/4',                lh:'D2/1 A2/1 D3/1 F#3/1 E2/1 B2/1 E3/1 G#3/1'},
  {bar:9,  rh:'B5/2 A5/2 E5/4~',            lh:'A2/1 E3/1 A3/1 C4/1 E4/2 A3/2'},
  {bar:10, rh:'E5/2 B4/4 A4/2',             lh:'[A3,C4,E4]/8'},
  {bar:11, rh:'E5/2 D5/2 F5/4',             lh:'D2/1 A2/1 D3/1 F3/1 A3/2 D3/2'},
  {bar:12, rh:'E5/4 G5/2 F5/2',             lh:'[D3,F3,A3]@/4 R/4'},
  {bar:13, rh:'E5/4 D5/2 C5/2',             lh:'E2/1 B2/1 E3/1 G#3/1 B3/2 E3/2'},
  {bar:14, rh:'E5/4 D5/4',                  lh:'A2/1 E3/1 A3/1 C4/1 E4/2 A3/2'},
  {bar:15, rh:'A4/8',                       lh:'A2/1 E3/1 A3/1 C4/1 E4/2 C4/2'},
  {bar:16, rh:'A4/8',                       lh:'A2/1 E3/1 A3/1 C4/1 E4/2 C4/2'},
  {bar:17, rh:'A5/8',                       lh:'A2/1 E3/1 A3/1 C4/1 E4/2 C4/2'},
  {bar:18, rh:'[C5,E5,A5]@/8',              lh:'[A2,E3,A3]/8'},
];

// Repeat starts at printed bar 8; first ending covers bars 15–16.
// The source does not print a second-ending label. This explicit reading is
// documented as provisional: 1–16, 8–14, 17–18. No invented extra verses.
const order = [...Array.from({length:16},(_,i)=>i+1),8,9,10,11,12,13,14,17,18];
const ppq=480, measureTicks=960, rollStepTicks=30;
const out=fileURLToPath(new URL('./',import.meta.url));
const tracks=[
  {id:'piano-rh',name:'Piano RH (melody and final chord)',channel:0,program:0,notes:[]},
  {id:'piano-lh',name:'Piano LH (accompaniment)',channel:1,program:0,notes:[]},
];
const melodyNoteIds=[], mapping=[], eventMap=[], pendingTies=[null,null], tieMerges=[];
function pitchMidi(pitch){
  const match=/^([A-G])(#?)([0-8])$/.exec(pitch);
  assert.ok(match,`Invalid pitch ${pitch}`);
  return 12*(Number(match[3])+1)+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[match[1]]+(match[2]?1:0);
}
for(const [position,sourceBar] of order.entries()){
  const startTicks=position*measureTicks, measure=measures[sourceBar-1];
  mapping.push({playbackBar:position+1,sourceBar,startTicks,endTicks:startTicks+measureTicks});
  for(const [trackIndex,hand] of ['rh','lh'].entries()){
    let offset=0, symbolIndex=0;
    for(const token of measure[hand].split(' ')){
      symbolIndex++;
      const match=/^(R|[A-G]#?[0-8]|\[[A-G#0-8,]+\])(@?)\/(\d+)(~?)$/.exec(token);
      assert.ok(match,`Cannot parse ${token}`);
      const [,pitchPart,roll,durationPart,tieOut]=match, durationTicks=Number(durationPart)*120;
      const baseTicks=startTicks+offset;
      if(pitchPart==='R'){
        assert.equal(pendingTies[trackIndex],null,'Rest interrupts a tie');
        eventMap.push({playbackBar:position+1,sourceBar,hand,symbolIndex,token,ticks:baseTicks,durationTicks,kind:'rest'});
      }else{
        const pitches=pitchPart.replace(/[\[\]]/g,'').split(',');
        const top=Math.max(...pitches.map(pitchMidi));
        for(const [chordIndex,pitch] of pitches.entries()){
          const midi=pitchMidi(pitch), delay=roll?rollStepTicks*chordIndex:0;
          const ticks=baseTicks+delay, noteDuration=durationTicks-delay;
          const prior=pendingTies[trackIndex];
          if(prior){
            assert.equal(pitches.length,1,'Unsupported chord tie');
            assert.equal(prior.midi,midi,'Tie pitch mismatch');
            assert.equal(prior.ticks+prior.durationTicks,ticks,'Noncontiguous tie');
            prior.durationTicks+=noteDuration;
            pendingTies[trackIndex]=tieOut?prior:null;
            tieMerges.push({noteId:prior.id,playbackBar:position+1,sourceBar,ticks,durationTicks:noteDuration});
            eventMap.push({playbackBar:position+1,sourceBar,hand,symbolIndex,token,kind:'tie-continuation',noteId:prior.id,ticks,durationTicks:noteDuration});
            continue;
          }
          const isMelody=trackIndex===0&&midi===top;
          const id=`p${String(position+1).padStart(2,'0')}-s${String(sourceBar).padStart(2,'0')}-${hand}-${symbolIndex}-${chordIndex+1}`;
          const note={id,midi,ticks,durationTicks:noteDuration,velocity:(isMelody?96:70)/127};
          tracks[trackIndex].notes.push(note);
          if(isMelody)melodyNoteIds.push(id);
          if(tieOut)pendingTies[trackIndex]=note;
          eventMap.push({playbackBar:position+1,sourceBar,hand,symbolIndex,token,kind:isMelody?'melody':'accompaniment',noteId:id,pitch,ticks,durationTicks:noteDuration,editorialRollDelayTicks:delay});
        }
      }
      offset+=durationTicks;
    }
    assert.equal(offset,measureTicks,`Written bar ${sourceBar} ${hand} is not 2/4`);
  }
}
assert.deepEqual(pendingTies,[null,null]);
const uncertainSpans=[
  {startTicks:0,endTicks:24000,reason:'用户只给曲名，尚未确认是否要采用 EOP 1024、谱面署名“生如夏花”的这一钢琴编配。已对照两份谱图转录；未取得可读取的该版 MIDI/音频，未实际试听。谱面无力度/踏板数据；旋律96/127、伴奏70/127为编辑播放值。'},
  ...mapping.filter(m=>m.sourceBar===12||m.sourceBar===18).map(m=>({startTicks:m.startTicks,endTicks:m.endTicks,reason:`谱面第${m.sourceBar}小节（展开第${m.playbackBar}小节）有琶音记号，未规定各音起音时差。暂按从低到高每音30 ticks（39.0625 ms）展开，所有音在原标记时值终点结束；这是待试听确认的演奏处理。`})),
  {startTicks:14400,endTicks:24000,reason:'谱面第15–16小节标第一结尾，第8小节有反复起点，第16小节有反复终点，第17小节未标“2.”。暂按1–16、8–14、17–18展开；请确认第一结尾范围及第二次跳转，未补写额外反复。'},
];
const score={
  schemaVersion:1,id:'moscow-nights-eop-1024-piano',
  title:'莫斯科郊外的晚上 · EOP 1024 钢琴版',
  composer:'Vasily Solovyov-Sedoy（瓦西里·索洛维约夫-谢多伊）',
  provenance:{kind:'sheet-images',url:'https://www.everyonepiano.cn/Music-1024-Moscow-Nights.html',license:'unknown',description:'用户输入仅为“莫斯科郊外的晚上，钢琴版”。采用 Everyone Piano / 人人钢琴网编号0001024的一页钢琴编配，谱面署名“生如夏花”（署名角色未明），页面上传者EOP小编，页面标示更新2015-07-28。来源为已保存的完整五线谱PNG及双手简谱PNG，按图逐小节手工录入，没有使用其他编曲补音，也没有从音频扒谱。原始调号无升降号，A为主音，mode记minor（依据旋律与A小调终止和弦判断；简谱1=C是唱名基准，不代表C大调）。音高保持谱面绝对八度，无转调。原谱18个书写小节，依反复暂展开为25小节。网站预览说明仅供个人学习交流、非原版网友改编、不许商用或去水印转载；具体再利用授权未核实，license为unknown。'},
  quality:{status:'needs-review',notes:'视觉核对：五线谱与简谱的音高、升F/升G、时值、9→10小节延音、12小节左手四分休止及反复记号。延音合并为持续事件，重新起音和反复演奏均使用新id；最后和弦只取最高A5为主旋律，C5/E5留作伴奏。采用A小调、2/4、四分音符96，PPQ=480。谱面只有一个速度标记，没有另加渐慢、踏板或力度曲线。琶音时差与固定播放力度为显式编辑假设；反复的第二结尾未标数字。程序结构/往返检查与实际试听是独立项目；尚未实际试听，不能视为演奏版逐音认证。详见 sources/transcription-map.json、sources/program-verification.json 和 sources/source-notes.txt。',uncertainSpans},
  header:{ppq,tempos:[{ticks:0,bpm:96}],timeSignatures:[{ticks:0,numerator:2,denominator:4}],keySignatures:[{ticks:0,fifths:0,mode:'minor'}]},
  tracks,melodyNoteIds,
};
validateScore(score);
await fs.writeFile(out+'score.json',JSON.stringify(score,null,2)+'\n');
await fs.writeFile(out+'transcription-map.json',JSON.stringify({unit:'sixteenth note = 120 ticks',writtenMeasures:measures,playbackOrder:order,measureMap:mapping,tieMerges,eventMap,editorial:{rollStepTicks,melodyVelocity:96/127,accompanimentVelocity:70/127,actualListening:false}},null,2)+'\n');
console.log(JSON.stringify({notes:tracks.flatMap(t=>t.notes).length,melody:melodyNoteIds.length,accompaniment:tracks.flatMap(t=>t.notes).length-melodyNoteIds.length,playbackMeasures:order.length,durationSeconds:order.length*2*60/96,tieMerges:tieMerges.length},null,2));
