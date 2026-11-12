import test from 'node:test';
import assert from 'node:assert/strict';
import {PinchDetector,DreamStrokeGate,HandAssociator} from '../dist/lib/gestures.js';
import {Transport} from '../dist/lib/music.js';

function hand(gap=1,z=0){
  const p=Array.from({length:21},()=>({x:0,y:0,z:0}));
  p[9]={x:0,y:1,z:0};p[5]={x:-.5,y:.5,z:0};p[17]={x:.5,y:.5,z:0};
  for(const tip of [8,12,16,20])p[tip]={x:tip===8?gap:1,y:0,z:tip===8?z:0};
  return p;
}
function arm(p,side='Left'){p.update(hand(),side,0,hand());p.update(hand(),side,16,hand());}
test('2D overlap with corroborated depth separation does not trigger either hand',()=>{
  for(const side of ['Left','Right']){const p=new PinchDetector();arm(p,side);
    for(let i=0;i<30;i++)assert.deepEqual(p.update(hand(.02,.5),side,40+i*16,hand(.02,.5)).hits,[]);
    assert.deepEqual(p.update(hand(.1),side,550,hand(.1,.03)).hits,[side==='Left'?3:4]);
  }
});
test('one exaggerated depth estimate cannot veto an otherwise observed contact',()=>{
  for(const [image,world] of [[hand(.28),hand(.28,.6)],[hand(.28,.6),hand(.28)]]){const p=new PinchDetector();arm(p);assert.deepEqual(p.update(image,'Left',40,world).hits,[3]);}
});
test('fallback still rejects very large depth gaps without world coordinates',()=>{
  const p=new PinchDetector();arm(p);assert.deepEqual(p.update(hand(.01,.8),'Left',40).hits,[]);
});
test('well separated fingertips and pinkies are rejected even at max sensitivity',()=>{
  const p=new PinchDetector();p.threshold=.46;arm(p);const near=hand(.6);near[20]={x:.7,y:0,z:0};
  for(let i=0;i<100;i++)assert.deepEqual(p.update(near,'Left',40+i*16,near).hits,[]);
});
test('3D contact is invariant to hand size and camera angle',()=>{
  for(const side of ['Left','Right'])for(const angle of [0,.4,1.2])for(const size of [.04,.1,.2]){
    const transform=points=>points.map(p=>({x:(p.x*Math.cos(angle)+p.z*Math.sin(angle))*size,y:p.y*size,z:(p.z*Math.cos(angle)-p.x*Math.sin(angle))*size}));
    const p=new PinchDetector();const open=transform(hand()),closed=transform(hand(.1,.03));
    p.update(open,side,0,open);p.update(open,side,16,open);
    assert.equal(p.update(closed,side,32,closed).hits.length,1);
  }
});
test('depth jitter while visible fingertips stay together cannot rearm contact',()=>{
  const p=new PinchDetector();arm(p);assert.equal(p.update(hand(.28),'Left',32,hand(.28,.5)).hits.length,1);
  for(let i=0;i<40;i++)assert.deepEqual(p.update(hand(.28),'Left',48+i*16,hand(.28,[.2,.5,.8][i%3])).hits,[]);
  assert.deepEqual(p.update(hand(.44),'Left',800,hand(.44)).releases,[3]);
  assert.deepEqual(p.update(hand(.28),'Left',832,hand(.28,.5)).hits,[3]);
});
test('dream coalesces simultaneous and neighboring-frame contacts without delaying input',()=>{
  const g=new DreamStrokeGate();assert.equal(g.take([0,1,2,3,4,5,6,7],0).id,1);
  assert.equal(g.take([3],0),null);assert.equal(g.take([3],-1),null);
  g.reset();assert.equal(g.take([3],0).id,1);assert.equal(g.take([4],16),null);
  assert.equal(g.take([3],50).id,2);assert.equal(g.take([4],66),null);
  assert.equal(g.take([4],100).id,3);
});
test('a run of identical pitches needs one new stroke for every score occurrence',()=>{
  let now=0;const notes=[];const t=new Transport({now:()=>now,note:m=>notes.push(m),stopAll(){}});
  t.load({cues:Array.from({length:16},(_,i)=>({id:String(i),time:i*.25,midi:68,duration:.2,velocity:.8,slot:4})),accompaniment:[],duration:4});
  t.mode='dream';t.start();const p=new PinchDetector(),g=new DreamStrokeGate();arm(p);
  function frame(r,time){const stroke=g.take(p.update(hand(r),'Left',time).hits,time);now=time/1000;if(stroke)t.hit(stroke.slot);t.tick();}
  frame(.1,40);assert.equal(t.index,1);
  for(let i=0;i<100;i++)frame([.1,.19,.23,.14][i%4],56+i*16);
  assert.equal(t.index,1);assert.equal(notes.length,1);
  for(let i=1;i<16;i++){frame(.5,1700+i*50);frame(.1,1725+i*50);assert.equal(t.index,i+1);}
  assert.deepEqual(notes,Array(16).fill(68));
});
test('dream starts melody-only; switching accompaniment off cancels future and active backing',()=>{
  let now=0;const played=[],released=[];const t=new Transport({now:()=>now,stopAll(){},note(midi){const v={midi,end:100};played.push(v);return v;},releaseVoice:v=>released.push(v)});
  t.load({cues:[{time:0,midi:72,duration:1,velocity:.8,slot:0},{time:1,midi:74,duration:1,velocity:.8,slot:1}],accompaniment:[{time:0,midi:48,duration:1,velocity:.6},{time:.5,midi:52,duration:.4,velocity:.6}],duration:2});t.mode='dream';
  t.hit(0);assert.deepEqual(played.map(v=>v.midi),[72]);now=.6;t.tick();assert.equal(played.length,1);
  t.reset();t.setDreamAccompaniment(true);t.hit(0);assert.deepEqual(played.slice(1).map(v=>v.midi),[72,48]);
  t.setDreamAccompaniment(false);assert.deepEqual(released.map(v=>v.midi),[48]);now=10;t.tick();assert.equal(played.some(v=>v.midi===52),false);assert.equal(t.index,1);
});
const detection=(x,label,score=.98)=>({points:hand().map(p=>({...p,x:x+p.x*.1,y:.5+p.y*.1})),label:{categoryName:label,score}});
const result=items=>({landmarks:items.map(d=>d.points),handedness:items.map(d=>[d.label])});
test('sustained open-hand evidence repairs a wrong initial label, a single frame cannot',()=>{
  const a=new HandAssociator();assert.equal(a.assign(result([detection(.7,'Right')]),0)[0].hand,'Right');
  assert.equal(a.assign(result([detection(.7,'Left')]),16)[0].hand,'Right');
  let out;for(let time=32;time<=128;time+=16)out=a.assign(result([detection(.7,'Left')]),time);
  assert.equal(out[0].hand,'Left');
});
test('motion prediction retains hand identity across crossing and reversed output order',()=>{
  const a=new HandAssociator();
  for(let i=0;i<7;i++){
    const l=detection(.8-i*.1,i<2?'Left':'Right',i<2?.98:.52),r=detection(.2+i*.1,i<2?'Right':'Left',i<2?.98:.52);
    // Slightly different palm paths remain observable even at the same x position.
    l.points.forEach(p=>p.y+=.02);r.points.forEach(p=>p.y-=.02);
    const records=i%2?[r,l]:[l,r];const out=a.assign(result(records),i*33);
    assert.deepEqual(out.map(d=>d.hand),i%2?['Right','Left']:['Left','Right']);
  }
});
