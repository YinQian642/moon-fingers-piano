import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
const context=await browser.newContext({viewport:{width:1200,height:900}});
await context.addInitScript(()=>{
  window.__gesturePose={ratios:[[.9,.9,.9,.9],[.9,.9,.9,.9]]};
  const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{postMessage(data,transfers){if(data.type==='frame')data.testPose=window.__gesturePose;super.postMessage(data,transfers);}};
  navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d');setInterval(()=>{ctx.fillStyle='#333';ctx.fillRect(0,0,640,480);ctx.fillRect(Date.now()%640,1,1,1);},16);return c.captureStream(60);};
});
await context.route('**/lib/hand-worker.js*',route=>route.fulfill({contentType:'text/javascript',body:`
self.onmessage=({data})=>{
  if(data.type==='init'){self.postMessage({type:'ready',delegate:'test'});return;}
  if(data.type!=='frame')return;
  const world=data.testPose.ratios.map(r=>{const p=Array.from({length:21},()=>({x:0,y:0,z:0}));p[9]={x:0,y:.1,z:0};p[5]={x:-.05,y:.05,z:0};p[17]={x:.05,y:.05,z:0};[8,12,16,20].forEach((tip,i)=>p[tip]={x:r[i]*.1,y:0,z:(data.testPose.depth||0)*.1});return p;});
  const result={worldLandmarks:world,landmarks:world.map((hand,i)=>hand.map(p=>({x:(i===0?.7:.3)+p.x,y:.5+p.y*4/3,z:0}))),handedness:[[{categoryName:'Left',score:.52}],[{categoryName:'Left',score:.52}]]};
  data.bitmap.close();self.postMessage({type:'result',result,timestamp:data.timestamp,session:data.session,inferenceMs:2});
};` }));
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4192');await page.waitForFunction(()=>window.moonlight?.snapshot().notes===1468);
const snap=()=>page.evaluate(()=>window.moonlight.snapshot());
const pose=(ratios,depth=0)=>page.evaluate(p=>window.__gesturePose=p,{ratios,depth});
await page.locator('[data-mode="free"]').click();await page.locator('#play-button').click();await page.waitForFunction(()=>window.moonlight.snapshot().audioReady);await page.locator('#camera-button').click();await page.waitForFunction(()=>window.moonlight.snapshot().workerFrames>4);
const first=await snap();
for(let i=0;i<20;i++){
  await pose([[.15,.9,.9,.9],[.15,.9,.9,.9]]);
  await page.waitForFunction(({l,r})=>{const s=window.moonlight.snapshot();return s.inputCounts[3]===l&&s.inputCounts[4]===r;},{l:first.inputCounts[3]+i+1,r:first.inputCounts[4]+i+1},{timeout:2500});
  await pose([[.45,.9,.9,.9],[.45,.9,.9,.9]]);
  await page.waitForFunction(()=>{const s=window.moonlight.snapshot();return !s.contacts[3]&&!s.contacts[4];});
}
const repeated=await snap();assert.equal(repeated.audioAttacks-first.audioAttacks,40);
// Exercise the failure case through the real app: biased depth and slight release.
for(const threshold of [34,46]){
  await page.locator('#sensitivity').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},threshold);
  await pose([[.9,.9,.9,.9],[.9,.9,.9,.9]],.55);await page.waitForTimeout(100);
  const initial=await snap(),close=threshold===34?.30:.32,open=threshold===34?.46:.40;
  for(let i=0;i<10;i++){
    await pose([[close,.9,.9,.9],[close,.9,.9,.9]],.55);
    await page.waitForFunction(n=>window.moonlight.snapshot().audioAttacks===n,initial.audioAttacks+2*(i+1),{timeout:2000});
    await pose([[open,.9,.9,.9],[open,.9,.9,.9]],.55);
    await page.waitForFunction(()=>{const s=window.moonlight.snapshot();return !s.contacts[3]&&!s.contacts[4];});
  }
}
await pose([[.9,.9,.9,.9],[.9,.9,.9,.9]]);await page.waitForTimeout(80);
let before=await snap();await pose([[.15,.15,.15,.15],[.15,.15,.15,.15]]);await page.waitForFunction(n=>window.moonlight.snapshot().audioAttacks===n,before.audioAttacks+8);await page.waitForTimeout(100);assert.equal((await snap()).voices,8);
await pose([[.5,.5,.5,.5],[.5,.5,.5,.5]]);await page.waitForTimeout(200);assert((await snap()).voices>0);await page.waitForTimeout(550);assert.equal((await snap()).voices,0);
await pose([[.9,.9,.9,.9],[.9,.9,.9,.9]]);await page.waitForTimeout(80);before=await snap();await pose([[.9,.9,.9,.24],[.9,.9,.9,.24]]);await page.waitForFunction(n=>window.moonlight.snapshot().audioAttacks===n,before.audioAttacks+2);
await pose([[.9,.9,.9,.9],[.9,.9,.9,.9]]);await page.waitForTimeout(80);
await page.locator('[data-mode="guided"]').click();await page.locator('#reset-button').click();await page.locator('#play-button').click();await page.waitForFunction(()=>window.moonlight.snapshot().state==='waiting');
await pose([[.32,.9,.9,.9],[.32,.9,.9,.9]],.55);await page.waitForFunction(()=>window.moonlight.snapshot().index===1);await pose([[.9,.9,.9,.9],[.9,.9,.9,.9]],.55);await page.waitForTimeout(100);
await page.locator('[data-mode="dream"]').click();await page.locator('#reset-button').click();await page.locator('#play-button').click();await page.waitForTimeout(100);
for(let i=0;i<10;i++){await pose([[.32,.9,.9,.9],[.32,.9,.9,.9]],.55);await page.waitForFunction(n=>window.moonlight.snapshot().index===n,i+1,{timeout:2500});await pose([[.40,.9,.9,.9],[.40,.9,.9,.9]],.55);await page.waitForFunction(()=>{const s=window.moonlight.snapshot();return !s.contacts[3]&&!s.contacts[4];});}
assert.equal((await snap()).index,10);await page.waitForTimeout(300);assert.equal((await snap()).index,10);assert.deepEqual(errors,[]);
console.log(JSON.stringify({passed:true,checks:['40 paired free-play attacks','40 additional attacks with depth bias','small in-radius releases at maximum sensitivity','guided two-hand contact with depth bias','eight-finger chord','natural free-play release tail','larger pinky reach','10 dream strokes from 20 paired contacts','duplicate labels retained'],inputCounts:(await snap()).inputCounts}));
await context.close();

