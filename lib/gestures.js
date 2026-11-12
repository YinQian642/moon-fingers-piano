const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
const fresh=()=>({phase:'unarmed',lastSeen:-1e9,openFrames:0,closed:false,minimum:Infinity,peak:0,ratio:null,depthBlocked:false});
export const FINGER_REACH=[1,1,1.04,1.25];
const valid=points=>points?.length===21&&points.every(p=>[p.x,p.y,p.z].every(Number.isFinite));
export class PinchDetector {
  constructor(){this.threshold=.34;this.reset();}
  reset(){this.states=Array.from({length:8},fresh);}
  update(landmarks,hand,now,world,aspect=1){
    if(!valid(landmarks))return {hits:[],releases:[],ratios:[]};
    // Image z uses the same units as x. Preserve depth even without world landmarks.
    const projected=landmarks.map(p=>({x:p.x*aspect,y:p.y,z:p.z*aspect}));
    const imageScale=Math.max(dist(projected[0],projected[9]),dist(projected[5],projected[17]),.001);
    const validWorld=valid(world),pts=validWorld?world:projected;
    const scale=Math.max(dist(pts[0],pts[9]),dist(pts[5],pts[17]),.001);
    const hits=[],releases=[],ratios=[];
    [8,12,16,20].forEach((tip,i)=>{
      const slot=hand==='Left'?3-i:4+i;
      let s=this.states[slot];
      if(now-s.lastSeen>500){if(s.closed)releases.push(slot);s=this.states[slot]=fresh();}
      s.lastSeen=now;
      const imageGap=Math.hypot(projected[4].x-projected[tip].x,projected[4].y-projected[tip].y)/imageScale;
      const imageDepth=Math.abs(projected[4].z-projected[tip].z)/imageScale;
      const worldGap=Math.hypot(pts[4].x-pts[tip].x,pts[4].y-pts[tip].y)/scale;
      const worldDepth=Math.abs(pts[4].z-pts[tip].z)/scale;
      // Depth estimates are uncertain at contact/occlusion. Fuse planar evidence;
      // only corroborated large depth separation vetoes an otherwise visible pinch.
      const depth=validWorld?Math.min(worldDepth,imageDepth):imageDepth;
      const ratio=Math.hypot(validWorld?imageGap*.8+worldGap*.2:imageGap,depth*.55);
      const depthBlocked=depth>(validWorld?.45:.65);
      s.ratio=ratio;s.depthBlocked=depthBlocked;
      ratios.push(ratio);
      const enter=this.threshold*FINGER_REACH[i];
      const excursion=Math.max(.07,.14-(this.threshold-.34)*.58)*(i===3?1.1:1);
      if(s.phase==='unarmed'){
        s.minimum=Math.min(s.minimum,ratio);s.peak=Math.max(s.peak,ratio);
        if(ratio>enter+.04){if(++s.openFrames>=2)s.phase='ready';}else s.openFrames=0;
        if(s.phase==='unarmed'&&ratio-s.minimum>=excursion){s.phase='returning';s.peak=ratio;}
      }else if(s.phase==='pressed'){
        s.minimum=Math.min(s.minimum,ratio);
        // Rearm from the observed contact, not from a distant absolute radius.
        if(ratio-s.minimum>=excursion){s.phase='returning';s.closed=false;s.peak=ratio;releases.push(slot);}
      }else{
        s.peak=Math.max(s.peak,ratio);
        const closing=s.phase==='returning'?excursion*.6:.04;
        if(!depthBlocked&&ratio<=enter&&s.peak-ratio>=closing){
          hits.push(slot);s.phase='pressed';s.closed=true;s.openFrames=0;s.minimum=ratio;s.peak=ratio;
        }
      }
    });return {hits,releases,ratios};
  }
  expire(now){const released=[];this.states.forEach((s,i)=>{if(now-s.lastSeen>500&&s.phase!=='unarmed'){if(s.closed)released.push(i);this.states[i]=fresh();}});return released;}
}

