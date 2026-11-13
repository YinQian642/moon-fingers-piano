import {Transport} from './music.js';
import {archivedSong} from './library.js';
import {PipaAudio} from './pipa-audio.js';
import {STRINGS,PipaPluckDetector,PipaHandStabilizer,demoHand} from './pipa-gestures.js';

export class PipaExperience {
  constructor({video}){
    this.video=video;this.audio=new PipaAudio();this.detector=new PipaPluckDetector();this.mouse=new PipaPluckDetector();this.stabilizer=new PipaHandStabilizer();
    this.active=false;this.mode='guided';this.epoch=0;this.flashes=Array(4).fill(-Infinity);this.counts=Array(4).fill(0);this.detectedCounts=Array(4).fill(0);this.manual=0;this.lastStroke=null;
    this.root=document.createElement('section');this.root.id='pipa-experience';this.root.hidden=true;
    this.root.innerHTML=`<div class="pipa-layout"><section class="pipa-instrument"><div class="pipa-heading"><div><span class="eyebrow">PIPA · EXPLORATION</span><h2>指间四弦 <small>琵琶试验</small></h2></div><div class="pipa-modes" aria-label="琵琶演奏方式"><button data-pipa-mode="free" aria-pressed="false">自由演奏</button><button data-pipa-mode="guided" aria-pressed="true">音乐引导</button><button data-pipa-mode="dream" aria-pressed="false">梦想模式</button></div></div><div class="pipa-stage"><canvas id="pipa-canvas" aria-label="四根虚拟琴弦，可按住鼠标或触屏划弦"></canvas><div class="pipa-stage-heading"><span id="pipa-gesture-hint">左手撑弦 · 右手食指拨弦</span><span id="pipa-tracking">鼠标划弦也可试奏</span><button id="pipa-lock" class="subtle-button" aria-pressed="false">固定琴弦</button></div><div class="pipa-live-note" aria-live="polite"><span id="pipa-note">A · E · D · A</span><small id="pipa-note-detail">四根空弦</small></div></div><div class="pipa-controls"><button id="pipa-reset" class="icon-button" aria-label="琵琶从头开始">↺</button><button id="pipa-play" class="primary-button">开启声音</button><span id="pipa-progress">单拨 · 连拨 · 扫弦</span><button id="pipa-backing" class="accompaniment-toggle" aria-pressed="false" hidden>伴奏 <span aria-hidden="true"></span></button><label class="pipa-volume">音量<input id="pipa-volume" type="range" min="0" max="100" value="70" aria-label="琵琶音量"></label></div><div class="pipa-strings" aria-label="四根弦的试奏按钮">${STRINGS.map((s,i)=>`<button data-string="${i}" aria-label="拨${s.name} ${s.pitch}"><span>${s.name} <small>${s.finger}</small></span><strong>${s.pitch}</strong><kbd>${i+1}</kbd></button>`).join('')}</div></section><aside class="pipa-sidebar"><div id="pipa-camera-slot"></div><section class="pipa-song-panel"><span class="eyebrow">琵琶曲库</span><h3 id="pipa-song-title">茉莉花</h3><p id="pipa-song-hint">任意一弦推进一音，扫弦计一次</p><button id="pipa-library" class="subtle-button">选择乐曲 ↗</button></section></aside></div><p class="pipa-footnote">左手自然展开 · 右手食指横向穿弦 · 1–4 试奏</p>`;
    document.querySelector('main').append(this.root);this.canvas=this.el('pipa-canvas');
    this.transport=new Transport(this.audio,()=>this.render());this.transport.mode=this.mode;
    this.el('pipa-library').onclick=()=>this.openLibrary();
    this.el('pipa-lock').onclick=()=>{if(this.stabilizer.locked)this.stabilizer.lock(null);else if(this.left)this.stabilizer.lock(this.left);else{this.text('pipa-tracking','先让左手入镜');return;}this.detector.reset();this.lastStroke=null;this.render();};
    this.createLibrary();
    this.loadLibrary();
    this.el('pipa-play').onclick=()=>this.start();
    this.el('pipa-reset').onclick=()=>{this.epoch++;this.transport.reset();this.resetInput();this.clearNote();this.render();};
    this.el('pipa-backing').onclick=()=>{this.transport.setDreamAccompaniment(!this.transport.dreamAccompaniment);this.render();};
    this.el('pipa-volume').oninput=e=>this.audio.setVolume(Number(e.target.value)/100);
    this.root.querySelectorAll('[data-pipa-mode]').forEach(b=>b.onclick=()=>this.setMode(b.dataset.pipaMode));
    this.root.querySelectorAll('[data-string]').forEach(b=>{
      b.onclick=()=>this.manualPluck(Number(b.dataset.string));
      b.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();if(!e.repeat)this.manualPluck(Number(b.dataset.string));}};
    });
    this.canvas.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();this.canvas.setPointerCapture(e.pointerId);this.pointer=e.pointerId;this.mouse.reset();this.movePointer(e);this.ensureAudio().catch(()=>{});};
    this.canvas.onpointermove=e=>{if(this.pointer===e.pointerId)this.movePointer(e);};
    const release=()=>{this.pointer=null;this.mouse.reset();};
    this.canvas.onpointerup=release;this.canvas.onpointercancel=release;this.canvas.onlostpointercapture=release;
    document.addEventListener('keydown',e=>{
      if(!this.active||e.repeat||e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
      if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();this.start();}
      const index=['Digit1','Digit2','Digit3','Digit4'].indexOf(e.code);if(index>=0){e.preventDefault();this.manualPluck(index);}
    });
  }
  el(id){return this.root.querySelector('#'+id);}
  text(id,value){const el=this.el(id);if(el.textContent!==value)el.textContent=value;}
  resetInput(){this.detector.reset();this.mouse.reset();this.lastStroke=null;this.left=null;this.right=null;this.pointer=null;}
  setActive(value){this.stabilizer.reset();this.epoch++;this.active=value;this.root.hidden=!value;this.transport.pause();this.audio.stopAll();this.resetInput();this.render();}
  setMode(mode){this.epoch++;this.transport.pause();this.audio.stopAll();this.mode=mode;this.transport.mode=mode;this.transport.reset();this.resetInput();this.clearNote();this.render();}
  loadSong(song,display={}){this.epoch++;this.song={...song,cues:song.cues.map(n=>({...n,slot:3-Math.floor(n.slot/2)}))};this.songTitle=display.title||song.title;this.transport.load(this.song);this.resetInput();this.clearNote();this.render();}
  async ensureAudio(){try{await this.audio.init(p=>this.text('pipa-play',`音色 ${Math.round(p*100)}%`));return true;}catch{this.text('pipa-tracking','声音未能开启，请重试');return false;}finally{this.render();}}
  async start(){const epoch=this.epoch;if(!await this.ensureAudio()||epoch!==this.epoch||!this.active)return;if(this.mode!=='free'){if(['waiting','playing'].includes(this.transport.state))this.transport.pause();else this.transport.start();}this.render();}
  async manualPluck(index){const epoch=this.epoch;if(!await this.ensureAudio()||epoch!==this.epoch||!this.active)return;this.playHits([{string:index,stroke:++this.manual,velocity:.8}],'manual');}
  playHits(hits,source){
    if(!this.active||document.querySelector('dialog[open]'))return;
    for(const hit of hits){this.flashes[hit.string]=performance.now();this.detectedCounts[hit.string]++;}
    if(!this.audio.ready)return;
    for(const hit of hits){
      const i=hit.string,stroke=`${source}:${hit.stroke}`;
      if(this.mode!=='free'){
        if(stroke===this.lastStroke)continue;
        const result=this.transport.hit(i);if(!result.accepted){if(result.reason==='pitch')this.text('pipa-tracking',`请拨${STRINGS[this.transport.cue.slot].name}`);continue;}
        this.lastStroke=stroke;
        this.text('pipa-note',result.cue.pitch);this.text('pipa-note-detail',`${STRINGS[i].name} · ${this.transport.index} / ${this.song.cues.length}`);
      }else{this.audio.playFree(STRINGS[i].midi,hit.velocity);this.text('pipa-note',STRINGS[i].pitch);this.text('pipa-note-detail',`${STRINGS[i].name} · ${hit.direction<0?'回拨':'拨弦'}`);}
      this.counts[i]++;this.flashes[i]=performance.now();
    }
    this.render();
  }
  receive(assigned,now,aspect){
    if(!this.active)return;
    const pose=this.stabilizer.update(assigned,now,aspect);
    this.left=pose.left;this.right=pose.right;this.handAt=performance.now();
    this.playHits(this.detector.update(this.left,this.right,now,aspect),'camera');
    this.text('pipa-tracking',!this.left?'左手自然展开':!this.right?'右手食指入镜':this.stabilizer.locked?'琴弦已固定':pose.held?'琴弦稳定中':'四弦已就绪');
  }

  movePointer(event){
    const rect=this.canvas.getBoundingClientRect(),box=this.geometry(rect.width,rect.height);
    const point={x:1-(event.clientX-rect.left-box.x)/box.w,y:(event.clientY-rect.top-box.y)/box.h};
    // Mouse demo is disabled over a tracked hand so it cannot alter camera calibration.
    if(this.video.srcObject)return;
    this.playHits(this.mouse.update(demoHand(),point,performance.now(),4/3),'mouse');
  }
  geometry(w,h){const ratio=this.video.videoWidth?this.video.videoWidth/this.video.videoHeight:4/3;const width=Math.min(w,h*ratio),height=width/ratio;return {x:(w-width)/2,y:(h-height)/2,w:width,h:height};}
  draw(now){
    if(!this.active)return;this.transport.tick();
    const canvas=this.canvas,w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);const box=this.geometry(w,h);
    const project=p=>({x:box.x+(1-p.x)*box.w,y:box.y+p.y*box.h});
    if(this.video.srcObject&&this.video.readyState>=2){c.save();c.globalAlpha=.34;c.translate(box.x+box.w,box.y);c.scale(-1,1);c.drawImage(this.video,0,0,box.w,box.h);c.restore();}
    const live=now-(this.handAt||0)<250,points=this.video.srcObject?(live?this.left:null):demoHand();
    if(points){
      const a=project(points[4]);
      STRINGS.forEach((s,i)=>{
        const b=project(points[s.tip]),age=now-this.flashes[i],glow=Math.max(0,1-age/500);
        const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
        const wave=reduced||glow<=0?0:Math.sin(age*.06)*glow*7;
        c.strokeStyle=`rgba(${glow?'240,204,174':'187,164,211'},${.6+glow*.4})`;c.lineWidth=1.3+glow*1.2;
        c.shadowColor='#ddbba6';c.shadowBlur=glow*16;c.beginPath();c.moveTo(a.x,a.y);c.quadraticCurveTo((a.x+b.x)/2+wave,(a.y+b.y)/2-wave,b.x,b.y);c.stroke();c.shadowBlur=0;
        const p=lerpPoint(a,b,.14),q=lerpPoint(a,b,1);c.lineWidth=7;c.strokeStyle='rgba(198,173,218,.07)';c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke();
        c.fillStyle='#e5d4dc';c.beginPath();c.arc(b.x,b.y,4,0,Math.PI*2);c.fill();c.font='12px sans-serif';c.textAlign='center';c.fillText(`${s.name} · ${this.mode==='guided'&&this.transport.cue?.slot===i?this.transport.cue.pitch:s.pitch}`,b.x,b.y-15);
        this.root.querySelector(`[data-string="${i}"]`).classList.toggle('sounding',glow>.4);
      });
      c.fillStyle='#dfbaa2';c.beginPath();c.arc(a.x,a.y,6,0,Math.PI*2);c.fill();
      if(!this.video.srcObject){c.font='11px sans-serif';c.fillStyle='#aaa1b9';c.textAlign='center';c.fillText('按住鼠标或触屏划过琴弦',w/2,h-24);}
    }
    if(live&&this.right){const p=project(this.right);c.strokeStyle='#f6d5b1';c.lineWidth=2;c.beginPath();c.arc(p.x,p.y,8,0,Math.PI*2);c.stroke();c.fillStyle='#fff1dc';c.beginPath();c.arc(p.x,p.y,2,0,Math.PI*2);c.fill();}
  }
  render(){
    if(!this.transport)return;
    this.el('pipa-lock').setAttribute('aria-pressed',String(!!this.stabilizer.locked));this.text('pipa-lock',this.stabilizer.locked?'解除固定':'固定琴弦');
    const musical=this.mode!=='free',dream=this.mode==='dream',t=this.transport;
    this.root.querySelectorAll('[data-pipa-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pipaMode===this.mode)));
    this.el('pipa-backing').hidden=!dream;this.el('pipa-backing').setAttribute('aria-pressed',String(t.dreamAccompaniment));
    this.text('pipa-play',!this.audio.ready?'开启声音':!musical?'声音已开启':['waiting','playing'].includes(t.state)?'暂停':t.state==='paused'?'继续':t.state==='ended'?'重来':'开始');
    this.text('pipa-progress',musical&&this.song?`${t.index} / ${this.song.cues.length}`:'单拨 · 连拨 · 扫弦');
    this.text('pipa-song-title',this.songTitle||'茉莉花');
    this.el('pipa-play').disabled=musical&&!this.song;
    if(musical&&t.cue)this.text('pipa-song-hint',`下一音 ${t.cue.pitch} · ${dream?'任意一弦':STRINGS[t.cue.slot].name}`);
    else this.text('pipa-song-hint',musical?(this.song?'已完成':'载入乐谱 · 可在曲库重试'):'四根空弦 · 自由拨奏');
    this.root.querySelectorAll('[data-string]').forEach((b,i)=>{const target=this.mode==='guided'&&t.cue?.slot===i;b.classList.toggle('expected',target);b.querySelector('strong').textContent=target?t.cue.pitch:STRINGS[i].pitch;});
  }
  clearNote(){this.text('pipa-note','A · E · D · A');this.text('pipa-note-detail','四根空弦');this.flashes.fill(-Infinity);}
  createLibrary(){
    this.library=document.createElement('dialog');this.library.id='pipa-library-dialog';
    this.library.innerHTML='<button class="close-dialog" aria-label="关闭琵琶曲库">×</button><h2>琵琶曲库</h2><div id="pipa-songs"></div><p id="pipa-library-status" role="status"></p><button id="pipa-library-retry" class="subtle-button" hidden>重新载入</button>';
    document.body.append(this.library);this.library.querySelector('.close-dialog').onclick=()=>this.library.close();
    this.library.querySelector('#pipa-library-retry').onclick=()=>this.loadLibrary();
    this.library.addEventListener('close',()=>this.resetInput());
  }
  openLibrary(){this.transport.pause();this.audio.stopAll();this.resetInput();this.library.showModal();}
  async loadLibrary(){
    const status=this.library.querySelector('#pipa-library-status'),retry=this.library.querySelector('#pipa-library-retry');retry.hidden=true;
    try{
      const response=await fetch('./assets/pipa-library/catalog.json');if(!response.ok)throw Error();
      const catalog=await response.json();if(catalog.schemaVersion!==1||!catalog.entries?.length)throw Error();
      this.entries=catalog.entries;
      this.library.querySelector('#pipa-songs').replaceChildren(...this.entries.map(entry=>{
        const button=document.createElement('button');button.className='library-song';button.dataset.pipaSongId=entry.id;
        const title=document.createElement('strong');title.textContent=entry.title;button.append(title);
        button.onclick=async()=>{if(await this.loadEntry(entry))this.library.close();};return button;
      }));
      status.textContent='';if(!this.song)await this.loadEntry(this.entries[0]);
    }catch{status.textContent='琵琶曲库未能载入，请重试';retry.hidden=false;}
  }
  async loadEntry(entry){
    const token=this.loadToken=(this.loadToken||0)+1;
    try{
      if(!/^[a-z0-9-]+\/r\d{4}\/performance\.json$/.test(entry.performance))throw Error();
      const response=await fetch('./assets/pipa-library/'+entry.performance);if(!response.ok)throw Error();
      const song=archivedSong(await response.json(),entry);if(token!==this.loadToken)return false;
      this.loadSong(song,entry);this.library.querySelector('#pipa-library-status').textContent='';return true;
    }catch{if(token===this.loadToken){this.library.querySelector('#pipa-library-status').textContent='乐谱未能载入，请重新选择';this.library.querySelector('#pipa-library-retry').hidden=false;}return false;}
  }
  resetHands(){this.stabilizer.reset();this.resetInput();this.render();}
  pause(clearHands=false){if(clearHands)this.stabilizer.reset();this.epoch++;this.transport.pause();this.audio.stopAll();this.resetInput();this.render();}
  snapshot(){return {songId:this.song?.songId,title:this.songTitle,cue:this.transport.cue?{midi:this.transport.cue.midi,string:this.transport.cue.slot}:null,active:this.active,mode:this.mode,state:this.transport.state,index:this.transport.index,cues:this.song?.cues.length,audioReady:this.audio.ready,attacks:this.audio.attacks,counts:[...this.counts],detectedCounts:[...this.detectedCounts],tracking:this.detector.status,stringsLocked:!!this.stabilizer.locked,stroke:this.detector.sequence,accompaniment:this.transport.dreamAccompaniment,voices:this.audio.voices.size};}
}
const lerpPoint=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
