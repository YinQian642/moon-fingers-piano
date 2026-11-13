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
  const rays=strings.map(s=>sub(s.b,s.a));
  if(rays.some(v=>norm(v)<.55))return null;
  // Folded/edge-on hands do not provide four distinguishable string targets.
  for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)if(Math.abs(cross(rays[i],rays[j]))/(norm(rays[i])*norm(rays[j]))<.075)return null;
  return {local,strings,scale};
}
function signed(point,line){const ray=sub(line.b,line.a);return cross(ray,sub(point,line.a))/norm(ray);}
function intersection(from,to,line){
  const travel=sub(to,from),ray=sub(line.b,line.a),den=cross(travel,ray);
  if(Math.abs(den)<1e-8)return null;
  const delta=sub(line.a,from),t=cross(delta,ray)/den,u=cross(delta,travel)/den;
  return t>=0&&t<=1&&u>=.28&&u<=.9?{t,u}:null;
}
export class PipaPluckDetector {
  constructor(){this.sequence=0;this.reset();}
  reset(){this.previous=null;this.sides=Array(4).fill(null);this.direction=null;this.motionAt=-Infinity;this.warm=0;this.status='waiting';}
  update(left,right,now,aspect=1){
    const frame=handFrame(left,aspect);
    if(!frame||!good(right)){this.reset();this.status=left?'spread':'waiting';return [];}
    const point=frame.local(right),raw={x:right.x*aspect,y:right.y},previous=this.previous;
    this.status='ready';
    if(!previous||now-previous.at>180||now<=previous.at){this.reset();this.status='ready';this.previous={point,raw,strings:frame.strings,at:now};this.sides=frame.strings.map(line=>{const gap=signed(point,line);return Math.abs(gap)>.035?{side:Math.sign(gap),point:{...point}}:null;});this.warm=1;return [];}
    const move=sub(point,previous.point),distance=norm(move),rawDistance=norm(sub(raw,previous.raw))/frame.scale;
    const deformation=Math.max(...frame.strings.map((s,i)=>Math.max(norm(sub(s.a,previous.strings[i].a)),norm(sub(s.b,previous.strings[i].b)))));
    if(distance>3.5||deformation>.35){this.reset();this.status='steady';this.previous={point,raw,strings:frame.strings,at:now};return [];}
    const moving=distance>.025&&rawDistance>.018;
    if(moving){
      const unit={x:move.x/distance,y:move.y/distance};
      if(!this.direction||now-this.motionAt>180||unit.x*this.direction.x+unit.y*this.direction.y<-.35){this.sequence++;this.direction=unit;}
      else this.direction=lerp(this.direction,unit,.35);
      this.motionAt=now;
    }
    const hits=[];
    frame.strings.forEach((line,i)=>{
      const gap=signed(point,line);if(Math.abs(gap)<.035)return;
      const side=Math.sign(gap),old=this.sides[i];
      if(old&&old.side!==side&&moving&&this.warm>=1){
        // Use the earlier string too: deformation by itself is not a right-hand pluck.
        const crossing=intersection(old.point,point,previous.strings[i]);
        if(crossing&&signed(old.point,line)*gap<0)hits.push({string:i,stroke:this.sequence,t:crossing.t,velocity:Math.max(.3,Math.min(1,distance/(now-previous.at)*45)),direction:side});
      }
      this.sides[i]={side,point:{...point}};
    });
    this.warm++;this.previous={point,raw,strings:frame.strings,at:now};
    return hits.sort((a,b)=>a.t-b.t);
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
