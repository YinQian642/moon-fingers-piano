import {KEYS,buildSong,pitchName,Transport} from './lib/music.js';
import {archivedSong} from './lib/library.js';
import {Piano} from './lib/audio.js';
import {HandWorker} from './lib/hand-client.js';
import {Sky} from './lib/visuals.js';
import {PinchDetector,HandAssociator,DreamStrokeGate,cameraError} from './lib/gestures.js';
const $=id=>document.getElementById(id),piano=new Piano(),pinch=new PinchDetector();
let mode='guided',song=null,builtinMidi=null,importedMidi=null,importTitle='',booting=false,loadToken=0,flash=Array(8).fill(0),lastFreeNote=null;
const transport=new Transport(piano,renderState);
const associator=new HandAssociator(),dreamStroke=new DreamStrokeGate();
const inputCounts=Array(8).fill(0);let lastInputBatch=[];
let stream=null,detector=null,startingCamera=false,cameraToken=0,lastFrame=-1,lastDetect=0,lastHandUi=0,handErrors=0,videoFrameRequest=null;
const video=$('webcam'),handCanvas=$('hand-overlay'),handCtx=handCanvas.getContext('2d'),roll=$('roll'),rollCtx=roll.getContext('2d');
const sky=new Sky($('starfield'),roll);
const keys=KEYS.map((key,i)=>{const button=document.createElement('button');button.className='piano-key';button.dataset.slot=i;button.setAttribute('aria-label',`${key.hand}${key.finger}，${key.name}，${pitchName(key.midi)}`);button.innerHTML=`<span class="finger-label">${key.finger}</span><span class="solfege">${key.en}</span><span class="key-bottom"><span>${key.en} · ${pitchName(key.midi)}</span><kbd>${key.key}</kbd></span>`;button.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();button.focus({preventScroll:true});hit(i,'screen');});button.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(!e.repeat)hit(i,'screen');}});$('keys').append(button);return button;});
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500);}
const clock=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
function safeText(id,text){const el=$(id);if(el&&el.textContent!==text)el.textContent=text;}
async function ensureAudio(){if(piano.ready){await piano.init();return;}if(booting)return piano.loading;booting=true;$('play-button').disabled=true;try{await piano.init(p=>safeText('play-text',`音色 ${Math.round(p*100)}%`));}finally{booting=false;$('play-button').disabled=false;renderState();}}
async function start(){try{await ensureAudio();if(mode==='free'){safeText('feedback','');renderState();return;}if(!song){toast('乐谱尚未加载，请稍候。');return;}if(['playing','waiting'].includes(transport.state))transport.pause();else transport.start();}catch(e){toast(e.message||'声音未能开启，请重试。');}}
async function hit(slot,source='camera'){
  if(!piano.ready){if(source==='camera'||booting)return;const inputMode=mode,inputSong=song;try{await ensureAudio();}catch(e){toast(e.message);return;}if(inputMode!==mode||inputSong!==song)return;}
  inputCounts[slot]++;flash[slot]=performance.now();keys[slot].classList.add('flash');setTimeout(()=>keys[slot].classList.remove('flash'),140);
  if(mode==='free'){piano.playFree(KEYS[slot].midi);lastFreeNote=slot;safeText('next-solfege',KEYS[slot].en);safeText('next-finger',`${KEYS[slot].hand} · ${KEYS[slot].finger}`);safeText('next-pitch',`${pitchName(KEYS[slot].midi)} · ${Math.round(440*2**((KEYS[slot].midi-69)/12)*100)/100} Hz`);safeText('feedback','');sky.hit(null,slot);return;}
  const result=transport.hit(slot);
  if(result.accepted){sky.hit(result.cue,slot);safeText('feedback','');}
  else if(result.reason==='pitch')safeText('feedback',`${KEYS[transport.cue.slot].hand}${KEYS[transport.cue.slot].finger} · ${KEYS[transport.cue.slot].en}`);
  else if(['ready','paused','ended'].includes(transport.state))safeText('feedback','点击开始');

}
function setMode(next){
  transport.pause();piano.stopAll();transport.dreamPlan=[];transport.lastTap=null;mode=next;transport.mode=next;pinch.reset();dreamStroke.reset();
  document.body.dataset.mode=mode;document.querySelectorAll('[data-mode]').forEach(el=>{if(el.tagName==='BUTTON')el.setAttribute('aria-pressed',String(el.dataset.mode===mode));});
  safeText('stage-tag',{free:'自由演奏',guided:'音乐引导',dream:'梦想模式'}[mode]);
  safeText('stage-hint',{free:'C4 — C5',guided:'按提示触碰',dream:'触碰即下落'}[mode]);
  safeText('keyboard-explanation',mode==='dream'?'任意指尖触碰':'同手拇指轻触指尖');
  $('dream-accompaniment').hidden=mode!=='dream';$('free-message').hidden=true;$('progress').disabled=mode==='free';$('speed').disabled=mode!=='guided';$('speed').closest('label').hidden=mode!=='guided';
  safeText('next-heading',mode==='free'?'当前音':'下一音');sky.reset(transport.index);

  renderState();
}
function renderState(){
  if(!song)return;
  const cue=transport.cue,state=transport.state,active=['playing','waiting'].includes(state),free=mode==='free';
  if(!booting){safeText('play-text',free?(piano.ready?'已开启':'开启声音'):active?'暂停':state==='paused'?'继续':state==='ended'?'重来':'开始');safeText('play-icon',active&&!free?'Ⅱ':'▶');}
  safeText('progress-label',`${transport.index} / ${song.cues.length}`);safeText('duration-label',clock(song.duration));
  $('progress').max=Math.max(0,song.cues.length-1);$('progress').value=Math.min(transport.index,song.cues.length-1);
  safeText('next-counter',free?'C4 — C5':`${Math.min(transport.index+1,song.cues.length)} / ${song.cues.length}`);
  keys.forEach((key,i)=>{key.classList.toggle('expected',!free&&!!cue&&mode==='guided'&&i===cue.slot);key.querySelector('.key-bottom>span').textContent=free?pitchName(KEYS[i].midi):'';});
  if(free){safeText('next-solfege',KEYS[lastFreeNote??0].en);safeText('next-finger',`${KEYS[lastFreeNote??0].hand} · ${KEYS[lastFreeNote??0].finger}`);safeText('next-pitch',pitchName(KEYS[lastFreeNote??0].midi));safeText('next-instruction','');safeText('stage-status','');safeText('pitch-label','C4 — C5');}
  else if(cue){const key=KEYS[cue.slot];safeText('next-solfege',key.en);safeText('next-finger',mode==='dream'?'任意指尖':`${key.hand} · ${key.finger}`);safeText('next-pitch',cue.pitch);safeText('next-instruction','');safeText('pitch-label',`${cue.tonic} · ${cue.scale==='minor'?'小调':'大调'}`);safeText('stage-status',state==='paused'?'已暂停':state==='waiting'&&mode==='guided'?'触碰继续':'');}
  else{safeText('next-solfege','—');safeText('next-finger','完成');safeText('next-pitch',`${transport.hits} 音`);safeText('next-instruction','');safeText('stage-status','');}
  $('upcoming').replaceChildren();if(!free)for(const c of song.cues.slice(transport.index+1,transport.index+6)){const span=document.createElement('span');span.textContent=KEYS[c.slot].en;span.title=c.pitch;$('upcoming').append(span);}
}

