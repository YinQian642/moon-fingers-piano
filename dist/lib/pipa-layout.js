import {handFrame,STRINGS} from './pipa-gestures.js';
const copy=p=>({x:p.x,y:p.y});
export const liveStrings=points=>points?STRINGS.map(s=>({a:copy(points[4]),b:copy(points[s.tip])})):[];
export function fixedFrame(lines,aspect,scale){
  if(lines.length!==4)return null;
  const local=p=>({x:p.x*aspect/scale,y:p.y/scale});
  const strings=lines.map(s=>({a:local(s.a),b:local(s.b)}));
  return {local,strings,scale,valid:strings.map(s=>Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y)>.25)};
}
export class PipaStringLayout {
  constructor(){this.mode='once';this.clear();}
  clear(){this.fixed=null;this.first=null;this.scale=null;this.aspect=null;}
  setMode(mode){if(!['once','twice'].includes(mode))return;this.mode=mode;this.clear();}
  get phase(){return this.fixed?'ready':this.first?'second':'first';}
  get calibrating(){return this.mode==='twice'&&!this.fixed;}
  pair(points){return [12,8].map(tip=>({a:copy(points[4]),b:copy(points[tip])}));}
  capture(points,aspect){
    const frame=handFrame(points,aspect);if(!frame)return false;
    const required=this.mode==='twice'?[0,1]:[0,1,2,3];
    if(required.some(i=>!frame.valid[i]))return false;
    if(this.mode==='once'){this.fixed=liveStrings(points);this.scale=frame.scale;}
    else if(!this.first){this.first=this.pair(points);this.scale=frame.scale;}
    else {this.fixed=[...this.first,...this.pair(points)];this.scale=(this.scale+frame.scale)/2;}
    this.aspect=aspect;return true;
  }
  lines(points){
    if(this.fixed)return this.fixed;
    if(this.mode==='once')return liveStrings(points);
    const preview=points?this.pair(points):[];
    return this.first?[...this.first,...preview]:preview;
  }
  frame(points,aspect){
    if(this.calibrating)return null;
    return this.fixed?fixedFrame(this.fixed,aspect,this.scale):handFrame(points,aspect);
  }
}