// A simultaneous chord is one dream stroke. Free-play contacts stay independent.
export class DreamStrokeGate {
  constructor(){this.reset();}
  reset(){this.at=-Infinity;this.frameAt=-Infinity;this.slots=new Set();this.sequence=0;}
  take(hits,now){
    if(now<=this.frameAt)return null;this.frameAt=now;
    if(!hits.length)return null;
    if(now-this.at<35&&!hits.some(slot=>this.slots.has(slot))){hits.forEach(slot=>this.slots.add(slot));return null;}
    this.at=now;this.slots=new Set(hits);return {slot:hits[0],id:++this.sequence};
  }
}

// Score both complete assignments. A detection can never steal the other hand's slot.
export class HandAssociator {
  constructor(){this.tracks=[];}
  reset(){this.tracks=[];}
  assign(result,now){
    const old=this.tracks.filter(t=>now-t.seen<900);
    const detections=(result.landmarks||[]).slice(0,2).map((points,i)=>({points,world:result.worldLandmarks?.[i],wrist:[0,5,9,17].reduce((p,j)=>({x:p.x+points[j].x/4,y:p.y+points[j].y/4}),{x:0,y:0}),label:result.handedness?.[i]?.[0]}));
    const cost=(d,hand)=>{
      const track=old.find(t=>t.hand===hand),label=d.label;
      const confidence=Math.max(.5,Math.min(.99,label?.score??.5));
      const labelCost=label?(label.categoryName===hand?1-confidence:confidence):.5;
      if(track){const dt=Math.min(80,now-track.seen),movement=Math.hypot(d.wrist.x-track.wrist.x-track.vx*dt,d.wrist.y-track.wrist.y-track.vy*dt);return movement*8+labelCost*.08;}
      // Raw camera frames are not mirrored: anatomical left is normally at larger x.
      return labelCost+(hand==='Left'?1-d.wrist.x:d.wrist.x)*.06+(old.length?.45:0);
    };
    let hands=[];
    if(detections.length===2){const [a,b]=detections;hands=cost(a,'Left')+cost(b,'Right')<=cost(a,'Right')+cost(b,'Left')?['Left','Right']:['Right','Left'];}
    else if(detections.length===1)hands=[cost(detections[0],'Left')<=cost(detections[0],'Right')?'Left':'Right'];
    const uniqueLabels=new Set(detections.map(d=>d.label?.categoryName)).size===detections.length;
    const out=detections.map((d,i)=>{
      const hand=hands[i],previous=old.find(t=>t.hand===hand),dt=previous?Math.max(1,now-previous.seen):1;
      const pts=valid(d.world)?d.world:d.points,scale=Math.max(dist(pts[0],pts[9]),dist(pts[5],pts[17]),.001);
      const open=[8,12,16,20].every(tip=>dist(pts[4],pts[tip])/scale>.4);
      const candidate=uniqueLabels&&open&&d.label?.score>=.85?d.label.categoryName:null;
      const votes=candidate&&candidate===previous?.candidate?(previous.votes||0)+1:1;
      const since=candidate===previous?.candidate?previous.since:now;
      // Correct a bad initial label only after sustained evidence from an open hand.
      const proposed=candidate&&votes>=6&&now-since>=90?candidate:hand;
      return {...d,hand,proposed,candidate,votes,since,seen:now,vx:previous?.seen===now?previous.vx:previous?(d.wrist.x-previous.wrist.x)/dt:0,vy:previous?.seen===now?previous.vy:previous?(d.wrist.y-previous.wrist.y)/dt:0};
    });
    const retained=old.filter(t=>!hands.includes(t.hand));
    if(new Set([...out.map(d=>d.proposed),...retained.map(d=>d.hand)]).size===out.length+retained.length){for(const d of out){d.identityChanged=d.hand!==d.proposed;d.hand=d.proposed;}}
    this.tracks=[...out,...retained];return out;
  }
}
export function cameraError(error){return ({NotAllowedError:'请允许摄像头访问。',NotFoundError:'未找到摄像头。',NotReadableError:'摄像头被占用，请关闭其他视频应用。',SecurityError:'请使用 Chrome / Edge 打开 HTTPS 网页。'})[error?.name]||error?.message||'识别启动失败，请重试。';}