function installSong(next,display={}){song=next;transport.load(song);sky.reset();dreamStroke.reset();safeText('feedback','');safeText('song-kicker',display.composer||(song.builtin?'CLAUDE DEBUSSY':'MIDI'));$('song-title').replaceChildren();if(song.builtin){$('song-title').append('月光 ');const em=document.createElement('em');em.textContent='Clair de lune';$('song-title').append(em);}else $('song-title').textContent=display.title||song.title;safeText('song-details',`${song.key} · ${clock(song.duration)}`);renderState();}
function loadSong(midi,options){installSong(buildSong(midi,options));}
async function loadBuiltin(){const token=++loadToken;try{if(!builtinMidi){const res=await fetch('./assets/clair-de-lune.mid');if(!res.ok)throw Error('《月光》乐谱未能加载，请刷新重试。');builtinMidi=new window.Midi(await res.arrayBuffer());}if(token===loadToken)loadSong(builtinMidi,{title:'月光',trackIndex:0,builtin:true});}catch(e){if(token===loadToken){toast(e.message);safeText('feedback','乐谱加载失败，点击曲库中的月光重试。');}}}
async function loadArchived(entry){
  const token=++loadToken;transport.pause();
  try{const response=await fetch(`./assets/music-library/${entry.performance}`);if(!response.ok)throw Error('乐谱未能加载，请在曲库中重试。');const next=archivedSong(await response.json(),entry);if(token===loadToken)installSong(next,entry);}
  catch(error){if(token===loadToken)toast(error.message);}
}
async function loadLibrary(){
  const container=$('archived-songs');
  try{
    const response=await fetch('./assets/music-library/catalog.json');if(!response.ok)throw Error('曲库未能加载');
    const catalog=await response.json();if(catalog.schemaVersion!==1||!Array.isArray(catalog.entries))throw Error('曲库格式错误');
    const rows=catalog.entries.map(entry=>{
      if(!/^[a-z0-9-]+\/r\d{4}\/performance\.json$/.test(entry.performance)||typeof entry.title!=='string'||!Number.isFinite(entry.duration))throw Error('曲库条目错误');
      const button=document.createElement('button');button.className='library-song';button.dataset.songId=entry.id;
      const icon=document.createElement('span');icon.className='library-moon';icon.textContent='♬';icon.setAttribute('aria-hidden','true');
      const details=document.createElement('div'),title=document.createElement('strong'),subtitle=document.createElement('small'),arrow=document.createElement('span');
      title.textContent=entry.title;subtitle.textContent=`钢琴版 / ${clock(entry.duration)}`;details.append(title,subtitle);arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');button.append(icon,details,arrow);
      button.onclick=()=>{loadArchived(entry);$('library-dialog').close();};return button;
    });container.replaceChildren(...rows);
  }catch{const retry=document.createElement('button');retry.className='subtle-button';retry.textContent='重新加载曲库';retry.onclick=loadLibrary;container.replaceChildren(retry);}
}
document.querySelectorAll('button[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('play-button').onclick=start;$('reset-button').onclick=()=>{transport.reset();dreamStroke.reset();piano.stopAll();renderState();sky.reset();safeText('feedback','');};
$('accompaniment-toggle').onclick=()=>{transport.setDreamAccompaniment(!transport.dreamAccompaniment);$('accompaniment-toggle').setAttribute('aria-pressed',String(transport.dreamAccompaniment));};
$('speed').onchange=e=>transport.setSpeed(Number(e.target.value));$('volume').oninput=e=>piano.setVolume(Number(e.target.value)/100);$('progress').onchange=e=>{transport.seek(Number(e.target.value));sky.reset(transport.index);};
document.addEventListener('keydown',e=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();start();return;}const i=['KeyA','KeyS','KeyD','KeyF','KeyJ','KeyK','KeyL','Semicolon'].indexOf(e.code);if(i>=0){e.preventDefault();hit(i,'keyboard');}});
for(const [button,dialog] of [['help-button','help-dialog'],['library-button','library-dialog'],['credits-button','credits-dialog']])$(button).onclick=()=>$(dialog).showModal();
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('builtin-song').onclick=()=>{loadBuiltin();$('library-dialog').close();};$('import-button').onclick=$('library-import').onclick=()=>$('midi-file').click();
$('midi-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;const token=++loadToken;try{if(file.size>5*1024*1024)throw Error('请选择小于 5 MB 的 MIDI 文件。');const bytes=await file.arrayBuffer();if(new TextDecoder().decode(new Uint8Array(bytes,0,4))!=='MThd')throw Error('这不是标准 MIDI 文件，请选择 .mid 或 .midi 乐谱。');const parsed=new window.Midi(bytes);if(token!==loadToken)return;const title=file.name.replace(/\.midi?$/i,'');const track=parsed.tracks.findIndex(t=>t.notes.length&&t.channel!==9);const candidate=buildSong(parsed,{title,trackIndex:track});importedMidi=parsed;importTitle=title;loadSong(parsed,{title,trackIndex:candidate.trackIndex});$('imported-section').hidden=false;safeText('imported-name',title);$('melody-track').replaceChildren(...candidate.tracks.map(t=>{const o=document.createElement('option');o.value=t.index;o.textContent=`${t.name} · ${t.count} 音符`;return o;}));$('melody-track').value=candidate.trackIndex;$('library-dialog').showModal();toast('MIDI 已载入，可选择旋律音轨。');}catch(err){toast(`导入失败：${err.message}`);}finally{e.target.value='';}};
$('melody-track').onchange=e=>{if(importedMidi){++loadToken;loadSong(importedMidi,{title:importTitle,trackIndex:Number(e.target.value)});}};

async function startCamera(){
  if(stream||startingCamera){stopCamera();return;}
  const token=++cameraToken;startingCamera=true;safeText('camera-message','等待摄像头权限…');$('camera-button').querySelector('span').textContent='取消';
  try{
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw {name:'SecurityError'};
    const pending=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:60,max:60}}});
    if(token!==cameraToken){pending.getTracks().forEach(t=>t.stop());return;}stream=pending;
    for(const track of stream.getVideoTracks())track.onended=()=>{stopCamera();safeText('camera-message','摄像头已断开');};
    video.srcObject=stream;await video.play();$('camera-placeholder').hidden=true;
    if(!detector)detector=new HandWorker(text=>{if(token===cameraToken)safeText('camera-message',text);});
    await detector.init();if(token!==cameraToken)return;
    pinch.reset();dreamStroke.reset();associator.reset();lastFrame=-1;handErrors=0;$('hand-badges').hidden=false;$('camera-dot').classList.add('on');safeText('hand-count','0 / 2');safeText('camera-message','');$('camera-button').querySelector('span').textContent='关闭摄像头';
    if(video.requestVideoFrameCallback){const nextFrame=now=>{if(token!==cameraToken||!stream)return;detectHands(now);videoFrameRequest=video.requestVideoFrameCallback(nextFrame);};videoFrameRequest=video.requestVideoFrameCallback(nextFrame);}
  }catch(e){if(token===cameraToken){stopCamera();safeText('camera-message',cameraError(e));}}
  finally{if(token===cameraToken)startingCamera=false;}
}
function stopCamera(){cameraToken++;if(videoFrameRequest!==null){video.cancelVideoFrameCallback?.(videoFrameRequest);videoFrameRequest=null;}startingCamera=false;if(stream){stream.getTracks().forEach(t=>{t.onended=null;t.stop();});stream=null;}if(detector&&!detector.ready){detector.close();detector=null;}video.srcObject=null;pinch.reset();dreamStroke.reset();associator.reset();handCtx.clearRect(0,0,handCanvas.width,handCanvas.height);$('camera-placeholder').hidden=false;$('hand-badges').hidden=true;$('camera-dot').classList.remove('on');safeText('hand-count','未开启');safeText('camera-message','');$('camera-button').querySelector('span').textContent='开启摄像头';transport.pause();}
$('camera-button').onclick=startCamera;$('sensitivity').oninput=e=>{pinch.threshold=Number(e.target.value)/100;pinch.reset();};$('swap-hands').onchange=()=>{pinch.reset();dreamStroke.reset();associator.reset();};
const CONNECTIONS=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
function detectHands(now){
  if(!stream||!detector?.ready||detector.busy||startingCamera||video.readyState<2||lastFrame===video.currentTime)return;
  lastFrame=video.currentTime;lastDetect=now;const session=cameraToken;
  detector.detect(video,now,session).then(data=>{if(!data||data.session!==cameraToken||!stream)return;receiveHands(data.result,data.timestamp);if(video.currentTime!==lastFrame)detectHands(performance.now());}).catch(()=>{if(session===cameraToken&&++handErrors>3){stopCamera();safeText('camera-message','识别中断，请重试。');}});
}
function receiveHands(result,now){
  handErrors=0;
  if(handCanvas.width!==video.videoWidth||handCanvas.height!==video.videoHeight){handCanvas.width=video.videoWidth;handCanvas.height=video.videoHeight;}
  const w=handCanvas.width,h=handCanvas.height;handCtx.clearRect(0,0,w,h);const seen=new Set(),frameHits=[],frameReleases=[],assigned=associator.assign(result,now);
  if(assigned.some(t=>t.identityChanged)){pinch.reset();dreamStroke.reset();}
  for(const tracked of assigned){
    const points=tracked.points;let hand=tracked.hand;if($('swap-hands').checked)hand=hand==='Left'?'Right':'Left';seen.add(hand);
    const detected=pinch.update(points,hand,now,tracked.world,w/h);frameHits.push(...detected.hits);frameReleases.push(...detected.releases);
    handCtx.strokeStyle=hand==='Left'?'#c6b5e6':'#dfb69e';handCtx.lineWidth=1.5;handCtx.fillStyle=handCtx.strokeStyle;
    for(const [a,b] of CONNECTIONS){handCtx.beginPath();handCtx.moveTo(points[a].x*w,points[a].y*h);handCtx.lineTo(points[b].x*w,points[b].y*h);handCtx.stroke();}
    points.forEach((p,j)=>{handCtx.beginPath();handCtx.arc(p.x*w,p.y*h,[4,8,12,16,20].includes(j)?4:1.6,0,Math.PI*2);handCtx.fill();});
  }
  lastInputBatch=frameHits;
  if(mode==='free')frameReleases.forEach(slot=>piano.release(KEYS[slot].midi));
  if(mode==='free')frameHits.forEach(slot=>hit(slot));
  else if(mode==='dream'){const stroke=dreamStroke.take(frameHits,now);if(stroke)hit(stroke.slot);}
  else if(frameHits.length){const expected=transport.cue?.slot;const matching=frameHits.find(s=>s===expected||([0,7].includes(s)&&[0,7].includes(expected)));hit(matching??frameHits[0]);}
  if(now-lastHandUi>350){safeText('hand-count',`${seen.size} / 2`);safeText('left-hand',seen.has('Left')?'左手':'—');safeText('right-hand',seen.has('Right')?'右手':'—');safeText('recognition-status',`${Math.round(detector.inferenceMs)} ms · 左 ${inputCounts.slice(0,4).reduce((a,b)=>a+b,0)} / 右 ${inputCounts.slice(4).reduce((a,b)=>a+b,0)}`);lastHandUi=now;}
}
let lastUi=0,lastPaint=0;
function frame(now){const released=pinch.expire(now);if(mode==='free')released.forEach(slot=>piano.release(KEYS[slot].midi));transport.tick();if(!video.requestVideoFrameCallback)detectHands(now);if(now-lastPaint>16){sky.draw(now,mode,song,transport);lastPaint=now;}if(now-lastUi>150){safeText('position-label',clock(transport.position));lastUi=now;}requestAnimationFrame(frame);}
document.addEventListener('visibilitychange',()=>{if(document.hidden){transport.pause();piano.stopAll();pinch.reset();}});window.addEventListener('pagehide',()=>{stopCamera();piano.stopAll();detector?.close();});
// Introspection is read-only, useful for verifying timing without camera hardware.
window.moonlight=Object.freeze({snapshot:()=>({songId:song?.songId||(song?.builtin?"debussy-clair-de-lune-piano":null),title:song?.title,revision:song?.revision,mode,state:transport.state,position:transport.position,index:transport.index,hits:transport.hits,misses:transport.misses,cameraReady:!!detector?.ready,workerFrames:detector?.frames||0,inferenceMs:detector?.inferenceMs||0,cue:transport.cue?{slot:transport.cue.slot,midi:transport.cue.midi,time:transport.cue.time}:null,notes:song?.notes.length,cues:song?.cues.length,audioReady:piano.ready,dreamAccompaniment:transport.dreamAccompaniment,voices:piano.voices.size,contacts:pinch.states.map(s=>s.closed),sensitivity:pinch.threshold,contactStates:pinch.states.map(s=>({phase:s.phase,ratio:s.ratio,depthBlocked:s.depthBlocked})),audioAttacks:piano.attacks,inputCounts:[...inputCounts],lastInputBatch:[...lastInputBatch]})});
document.body.dataset.mode=mode;loadLibrary();await loadBuiltin();requestAnimationFrame(frame);



