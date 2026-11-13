import {Piano} from './audio.js';

// Original, additive plucked-string prototype. This is synthesis, not recorded pipa samples.
export function pluckedSample(midi,sampleRate=22050){
  const frequency=440*2**((midi-69)/12),length=Math.ceil(sampleRate*2.4),data=new Float32Array(length);
  const harmonics=Math.min(28,Math.floor(sampleRate*.44/frequency));
  for(let h=1;h<=harmonics;h++){
    const f=frequency*h*Math.sqrt(1+.000018*h*h),weight=Math.sin(h*.19*Math.PI)/(h**1.1),decay=1.1/(1+h*.22);
    const step=2*Math.PI*f/sampleRate,fade=Math.exp(-1/(sampleRate*decay));
    let sine=0,cosine=1,amplitude=weight;const ss=Math.sin(step),cc=Math.cos(step);
    for(let i=0;i<length;i++){data[i]+=sine*amplitude;const next=sine*cc+cosine*ss;cosine=cosine*cc-sine*ss;sine=next;amplitude*=fade;}
  }
  let seed=midi*971,peak=0;
  for(let i=0;i<length;i++){
    const t=i/sampleRate;seed=(seed*1664525+1013904223)>>>0;
    const attack=Math.min(1,t/.0018),noise=(seed/4294967296*2-1)*.06*Math.exp(-t*160);
    const body=.07*Math.sin(2*Math.PI*480*t)*Math.exp(-t*28)+.04*Math.sin(2*Math.PI*980*t)*Math.exp(-t*45);
    data[i]=(data[i]+noise+body)*attack*Math.min(1,(length-i)/(sampleRate*.05));peak=Math.max(peak,Math.abs(data[i]));
  }
  for(let i=0;i<length;i++)data[i]=data[i]/Math.max(peak,1)*.78;
  return data;
}
export class PipaAudio extends Piano {
  async load(onProgress=()=>{}){
    // Build a small multi-sample bank between animation frames; no work in the audio callback.
    const pitches=Array.from({length:19},(_,i)=>36+i*3);
    for(let i=0;i<pitches.length;i++){
      const samples=pluckedSample(pitches[i]),buffer=this.context.createBuffer(1,samples.length,22050);
      buffer.copyToChannel(samples,0);this.buffers.set(pitches[i],buffer);onProgress((i+1)/pitches.length);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    this.ready=true;
  }
  playFree(midi,velocity=.8){return this.note(midi,1.5,velocity,0,{tail:.15});}
}
