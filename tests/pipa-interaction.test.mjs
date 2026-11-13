import test from 'node:test';
import assert from 'node:assert/strict';
import {PipaPluckDetector,PipaHandStabilizer,handFrame,demoHand} from '../dist/lib/pipa-gestures.js';
import {pluckedSample} from '../dist/lib/pipa-audio.js';
const hand=demoHand(),aspect=4/3;
function finger(i,gap,u=.7,points=hand){
  const f=handFrame(points,aspect),{a,b}=f.strings[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
  return f.imagePoint({x:a.x+dx*u-dy/len*gap,y:a.y+dy*u+dx/len*gap});
}
for(let string=0;string<4;string++){
  test(`string ${string+1}: 20 small touch/retract plucks each emit once`,()=>{
    const d=new PipaPluckDetector();let t=0;d.update(hand,finger(string,.06),t,aspect);
    for(let i=0;i<20;i++){
      const hits=d.update(hand,finger(string,.008),t+=25,aspect);
      assert.deepEqual(hits.map(h=>h.string),[string]);
      assert.deepEqual(d.update(hand,finger(string,.06),t+=25,aspect),[]);
    }
  });
  test(`string ${string+1}: slow sub-threshold steps accumulate into one pluck`,()=>{
    const d=new PipaPluckDetector(),hits=[];
    for(let step=0;step<=60;step++)hits.push(...d.update(hand,finger(string,.06-step*.002),step*16,aspect));
    assert.deepEqual(hits.map(h=>h.string),[string]);
  });
  test(`string ${string+1}: the fingertip end of the string is playable`,()=>{
    const d=new PipaPluckDetector();d.update(hand,finger(string,.06,.98),0,aspect);
    assert.deepEqual(d.update(hand,finger(string,-.06,.98),25,aspect).map(h=>h.string),[string]);
  });
}
test('narrow middle-finger fan no longer invalidates all four strings',()=>{
  const close=structuredClone(hand);close[12]={x:.46,y:.21,z:0};
  assert(handFrame(close,aspect));
  const d=new PipaPluckDetector();d.update(close,{x:.05,y:.5},0,aspect);
  const forward=d.update(close,{x:.95,y:.5},32,aspect),back=d.update(close,{x:.05,y:.5},64,aspect);
  assert.deepEqual(forward.map(h=>h.string),[0,1,2,3]);assert.deepEqual(back.map(h=>h.string),[3,2,1,0]);
});
test('one folded finger does not disable other strings',()=>{
  const partial=structuredClone(hand);partial[12]={...partial[4]};
  const d=new PipaPluckDetector();d.update(partial,{x:.05,y:.5},0,aspect);
  assert.deepEqual(d.update(partial,{x:.95,y:.5},32,aspect).map(h=>h.string),[0,2,3]);
});
test('after one touch, holding and jitter cannot stream extra melody events',()=>{
  const d=new PipaPluckDetector();d.update(hand,finger(2,.06),0,aspect);
  assert.equal(d.update(hand,finger(2,.008),20,aspect).length,1);
  for(let i=0;i<100;i++)assert.deepEqual(d.update(hand,finger(2,i%2?.004:-.004),40+i*16,aspect),[]);
});
const right=tip=>Array.from({length:21},(_,i)=>i===8?tip:{x:.12,y:.65,z:0});
const detections=(left,tip)=>[{hand:'Left',points:left},{hand:'Right',points:right(tip)}];
test('right index mistaken for left thumb cannot pull the string origin',()=>{
  const s=new PipaHandStabilizer();s.update(detections(hand,{x:.05,y:.5}),0,aspect);
  const corrupt=structuredClone(hand),tip={x:hand[4].x+.04,y:hand[4].y-.02};corrupt[4]=tip;
  for(let i=1;i<=12;i++){
    const pose=s.update(detections(corrupt,tip),i*16,aspect);
    assert(Math.hypot(pose.left[4].x-hand[4].x,pose.left[4].y-hand[4].y)<1e-8);assert(pose.held);
  }
});
test('whole-hand label reversal is repaired by continuous wrist identity',()=>{
  const s=new PipaHandStabilizer();s.update(detections(hand,{x:.05,y:.5}),0,aspect);
  const assigned=detections(hand,{x:.4,y:.5}).map(h=>({...h,hand:h.hand==='Left'?'Right':'Left'}));
  const pose=s.update(assigned,20,aspect);assert.equal(pose.left[0].x,hand[0].x);assert.equal(pose.right.x,.4);
});
test('fixed strings remain playable when the left hand is occluded, then unlock',()=>{
  const s=new PipaHandStabilizer(),d=new PipaPluckDetector();s.lock(hand);
  let pose=s.update([{hand:'Right',points:right({x:.05,y:.5})}],0,aspect);d.update(pose.left,pose.right,0,aspect);
  pose=s.update([{hand:'Right',points:right({x:.95,y:.5})}],20,aspect);
  assert.deepEqual(d.update(pose.left,pose.right,20,aspect).map(h=>h.string),[0,1,2,3]);
  s.lock(null);assert.equal(s.update([],40,aspect).left,null);
});
test('all Jasmine melody pitches have their strongest sustained partial at the fundamental',()=>{
  for(const midi of [59,61,64,66,68,71,73,76]){
    const data=pluckedSample(midi),f=440*2**((midi-69)/12);
    const power=frequency=>{let re=0,im=0;for(let i=1000;i<9000;i++){const a=2*Math.PI*frequency*i/22050;re+=data[i]*Math.cos(a);im+=data[i]*Math.sin(a);}return re*re+im*im;};
    assert(power(f)>power(f*2)*2);assert(power(f)>power(f*3)*2);
    assert(power(f)>power(f*2**(1/12))*20);assert(power(f)>power(f*2**(-1/12))*20);
  }
});
