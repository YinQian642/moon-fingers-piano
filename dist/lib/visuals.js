import {KEYS} from './music.js';
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
export class Sky {
  constructor(background,roll){this.background=background;this.roll=roll;this.stars=Array.from({length:195},(_,i)=>({x:((i*73+17)%997)/997,y:((i*131+37)%683)/683,r:.25+(i%5)*.12,s:.15+(i%7)*.045,a:.16+(i%5)*.08}));this.bursts=[];this.previousIndex=0;this.displayIndex=0;this.fromIndex=0;this.changedAt=0;}
  context(canvas){const dpr=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);return {c,w,h};}
  hit(cue,slot){this.bursts.push({slot:cue?.slot??slot,at:performance.now()});}
  reset(index=0){this.previousIndex=this.displayIndex=this.fromIndex=index;this.bursts=[];}
  draw(now,mode,song,t){
    const bg=this.context(this.background),seconds=reduce.matches?0:now/1000;
    for(const s of this.stars){const x=(s.x*bg.w+seconds*s.s)%bg.w,y=(s.y*bg.h-seconds*s.s*.3+bg.h)%bg.h;bg.c.fillStyle=`rgba(${s.r>.65?'222,194,180':'190,199,237'},${s.a})`;bg.c.beginPath();bg.c.arc(x,y,s.r,0,Math.PI*2);bg.c.fill();}
    const {c,w,h}=this.context(this.roll),margin=22,lane=(w-margin*2)/8,line=h-45;
    for(let i=0;i<=8;i++){c.strokeStyle='rgba(173,167,214,.055)';c.beginPath();c.moveTo(margin+i*lane,48);c.lineTo(margin+i*lane,line);c.stroke();}
    const halo=c.createRadialGradient(w*.55,h*.4,0,w*.55,h*.4,w*.4);halo.addColorStop(0,'rgba(129,95,155,.09)');halo.addColorStop(1,'rgba(129,95,155,0)');c.fillStyle=halo;c.fillRect(0,0,w,h);
    if(t.index!==this.previousIndex){this.fromIndex=this.displayIndex;this.previousIndex=t.index;this.changedAt=now;}
    const f=reduce.matches?1:Math.min(1,(now-this.changedAt)/130);this.displayIndex=this.fromIndex+(this.previousIndex-this.fromIndex)*(1-(1-f)**3);
    if(mode!=='free'&&song){
      const dream=mode==='dream',first=dream?Math.max(0,Math.floor(this.displayIndex)-1):t.index,last=Math.min(song.cues.length,first+(dream?8:55));
      for(let i=last-1;i>=first;i--){const n=song.cues[i],current=i===t.index,y=dream?line-23-(i-this.displayIndex)*55:line-(n.time-t.position)*25;
        if(y<62||y>h+32)continue;
        const x=margin+(n.slot+.5)*lane,bw=Math.min(lane*.57,53),bh=dream?31:Math.max(28,Math.min(52,n.duration*17)),played=i<t.index;
        c.globalAlpha=played?Math.max(0,1-f):1;c.fillStyle=current?'#d7bed1':'rgba(95,92,144,.36)';c.strokeStyle=current?'#efd8df':'rgba(165,150,201,.35)';c.lineWidth=.7;c.shadowBlur=current?18:0;c.shadowColor='#d2b2e029';c.beginPath();c.roundRect(x-bw/2,y-bh,bw,bh,4);c.fill();c.stroke();c.shadowBlur=0;
        c.fillStyle=current?'#342b48':'#b9b4ce';c.font=`${current?14:11}px Georgia,serif`;c.textAlign='center';c.fillText(KEYS[n.slot].en,x,y-bh/2+4);c.globalAlpha=1;
      }
    }
    this.bursts=this.bursts.filter(b=>now-b.at<620);
    for(const b of this.bursts){const f=(now-b.at)/620;c.strokeStyle=`rgba(226,184,165,${.6*(1-f)})`;c.lineWidth=.8;c.beginPath();c.ellipse(margin+(b.slot+.5)*lane,line,10+f*45,3+f*10,0,0,Math.PI*2);c.stroke();}
  }
}
