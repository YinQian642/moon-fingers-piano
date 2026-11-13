import test from 'node:test';
import assert from 'node:assert/strict';
import {PipaPluckDetector,STRINGS,demoHand,handFrame} from '../dist/lib/pipa-gestures.js';
import {pluckedSample} from '../dist/lib/pipa-audio.js';
const hand=demoHand(),point=x=>({x,y:.5});

test('pipa has four distinct playable strings with open-string tuning',()=>{
  assert.deepEqual(STRINGS.map(s=>s.midi),[57,52,50,45]);assert(handFrame(hand,4/3));
});
test('a fast sweep crossing all four strings between frames retains their order',()=>{
  const detector=new PipaPluckDetector();assert.deepEqual(detector.update(hand,point(.05),0,4/3),[]);
  const forward=detector.update(hand,point(.95),20,4/3),reverse=detector.update(hand,point(.05),40,4/3);
  assert.deepEqual(forward.map(e=>e.string),[0,1,2,3]);assert.deepEqual(reverse.map(e=>e.string),[3,2,1,0]);
  assert.equal(new Set(forward.map(e=>e.stroke)).size,1);assert.notEqual(forward[0].stroke,reverse[0].stroke);
});
test('20 rapid reversals do not require a long cooldown',()=>{
  const d=new PipaPluckDetector();d.update(hand,point(.28),0,4/3);
  for(let i=1;i<=20;i++){const hits=d.update(hand,point(i%2?.35:.28),i*35,4/3);assert.equal(hits.length,1);assert.equal(hits[0].string,0);}
});
test('a sweep spanning several frames retains one stroke id for following music',()=>{
  const d=new PipaPluckDetector();const all=[];[.05,.3,.4,.52,.8].forEach((x,i)=>all.push(...d.update(hand,point(x),i*25,4/3)));
  assert.equal(all.length,4);assert.equal(new Set(all.map(e=>e.stroke)).size,1);
});
test('holding on a string and small image jitter never stream notes',()=>{
  const d=new PipaPluckDetector(),x=.23+(.43-.23)*(.77-.5)/(.77-.21);
  for(let i=0;i<100;i++)assert.deepEqual(d.update(hand,point(x+(i%2?.003:-.003)),i*16,4/3),[]);
});
test('left-hand translation across a stationary right finger is silent',()=>{
  const d=new PipaPluckDetector();for(let i=0;i<20;i++){const moved=hand.map(p=>({...p,x:p.x-i*.01}));assert.deepEqual(d.update(moved,point(.44),i*16,4/3),[]);}
});
test('both hands moving together is silent',()=>{
  const d=new PipaPluckDetector();for(let i=0;i<20;i++){const offset=i*.01;assert.deepEqual(d.update(hand.map(p=>({...p,x:p.x+offset})),point(.05+offset),i*16,4/3),[]);}
});
test('tracking loss, stale frames and a teleported pointer cannot invent a sweep',()=>{
  const d=new PipaPluckDetector();d.update(hand,point(.05),0,4/3);d.update(null,null,16,4/3);
  assert.deepEqual(d.update(hand,point(.95),32,4/3),[]);assert.deepEqual(d.update(hand,point(.05),500,4/3),[]);
  assert.deepEqual(d.update(hand,point(3),516,4/3),[]);
});
test('folded hands disable crossing, without bridging across reappearance',()=>{
  const d=new PipaPluckDetector(),folded=hand.map(p=>({...p}));[8,12,16,20].forEach(i=>folded[i]={...folded[4]});
  assert.equal(handFrame(folded,4/3),null);d.update(hand,point(.05),0,4/3);assert.deepEqual(d.update(folded,point(.5),16,4/3),[]);assert.deepEqual(d.update(hand,point(.95),32,4/3),[]);
});
test('plucked synthesis is bounded, decays naturally and retains A3 pitch',()=>{
  const samples=pluckedSample(57),rms=(a,b)=>Math.sqrt(samples.slice(a,b).reduce((s,v)=>s+v*v,0)/(b-a));
  assert(samples.every(Number.isFinite));assert(Math.max(...samples.map(Math.abs))<=.781);assert(rms(33000,40000)<rms(2000,9000)*.3);
  let best=0,frequency=0;
  for(let f=215;f<=225;f+=.5){let re=0,im=0;for(let i=1500;i<12000;i++){const angle=2*Math.PI*f*i/22050;re+=samples[i]*Math.cos(angle);im+=samples[i]*Math.sin(angle);}const power=re*re+im*im;if(power>best){best=power;frequency=f;}}
  assert(Math.abs(frequency-220)<=1);
});
