export const STRINGS = [
  {name:'一弦', finger:'食指', tip:8, midi:57, pitch:'A3'},
  {name:'二弦', finger:'中指', tip:12, midi:52, pitch:'E3'},
  {name:'三弦', finger:'无名指', tip:16, midi:50, pitch:'D3'},
  {name:'四弦', finger:'小指', tip:20, midi:45, pitch:'A2'},
];
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
const norm=p=>Math.hypot(p.x,p.y);
const cross=(a,b)=>a.x*b.y-a.y*b.x;
const good=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export function handFrame(points,aspect=1){
  if(points?.length!==21||!points.every(good))return null;
  const image=p=>({x:p.x*aspect,y:p.y}),origin=image(points[0]);
  const axis=sub(image(points[5]),image(points[17])),scale=norm(axis);
  if(scale<.035)return null;
  const x={x:axis.x/scale,y:axis.y/scale},y={x:-x.y,y:x.x};
  const local=p=>{const d=sub(image(p),origin);return {x:(d.x*x.x+d.y*x.y)/scale,y:(d.x*y.x+d.y*y.y)/scale};};
  const strings=STRINGS.map(s=>({a:local(points[4]),b:local(points[s.tip])}));
  const valid=strings.map(s=>norm(sub(s.b,s.a))>.25);
  if(!valid.some(Boolean))return null;
  const imagePoint=p=>({x:(origin.x+scale*(p.x*x.x+p.y*y.x))/aspect,y:origin.y+scale*(p.x*x.y+p.y*y.y)});
  return {local,strings,scale,valid,imagePoint};
}
function signed(point,line){const ray=sub(line.b,line.a);return cross(ray,sub(point,line.a))/norm(ray);}
function along(point,line){const r=sub(line.b,line.a),d=sub(point,line.a);return (d.x*r.x+d.y*r.y)/(r.x*r.x+r.y*r.y);}
function intersection(from,to,line){
  const travel=sub(to,from),ray=sub(line.b,line.a),den=cross(travel,ray);
  if(Math.abs(den)<1e-8)return null;
  const delta=sub(line.a,from),t=cross(delta,ray)/den,u=cross(delta,travel)/den;
  return t>=0&&t<=1&&u>=.14&&u<=1.04?{t,u}:null;
}
// Stabilize the string endpoints in the left palm's coordinates, not screen pixels.
// A right fingertip occluding the thumb must not drag the string origin with it.
export class PipaHandStabilizer {
  constructor(){this.reset();}
  reset(){this.anchor=null;this.previous=null;this.locked=null;this.candidates=new Map();}
  lock(points){this.locked=points?.map(p=>({...p}))||null;}
  update(assigned,now,aspect=1){
    let left=assigned.find(h=>h.hand==='Left')?.points,right=assigned.find(h=>h.hand==='Right')?.points;
    const prev=this.previous,distance=(a,b)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y);
    if(left&&right&&prev&&now-prev.at<400){
      const normal=distance(left[0],prev.left)+distance(right[0],prev.right);
      const swapped=distance(right[0],prev.left)+distance(left[0],prev.right);
      if(swapped+.04<normal)[left,right]=[right,left];
    }
    if(left&&right)this.previous={left:{...left[0]},right:{...right[0]},at:now};
    if(this.locked)return {left:this.locked,right:right?.[8],held:true};
    const frame=handFrame(left,aspect);
    if(!frame){if(!left||!prev||now-prev.at>400)this.anchor=null;return {left:null,right:right?.[8],held:false};}
    const target=right&&frame.local(right[8]),ids=[4,8,12,16,20];let held=false;
    if(!this.anchor)this.anchor=new Map(ids.map(i=>[i,frame.local(left[i])]));
    const points=left.map(p=>({...p}));
    for(const i of ids){
      const old=this.anchor.get(i),observed=frame.local(left[i]),delta=norm(sub(observed,old));
      const occluded=target&&(norm(sub(target,old))<.32||norm(sub(target,observed))<.22);
      let accepted=old;
      if(occluded){held=true;this.candidates.delete(i);}
      else if(delta>.45){
        const candidate=this.candidates.get(i);
        if(candidate&&norm(sub(observed,candidate.point))<.12&&now-candidate.at>=140){accepted=observed;this.candidates.delete(i);}
        else if(!candidate||norm(sub(observed,candidate.point))>=.12)this.candidates.set(i,{point:observed,at:now});
        held=true;
      }else{accepted=lerp(old,observed,.45);this.candidates.delete(i);}
      this.anchor.set(i,accepted);points[i]={...left[i],...frame.imagePoint(accepted)};
    }
    return {left:points,right:right?.[8],held};
  }
}
export class PipaPluckDetector {
  constructor(){this.sequence=0;this.reset();}
  reset(){this.previous=null;this.states=Array(4).fill(null);this.direction=null;this.motionPoint=null;this.motionAt=-Infinity;this.struck=new Set();this.status='waiting';}
  update(left,right,now,aspect=1){
    const frame=handFrame(left,aspect);
    if(!frame||!good(right)){this.reset();this.status=left?'spread':'waiting';return [];}
    const point=frame.local(right),raw={x:right.x*aspect,y:right.y},previous=this.previous;
    const seed=()=>{this.previous={point,raw,strings:frame.strings,at:now};if(!this.motionPoint)this.motionPoint={...point};};
    this.status='ready';
    if(!previous||now-previous.at>250||now<=previous.at){this.reset();this.status='ready';seed();}
    else if(norm(sub(point,previous.point))>3.5){this.reset();this.status='steady';seed();return [];}
    const move=sub(point,this.motionPoint||point),distance=norm(move);
    if(distance>.006){
      const unit={x:move.x/distance,y:move.y/distance};
      if(!this.direction||now-this.motionAt>260||unit.x*this.direction.x+unit.y*this.direction.y<-.5){this.sequence++;this.struck.clear();this.direction=unit;}
      else this.direction=lerp(this.direction,unit,.35);
      this.motionAt=now;this.motionPoint={...point};
    }
    const hits=[];
    frame.strings.forEach((line,i)=>{
      if(!frame.valid[i]){this.states[i]=null;return;}
      const gap=signed(point,line),u=along(point,line),projection=lerp(line.a,line.b,Math.max(.14,Math.min(1,u)));
      const spacing=Math.min(...frame.strings.filter((_,j)=>j!==i&&frame.valid[j]).map(s=>Math.abs(signed(projection,s))));
      const radius=Math.max(.004,Math.min(.014,spacing*.22)),release=Math.max(.014,radius*1.9);
      const state=this.states[i];
      const arm=()=>({point:{...point},raw:{...raw},side:Math.sign(gap)});
      if(state){
        // Accumulate motion from the armed position. No minimum speed per video frame.
        const travel=norm(sub(point,state.point)),rawTravel=norm(sub(raw,state.raw))/frame.scale;
        const crossing=previous&&intersection(previous.point,point,line);
        // Remember an actual crossing until the finger clears the tiny dead band.
        // Merely approaching the string or touching and retracting is silent.
        if(Math.sign(gap)===state.side)state.pending=null;
        else if(crossing)state.pending={...crossing,at:now};
        const confirmed=state.pending&&Math.sign(gap)===-state.side&&Math.abs(gap)>=Math.min(.004,radius);
        if(confirmed&&travel>.012&&rawTravel>.012){
          hits.push({string:i,t:state.pending.t,order:state.pending.at+state.pending.t*.001,velocity:Math.max(.5,Math.min(.95,travel*2)),direction:Math.sign(gap)||-state.side});
          this.states[i]=Math.abs(gap)>=release?arm():null;
        }else if(Math.abs(gap)>=release&&(Math.sign(gap)!==state.side||Math.abs(gap)>Math.abs(signed(state.point,line))))this.states[i]=arm();
      }else if(Math.abs(gap)>=release)this.states[i]=arm();
    });
    hits.sort((a,b)=>a.order-b.order);
    // Re-armed strikes of the same string are independent even at very low speeds.
    if(hits.some(h=>this.struck.has(h.string))){this.sequence++;this.struck.clear();}
    for(const h of hits){h.stroke=this.sequence;this.struck.add(h.string);}
    seed();return hits;
  }
}

// Mouse/touch uses the same crossing and hysteresis rules in a fixed demonstration hand.
export function demoHand(){
  const points=Array.from({length:21},()=>({x:.63,y:.79,z:0}));
  points[0]={x:.62,y:.9,z:0};points[5]={x:.48,y:.56,z:0};points[17]={x:.78,y:.56,z:0};
  points[4]={x:.23,y:.77,z:0};
  [8,12,16,20].forEach((tip,i)=>points[tip]={x:.43+i*.14,y:[.21,.15,.24,.39][i],z:0});
  return points;
}
