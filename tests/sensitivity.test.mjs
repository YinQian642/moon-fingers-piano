import test from 'node:test';
import assert from 'node:assert/strict';
import {PinchDetector,DreamStrokeGate} from '../dist/lib/gestures.js';

function points(gap,z=0,tip=8){
  const p=Array.from({length:21},()=>({x:0,y:0,z:0}));
  p[9]={x:0,y:1,z:0};p[5]={x:-.5,y:.5,z:0};p[17]={x:.5,y:.5,z:0};
  for(const t of [8,12,16,20])p[t]={x:t===tip?gap:1,y:0,z:t===tip?z:0};
  return p;
}
function arm(p,side,tip){p.update(points(1,0,tip),side,0,points(1,0,tip));p.update(points(1,0,tip),side,16,points(1,0,tip));}
test('default: first contact and 20 repeats tolerate a world-depth bias on every finger',()=>{
  for(const side of ['Left','Right'])for(const tip of [8,12,16,20]){
    const p=new PinchDetector();arm(p,side,tip);const slot=side==='Left'?3-[8,12,16,20].indexOf(tip):4+[8,12,16,20].indexOf(tip);
    for(let i=0;i<20;i++){
      const t=40+i*66;
      assert.deepEqual(p.update(points(.28,0,tip),side,t,points(.28,.5,tip)).hits,[slot]);
      assert.deepEqual(p.update(points(.46,0,tip),side,t+33,points(.46,.5,tip)).releases,[slot]);
    }
  }
});
test('maximum sensitivity: a single small-opening frame rearms without leaving the radius',()=>{
  for(const side of ['Left','Right'])for(const tip of [8,12,16,20]){
    const p=new PinchDetector();p.threshold=.46;arm(p,side,tip);
    for(let i=0;i<20;i++){
      const t=40+i*50;
      assert.equal(p.update(points(.32,0,tip),side,t,points(.32,.6,tip)).hits.length,1);
      assert.equal(p.update(points(.40,0,tip),side,t+25,points(.40,.6,tip)).releases.length,1);
    }
  }
});
test('maximum sensitivity: contacts inside the old maximum gap become playable',()=>{
  const p=new PinchDetector();p.threshold=.46;arm(p,'Right',8);
  assert.deepEqual(p.update(points(.40),'Right',40,points(.40,.4)).hits,[4]);
});
test('a closed starting pose can rearm after a short release instead of demanding a wide open hand',()=>{
  const p=new PinchDetector();p.threshold=.46;
  assert.deepEqual(p.update(points(.32),'Left',0,points(.32,.5)).hits,[]);
  assert.deepEqual(p.update(points(.40),'Left',25,points(.40,.5)).hits,[]);
  assert.deepEqual(p.update(points(.32),'Left',50,points(.32,.5)).hits,[3]);
});
test('both hands: biased-depth contacts yield free chords and one dream stroke per pair',()=>{
  const p=new PinchDetector(),g=new DreamStrokeGate();p.threshold=.46;
  for(const side of ['Left','Right'])arm(p,side,8);
  for(let i=0;i<20;i++){
    const time=40+i*66,hits=['Left','Right'].flatMap(side=>p.update(points(.32),side,time,points(.32,.55)).hits);
    assert.deepEqual(hits,[3,4]);assert.equal(g.take(hits,time).id,i+1);
    for(const side of ['Left','Right'])p.update(points(.40),side,time+33,points(.40,.55));
  }
});
test('holding near the new sensitivity limit never streams repeated notes',()=>{
  for(const threshold of [.34,.46]){const p=new PinchDetector();p.threshold=threshold;arm(p,'Right',8);
    assert.equal(p.update(points(.30),'Right',32,points(.30,.5)).hits.length,1);
    for(let i=0;i<120;i++){const gap=[.30,.32,.29,.31][i%4];assert.deepEqual(p.update(points(gap),'Right',48+i*16,points(gap,.2+(i%4)*.2)).hits,[]);}
  }
});
