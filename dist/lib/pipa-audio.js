import {Piano} from './audio.js';

// Original, additive plucked-string prototype. This is synthesis, not recorded pipa samples.
export function pluckedSample(midi,sampleRate=22050){
  const frequency=440*2**((midi-69)/12),length=Math.ceil(sampleRate*2.4),data=new Float32Array(length);
  const harmonics=Math.min(28,Math.floor(sampleRate*.44/frequency));
  for(let h=1;h<=harmonics;h++){
    const f=frequency*h,weight=(h===1?1:.58/h**1.15)*(1+.22*Math.exp(-(((frequency*h-1500)/900)**2))),decay=.85/(1+(h-1)*.32);
    const step=2*Math.PI*f/sampleRate,fade=Math.exp(-1/(sampleRate*decay));
    let sine=0,cosine=1,amplitude=weight;const ss=Math.sin(step),cc=Math.cos(step);
    for(let i=0;i<length;i++){data[i]+=sine*amplitude;const next=sine*cc+cosine*ss;cosine=cosine*cc-sine*ss;sine=next;amplitude*=fade;}
  }
  let seed=midi*971,peak=0;
  for(let i=0;i<length;i++){
    const t=i/sampleRate;seed=(seed*1664525+1013904223)>>>0;
    const attack=Math.min(1,t/.0018),noise=(seed/4294967296*2-1)*.018*Math.exp(-t*220);
    data[i]=(data[i]+noise)*attack*Math.min(1,(length-i)/(sampleRate*.05));peak=Math.max(peak,Math.abs(data[i]));
  }
  for(let i=0;i<length;i++)data[i]=data[i]/Math.max(peak,1)*.78;
  return data;
}
export class PipaAudio extends Piano {
  async load(onProgress=()=>{}){
    // Build a small multi-sample bank between animation frames; no work in the audio callback.
    // Exact semitone samples avoid shifting the transient/formant between adjacent notes.
    const pitches=Array.from({length:55},(_,i)=>36+i);
    for(let i=0;i<pitches.length;i++){
      const samples=pluckedSample(pitches[i]),buffer=this.context.createBuffer(1,samples.length,22050);
      buffer.copyToChannel(samples,0);this.buffers.set(pitches[i],buffer);onProgress((i+1)/pitches.length);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    this.ready=true;
  }
  note(midi,duration=.4,velocity=.75,delay=0,options={}){
    if(!this.ready)return null;
    this.channels??=new Map();this.history??=[];
    const c=this.context,at=c.currentTime+Math.max(0,delay),key=options.voiceKey||('score:'+midi);
    // Re-strikes damp only this player's string; the other hand has its own voice.
    this.releaseVoice(this.channels.get(key),at,.012);
    const sounding=[...this.voices].filter(v=>v.end>c.currentTime&&(v.releaseAt??Infinity)>c.currentTime);
    if(sounding.length>=this.maxVoices)this.releaseVoice(sounding[0],c.currentTime,.015);
    const nearest=[...this.buffers.keys()].reduce((a,b)=>Math.abs(a-midi)<=Math.abs(b-midi)?a:b);
    const source=c.createBufferSource(),gain=c.createGain();source.buffer=this.buffers.get(nearest);source.playbackRate.value=2**((midi-nearest)/12);
    const held=Math.max(.06,Math.min(duration,6)),level=Math.max(.015,velocity**1.5)*.63,tail=options.tail??.09;
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+.003);gain.gain.setValueAtTime(level,at+held);gain.gain.linearRampToValueAtTime(0,at+held+tail);
    source.connect(gain);gain.connect(this.master);source.start(at);source.stop(at+held+tail+.01);
    const voice={source,gain,midi,at,level,end:at+held+tail+.01,releaseAt:Infinity};this.voices.add(voice);this.channels.set(key,voice);this.attacks++;
    this.history.push({midi,at,level,key});if(this.history.length>24)this.history.shift();
    source.onended=()=>{this.voices.delete(voice);if(this.channels.get(key)===voice)this.channels.delete(key);source.disconnect();gain.disconnect();};return voice;
  }
  playFree(midi,velocity=.8,delay=0,voiceKey){return this.note(midi,1.5,velocity,delay,{tail:.15,voiceKey});}
}