const audioPage=await browser.newPage();await audioPage.goto('http://127.0.0.1:4192');
const audioReport=await audioPage.evaluate(async()=>{
  const {Piano}=await import('./lib/audio.js');
  const decode=new OfflineAudioContext(2,44100,44100),loader=new Piano();loader.attach(decode);await loader.load();
  const onset={};for(const [midi,buffer] of loader.buffers){const d=buffer.getChannelData(0);let i=0;while(i<d.length&&Math.abs(d[i])<.0002)i++;onset[midi]=Math.round(i/buffer.sampleRate*1000);}
  const render=async(chord)=>{const context=new OfflineAudioContext(2,44100*2,44100),p=new Piano();p.attach(context);p.buffers=loader.buffers;p.ready=true;for(let i=0;i<10;i++){for(const midi of chord)p.note(midi,2,.8,.1+i*.06);}for(const v of [...p.voices])p.releaseVoice(v,.78,.05);const b=await context.startRendering(),d=b.getChannelData(0);const rms=(a,z)=>{let sum=0,count=0;for(let i=Math.round(a*44100);i<Math.round(z*44100);i++){sum+=d[i]**2;count++;}return Math.sqrt(sum/count);};return {attacks:p.attacks,during:rms(.15,.7),after:rms(.95,1.5),peak:Math.max(...d.subarray(0,44100))};};
  const tail=async()=>{const context=new OfflineAudioContext(2,44100*2,44100),p=new Piano();p.attach(context);p.buffers=loader.buffers;p.ready=true;p.playFree(60);p.release(60);const b=await context.startRendering(),d=b.getChannelData(0);const rms=(a,z)=>{let sum=0;for(let i=Math.round(a*44100);i<Math.round(z*44100);i++)sum+=d[i]**2;return Math.sqrt(sum/((z-a)*44100));};return {body:rms(.1,.3),tail:rms(.4,.55),after:rms(.8,1.5)};};
  return {onsetMs:onset,single:await render([60]),chord:await render([60,64,67,72]),free:await tail()};
});
assert(audioReport.free.body>.001);assert(audioReport.free.tail>.0005);assert(audioReport.free.tail<audioReport.free.body);assert(audioReport.free.after<1e-6);assert.equal(audioReport.single.attacks,10);assert.equal(audioReport.chord.attacks,40);assert(audioReport.single.during>.001);assert(audioReport.chord.during>.001);assert(audioReport.single.after<1e-6);assert(audioReport.chord.after<1e-6);assert(audioReport.chord.peak<1);console.log(JSON.stringify({audioPassed:true,...audioReport}));
}finally{await browser.close();}
