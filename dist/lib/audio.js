export class Piano {
  constructor(){this.buffers=new Map();this.voices=new Set();this.byPitch=new Map();this.volume=.7;this.ready=false;this.attacks=0;this.maxVoices=48;}
  now(){return this.context?.currentTime||0;}
  attach(context){
    this.context=context;this.master=context.createGain();this.master.gain.value=this.volume*.7;
    const compressor=context.createDynamicsCompressor();compressor.threshold.value=-12;compressor.ratio.value=3;compressor.attack.value=.003;compressor.release.value=.1;
    this.master.connect(compressor);compressor.connect(context.destination);
  }
  async init(onProgress=()=>{}){
    if(!this.context)this.attach(new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'}));
    await this.context.resume();if(this.ready)return;
    if(!this.loading)this.loading=this.load(onProgress).catch(e=>{this.loading=null;throw e;});await this.loading;
  }
  async load(onProgress=()=>{}){
    const samples=[];for(let oct=1;oct<=7;oct++)for(const [name,pc] of [['C',0],['Ds',3],['Fs',6],['A',9]])samples.push({name:name+oct,midi:(oct+1)*12+pc});
    let done=0;await Promise.all(samples.map(async s=>{if(!this.buffers.has(s.midi)){const res=await fetch(`./assets/piano/${s.name}.mp3`);if(!res.ok)throw Error('钢琴音色未能加载，请重试。');this.buffers.set(s.midi,await this.context.decodeAudioData(await res.arrayBuffer()));}onProgress(++done/samples.length);}));this.ready=true;
  }
  releaseVoice(voice,at=this.now(),duration=.055){
    if(!voice||voice.end<=at)return;
    if(voice.releaseAt<=at&&voice.end<=at+duration+.005)return;
    voice.releaseAt=at;voice.end=at+duration+.005;
    const gain=voice.gain.gain;
    if(voice.at>at){try{voice.source.stop(at);}catch{};this.voices.delete(voice);if(this.byPitch.get(voice.midi)===voice)this.byPitch.delete(voice.midi);return;}
    if(gain.cancelAndHoldAtTime)gain.cancelAndHoldAtTime(at);else{gain.cancelScheduledValues(at);gain.setValueAtTime(voice.level,at);}
    gain.linearRampToValueAtTime(0,at+duration);try{voice.source.stop(at+duration+.005);}catch{}
    // Keep the releasing string addressable so a rapid re-strike damps its tail.
  }
  release(midi){const voice=this.byPitch.get(midi);if(voice)this.releaseVoice(voice,Math.max(this.now(),voice.at+(voice.minHold||0)),voice.releaseDuration||.055);}
  playFree(midi){return this.note(midi,1.05,.8,0,{tail:.28,minHold:.36});}
  note(midi,duration=.4,velocity=.75,delay=0,options={}){
    if(!this.ready)return null;
    const c=this.context,at=c.currentTime+Math.max(0,delay),nearest=[...this.buffers.keys()].reduce((a,b)=>Math.abs(a-midi)<=Math.abs(b-midi)?a:b);
    // A real piano string is re-struck, rather than adding another full tail at the same pitch.
    this.releaseVoice(this.byPitch.get(midi),at,.012);
    const sounding=[...this.voices].filter(v=>v.at<=at&&v.end>at&&(v.releaseAt??Infinity)>at);
    if(sounding.length>=this.maxVoices)this.releaseVoice(sounding[0],at,.015);
    const source=c.createBufferSource(),gain=c.createGain();source.buffer=this.buffers.get(nearest);source.playbackRate.value=2**((midi-nearest)/12);
    const held=Math.max(.06,Math.min(duration,6)),level=Math.max(.015,velocity**1.5)*.63;
    const tail=options.tail??.09;
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+.003);gain.gain.setValueAtTime(level,at+held);gain.gain.linearRampToValueAtTime(0,at+held+tail);
    source.connect(gain);gain.connect(this.master);source.start(at);source.stop(at+held+tail+.01);
    const voice={source,gain,midi,at,level,end:at+held+tail+.01,releaseAt:Infinity,minHold:options.minHold||0,releaseDuration:tail};this.voices.add(voice);this.byPitch.set(midi,voice);this.attacks++;
    source.onended=()=>{this.voices.delete(voice);if(this.byPitch.get(midi)===voice)this.byPitch.delete(midi);source.disconnect();gain.disconnect();};return voice;
  }
  setVolume(value){this.volume=value;if(this.master)this.master.gain.setTargetAtTime(value*.7,this.now(),.02);}
  stopAll(){for(const voice of [...this.voices])this.releaseVoice(voice,this.now(),.025);}
}
