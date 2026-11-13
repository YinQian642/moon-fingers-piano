import {PipaPluckDetector} from './pipa-gestures.js';
export const INPUTS={
  single:[{id:'right-index',hand:'Right',tip:8,label:'右食指'},{id:'right-middle',hand:'Right',tip:12,label:'右中指'}],
  dual:[{id:'left-index',hand:'Left',tip:8,label:'左食指'},{id:'right-index',hand:'Right',tip:8,label:'右食指'}],
};
export class PipaInputBank {
  constructor(){this.detectors=new Map();}
  reset(){for(const d of this.detectors.values())d.reset();}
  update(frame,hands,mode,now,aspect){
    const hits=[],pointers=INPUTS[mode].map(input=>({...input,point:hands?.[input.hand]?.[input.tip]}));
    for(const pointer of pointers){
      if(!this.detectors.has(pointer.id))this.detectors.set(pointer.id,new PipaPluckDetector());
      const d=this.detectors.get(pointer.id);
      hits.push(...d.updateFrame(frame,pointer.point,now,aspect).map(h=>({...h,source:pointer.id})));
    }
    return {hits:hits.sort((a,b)=>a.order-b.order),pointers};
  }
}
// Independent clocks: a sweep never queues behind the other hand's input.
export class PipaSweepClock {
  constructor(){this.reset();}
  reset(){this.streams=new Map();this.melodyAt=-Infinity;}
  delay(source,stroke,now){
    const previous=this.streams.get(source);
    const at=previous?.stroke===stroke?Math.min(now+.084,Math.max(now,previous.at+.028)):now;
    this.streams.set(source,{stroke,at});return at-now;
  }
}
export const velocityScale=speed=>.94+.12*(1-Math.exp(-Math.max(0,speed)/3));
