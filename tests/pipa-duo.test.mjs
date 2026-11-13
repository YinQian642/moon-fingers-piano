import test from 'node:test';
import assert from 'node:assert/strict';
import {demoHand,handFrame,PipaHandStabilizer} from '../dist/lib/pipa-gestures.js';
import {PipaStringLayout,fixedFrame,liveStrings} from '../dist/lib/pipa-layout.js';
import {PipaInputBank,PipaSweepClock,velocityScale} from '../dist/lib/pipa-input.js';
import {Transport} from '../dist/lib/music.js';
const hand=demoHand(),aspect=4/3,scale=handFrame(hand,aspect).scale;
const frame=fixedFrame(liveStrings(hand),aspect,scale);
const moveHand=(dx,dy)=>hand.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
function near(i,gap){
  const {a,b}=frame.strings[i],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy);
  return {x:(a.x+dx*.7-dy/l*gap)*scale/aspect,y:(a.y+dy*.7+dx/l*gap)*scale};
}
function hands(mode,a,b){
  const left=structuredClone(hand),right=moveHand(-.15,0);
  if(mode==='dual'){left[8]=a;right[8]=b;}else{right[8]=a;right[12]=b;}
  return {Left:left,Right:right};
}
test('two captures preserve middle/index order and independent regions, without mutating the first',()=>{
  const layout=new PipaStringLayout();layout.setMode('twice');assert.equal(layout.frame(hand,aspect),null);
  assert(layout.capture(hand,aspect));assert.equal(layout.phase,'second');
  const first=structuredClone(layout.first),second=moveHand(-.16,-.12);
  assert.equal(layout.frame(second,aspect),null);assert(layout.capture(second,aspect));
  assert.equal(layout.phase,'ready');assert.deepEqual(layout.fixed.slice(0,2),first);
  assert.deepEqual(layout.fixed.map(s=>s.b),[hand[12],hand[8],second[12],second[8]].map(({x,y})=>({x,y})));
  const before=structuredClone(layout.fixed);second[8].x+=.2;
  assert.deepEqual(layout.lines(second),before);assert(layout.frame(null,aspect));
  layout.clear();assert.equal(layout.phase,'first');assert.equal(layout.frame(hand,aspect),null);
});
test('invalid capture does not consume a stage; changing layout starts a new calibration',()=>{
  const layout=new PipaStringLayout();layout.setMode('twice');assert(!layout.capture(null,aspect));
  const folded=structuredClone(hand);folded[12]={...folded[4]};assert(!layout.capture(folded,aspect));
  assert.equal(layout.phase,'first');layout.capture(hand,aspect);layout.setMode('once');
  assert.equal(layout.first,null);assert(layout.capture(hand,aspect));assert(layout.frame(null,aspect));
  layout.clear();assert.equal(layout.frame(null,aspect),null);
});
for(const mode of ['single','dual'])for(let i=0;i<4;i++){
  test(`${mode}, string ${i+1}: both pointers produce 40 close repeated crossings equally`,()=>{
    const bank=new PipaInputBank();bank.update(frame,hands(mode,near(i,.016),near(i,.016)),mode,0,aspect);
    for(let n=1;n<=40;n++){
      const point=near(i,n%2?-.016:.016),hits=bank.update(frame,hands(mode,point,point),mode,n*30,aspect).hits;
      assert.deepEqual(hits.map(h=>h.string),[i,i]);assert.equal(new Set(hits.map(h=>h.source)).size,2);
      assert.equal(hits[0].speed,hits[1].speed);
    }
  });
}
test('one missing hand never resets the other; reacquisition cannot bridge a phantom sweep',()=>{
  const bank=new PipaInputBank(),mode='dual';bank.update(frame,hands(mode,near(1,.03),near(1,.03)),mode,0,aspect);
  const partial=hands(mode,near(1,-.03),near(1,-.03));delete partial.Left;
  assert.deepEqual(bank.update(frame,partial,mode,30,aspect).hits.map(h=>h.source),['right-index']);
  const hits=bank.update(frame,hands(mode,near(1,-.03),near(1,.03)),mode,60,aspect).hits;
  assert.deepEqual(hits.map(h=>h.source),['right-index']);
});
test('two fixed regions allow independent first/third-string plucks without second-string events',()=>{
  const lines=[.2,.35,.65,.8].map(x=>({a:{x,y:.15},b:{x,y:.85}})),f=fixedFrame(lines,aspect,.4),bank=new PipaInputBank();
  const points=x=>({x,y:.5});bank.update(f,hands('dual',points(.18),points(.63)),'dual',0,aspect);
  assert.deepEqual(bank.update(f,hands('dual',points(.22),points(.67)),'dual',30,aspect).hits.map(h=>h.string),[0,2]);
});
test('label correction exposes both raw index points symmetrically for plucking',()=>{
  const s=new PipaHandStabilizer(),left=hand,right=moveHand(-.3,-.2);
  s.update([{hand:'Left',points:left},{hand:'Right',points:right}],0,aspect);
  const result=s.update([{hand:'Left',points:right},{hand:'Right',points:left}],30,aspect);
  assert.deepEqual(result.hands.Left[8],left[8]);assert.deepEqual(result.hands.Right[8],right[8]);
});
test('speed uses elapsed camera time, with a deliberately narrow and monotonic volume range',()=>{
  const speeds=[20,80].map(ms=>{const bank=new PipaInputBank();bank.update(frame,hands('dual',near(0,.03),near(0,.03)),'dual',0,aspect);return bank.update(frame,hands('dual',near(0,-.03),near(0,-.03)),'dual',ms,aspect).hits[0].speed;});
  assert(Math.abs(speeds[0]/speeds[1]-4)<1e-8);assert(velocityScale(speeds[0])>velocityScale(speeds[1]));
  for(const speed of [0,.01,1,3,10,100])assert(velocityScale(speed)>=.94&&velocityScale(speed)<=1.06);
});
test('sweep sounds are separated by 28ms with independent clocks and bounded lookahead',()=>{
  const c=new PipaSweepClock();
  for(let i=0;i<4;i++)assert(Math.abs(c.delay('left',1,10)-i*.028)<1e-8);
  assert.equal(c.delay('right',1,10),0);assert.equal(c.delay('left',2,10.01),0);
  for(let i=0;i<100;i++)assert(c.delay('right',1,10)<.085);
  c.reset();assert.equal(c.delay('left',1,10),0);
});
test('guided and dream preserve score pitches while forwarding per-pluck dynamics and scheduling',()=>{
  for(const mode of ['guided','dream']){
    const calls=[],t=new Transport({now:()=>0,note:(...args)=>calls.push(args),stopAll(){}});
    t.load({cues:[{time:0,midi:68,duration:.4,velocity:.8,slot:1}],accompaniment:[],duration:.5});t.mode=mode;t.start();t.tick();
    assert(t.hit(1,{velocityScale:1.03,delay:.028,voiceKey:'left-index:melody'}).accepted);
    assert.equal(calls[0][0],68);assert.equal(calls[0][2],.8*1.03);assert.equal(calls[0][3],.028);assert.equal(calls[0][4].voiceKey,'left-index:melody');
  }
});
