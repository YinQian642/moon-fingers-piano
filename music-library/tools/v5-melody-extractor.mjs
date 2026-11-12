// Copied from v5 a22d8816fd7b017a05acefc00a6da9cbe8605dd6 for legacy extraction compatibility only.
export const KEYS = [
  {name:'哆',en:'Do',midi:60,hand:'左手',finger:'小指',key:'A'},
  {name:'来',en:'Re',midi:62,hand:'左手',finger:'无名指',key:'S'},
  {name:'咪',en:'Mi',midi:64,hand:'左手',finger:'中指',key:'D'},
  {name:'发',en:'Fa',midi:65,hand:'左手',finger:'食指',key:'F'},
  {name:'嗦',en:'Sol',midi:67,hand:'右手',finger:'食指',key:'J'},
  {name:'啦',en:'La',midi:69,hand:'右手',finger:'中指',key:'K'},
  {name:'西',en:'Si',midi:71,hand:'右手',finger:'无名指',key:'L'},
  {name:'哆',en:'Do',midi:72,hand:'右手',finger:'小指',key:';'},
];
const ROOTS={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11,Cb:11};
export function pitchName(midi,flats=true){return (flats?['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B']:['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'])[midi%12]+(Math.floor(midi/12)-1);}
export function fingerFor(midi,key='Db',scale='major'){
  const tonic=ROOTS[key]??0, relative=(midi-tonic+120)%12;
  const degrees=scale==='minor'?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
  let degree=0,best=99;
  degrees.forEach((v,i)=>{const d=Math.min(Math.abs(relative-v),12-Math.abs(relative-v));if(d<best){best=d;degree=i;}});
  return degree===0 && midi>=72+tonic?7:degree;
}
export function buildSong(midi,{title='导入的乐曲',trackIndex=0,builtin=false}={}){
  const tracks=midi.tracks.map((t,i)=>({index:i,name:t.name||`音轨 ${i+1}`,count:t.notes.length})).filter(t=>t.count);
  if(!tracks.length)throw Error('MIDI 中没有可演奏的音符。');
  if(!tracks.some(t=>t.index===trackIndex))trackIndex=tracks[0].index;
  const notes=midi.tracks.flatMap((t,ti)=>t.notes.map((n,ni)=>({id:`${ti}:${ni}`,track:ti,midi:n.midi,time:n.time,duration:n.duration,velocity:n.velocity,ticks:n.ticks}))).sort((a,b)=>a.time-b.time||b.midi-a.midi);
  if(notes.length>60000 || midi.duration>3600)throw Error('请导入不超过 1 小时、60,000 个音符的 MIDI。');
  const signatures=midi.header.keySignatures.slice().sort((a,b)=>a.ticks-b.ticks);
  function signature(n){return signatures.filter(k=>k.ticks<=n.ticks).at(-1)||{key:'C',scale:'major'};}
  const groups=new Map();
  for(const n of notes.filter(n=>n.track===trackIndex)) {const group=groups.get(n.ticks)||[];group.push(n);groups.set(n.ticks,group);}
  const selected=[];let last=null;
  for(const group of groups.values()){
    const n=group.reduce((a,b)=>a.midi>b.midi?a:b);
    // Keep the upper voice while lower arpeggios sound beneath a held melody.
    if(last && n.time<last.time+last.duration-.06 && n.midi<last.midi)continue;
    selected.push(n);last=n;
  }
  // The opening melody begins in the lower staff before crossing to the upper.
  if(builtin){const first=notes.filter(n=>n.time<selected[0].time);if(first.length)selected.unshift(first.reduce((a,b)=>a.midi>b.midi?a:b));}
  const cues=selected.map(n=>{const sig=signature(n);return {...n,slot:fingerFor(n.midi,sig.key,sig.scale),pitch:pitchName(n.midi,sig.key.includes('b')),tonic:sig.key,scale:sig.scale};});
  const ids=new Set(cues.map(c=>c.id));
  const bpm=midi.header.tempos[0]?.bpm||120;
  return {title,notes,cues,accompaniment:notes.filter(n=>!ids.has(n.id)),duration:midi.duration,tracks,trackIndex,builtin,key:signatures[0]?.key||'C',bpm};
}

