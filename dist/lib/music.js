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

// Guided mode gates a musical clock; dream mode ties melody onsets directly to taps.
export class Transport {
  constructor(audio,onChange=()=>{}){this.audio=audio;this.onChange=onChange;this.speed=.85;this.mode='guided';this.dreamAccompaniment=false;this.reset();}
  load(song){this.song=song;this.reset();}
  reset(){this.audio.stopAll();this.index=0;this.position=0;this.state='ready';this.hits=0;this.misses=0;this.dreamPlan=[];this.lastTap=null;this.lastCueTime=null;this.dreamRate=1;this.lastMelody=null;this.dreamVoices=new Set();this.scheduled=new Set();this.onChange();}
  get cue(){return this.song?.cues[this.index];}
  start(){if(!this.song)return;if(this.state==='ended')this.reset();if(this.state==='waiting')return;if(this.mode==='dream'){if(this.state==='paused')for(const n of this.dreamPlan)n.at=this.audio.now()+n.remaining;this.state='waiting';this.onChange();return;}this.run();}
  run(){this.state='playing';this.anchorScore=this.position;this.anchorTime=this.audio.now();this.scheduled.clear();this.schedule();this.onChange();}
  schedule(){
    const boundary=this.cue?.time??this.song.duration;
    // Short lookahead avoids queuing a whole imported song when no melody remains.
    const horizon=Math.min(boundary,this.position+.18*this.speed);
    for(const n of this.song.accompaniment){
      if(n.time>=horizon-1e-6)break;
      if(n.time<this.anchorScore-1e-6 || this.scheduled.has(n.id))continue;
      this.scheduled.add(n.id);
      this.audio.note(n.midi,n.duration/this.speed,n.velocity*.78,Math.max(0,(n.time-this.anchorScore)/this.speed+this.anchorTime-this.audio.now()));
    }
  }
  tick(){
    if(this.mode==='dream'){
      if(this.state!=='waiting')return;
      while(this.dreamPlan.length&&this.dreamPlan[0].at<=this.audio.now()){const {note,rate}=this.dreamPlan.shift();this.playDreamAccompaniment(note,rate);}
      if(!this.cue&&!this.dreamPlan.length){this.state='ended';this.onChange();}return;
    }
    if(this.state!=='playing')return;
    const boundary=this.cue?.time??this.song.duration;
    this.position=Math.min(boundary,this.anchorScore+(this.audio.now()-this.anchorTime)*this.speed);
    if(this.position>=boundary-1e-5){this.position=boundary;this.schedule();this.state=this.cue?'waiting':'ended';this.onChange();}
    else this.schedule();
  }
  hit(slot,options={}){
    if(this.mode==='dream')return this.dreamHit(slot,options);
    this.tick();
    if(this.state!=='waiting'||!this.cue)return {accepted:false,reason:'timing'};
    const cue=this.cue;
    // Both Do fingers mean the same pitch class; the score owns the octave.
    const correct=this.mode==='dream'||slot===cue.slot||([0,7].includes(slot)&&[0,7].includes(cue.slot));
    if(!correct){this.misses++;this.onChange();return {accepted:false,reason:'pitch'};}
    this.audio.note(cue.midi,cue.duration/this.speed,cue.velocity*(options.velocityScale??1),options.delay??0,{voiceKey:options.voiceKey});
    this.hits++;this.index++;this.run();return {accepted:true,cue};
  }
  dreamHit(slot,options={}){
    if(this.state==='ready')this.start();
    if(this.state!=='waiting'||!this.cue)return {accepted:false,reason:'timing'};
    const cue=this.cue,now=this.audio.now();
    // Play only accompaniment that is due now; never dump overdue/future arpeggios.
    this.tick();
    if(this.lastTap!==null&&now-this.lastTap>.025)this.audio.releaseVoice?.(this.lastMelody,now,.04);
    this.dreamPlan=[];
    if(this.lastTap!==null&&now-this.lastTap>.045){const span=cue.time-this.lastCueTime;if(span>0)this.dreamRate=Math.min(3,Math.max(.15,(now-this.lastTap)/span));}
    const rate=this.dreamRate,next=this.song.cues[this.index+1]?.time??this.song.duration,from=this.index===0?0:cue.time;
    this.lastMelody=this.audio.note(cue.midi,Math.max(.1,cue.duration*rate),cue.velocity*(options.velocityScale??1),options.delay??0,{voiceKey:options.voiceKey});
    if(this.dreamAccompaniment)for(const note of this.song.accompaniment){if(note.time<from-1e-6)continue;if(note.time>=next-1e-6)break;const delay=Math.max(0,(note.time-cue.time)*rate);if(delay<.008)this.playDreamAccompaniment(note,rate);else this.dreamPlan.push({note,rate,at:now+delay});}
    this.lastTap=now;this.lastCueTime=cue.time;this.position=cue.time;this.hits++;this.index++;this.onChange();return {accepted:true,cue,slot};
  }
  pause(){this.tick();if(['playing','waiting'].includes(this.state)){for(const n of this.dreamPlan)n.remaining=Math.max(0,n.at-this.audio.now());this.lastTap=null;this.state='paused';this.audio.stopAll();this.onChange();}}
  seek(index){this.audio.stopAll();this.dreamPlan=[];this.lastTap=null;this.lastCueTime=null;this.dreamRate=1;this.index=Math.max(0,Math.min(index,this.song.cues.length-1));this.position=this.cue?.time||0;this.state='paused';this.onChange();}
  setSpeed(speed){const active=this.state==='playing';if(active)this.pause();this.speed=speed;if(active)this.run();this.onChange();}
  playDreamAccompaniment(note,rate){const voice=this.audio.note(note.midi,note.duration*rate,note.velocity*.78);if(voice&&typeof voice==='object'){this.dreamVoices??=new Set();for(const old of this.dreamVoices)if(old.end<=this.audio.now())this.dreamVoices.delete(old);this.dreamVoices.add(voice);}}
  setDreamAccompaniment(enabled){this.dreamAccompaniment=!!enabled;if(!enabled){this.dreamPlan=[];for(const voice of this.dreamVoices||[])this.audio.releaseVoice?.(voice,this.audio.now(),.08);this.dreamVoices?.clear();}this.onChange();}
}
