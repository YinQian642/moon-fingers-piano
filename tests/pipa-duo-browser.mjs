import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {demoHand} from '../dist/lib/pipa-gestures.js';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
  await fs.mkdir('.local',{recursive:true});
  const context=await browser.newContext({viewport:{width:1440,height:1080}});
  await context.addInitScript(()=>{
    window.__duoPose=null;
    const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{postMessage(data,transfers){if(data.type==='frame')data.testPose=window.__duoPose;super.postMessage(data,transfers);}};
    navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const g=c.getContext('2d');setInterval(()=>{g.fillStyle='#24202d';g.fillRect(0,0,640,480);},16);return c.captureStream(60);};
  });
  await context.route('**/lib/hand-worker.js',route=>route.fulfill({contentType:'text/javascript',body:`self.onmessage=({data})=>{if(data.type==='init'){self.postMessage({type:'ready'});return;}if(data.type!=='frame')return;const pose=data.testPose,result={landmarks:[],handedness:[]};if(pose)for(const hand of ['Left','Right'])if(pose[hand]){result.landmarks.push(pose[hand]);result.handedness.push([{categoryName:hand,score:.99}]);}data.bitmap.close();self.postMessage({type:'result',result,timestamp:data.timestamp,session:data.session,inferenceMs:2});};`}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4192');
  await page.waitForFunction(()=>window.moonlight?.snapshot().notes===1468);
  await page.locator('#instrument-switch').click();await page.waitForFunction(()=>window.moonlight.snapshot().pipa.cues===77);
  await page.locator('[data-pipa-mode="free"]').click();await page.locator('#pipa-play').click();
  await page.waitForFunction(()=>window.moonlight.snapshot().pipa.audioReady);
  const snap=()=>page.evaluate(()=>window.moonlight.snapshot().pipa);
  const right=()=>Array.from({length:21},()=>({x:.08,y:.7,z:0}));
  let left=demoHand(),r=right();
  const pose=async(ms=65)=>{await page.evaluate(p=>window.__duoPose=p,{Left:left,Right:r});await page.waitForTimeout(ms);};
  await pose();await page.locator('#camera-button').click();await page.waitForFunction(()=>window.moonlight.snapshot().workerFrames>4);
  await page.locator('#pipa-lock').click();assert.equal((await snap()).stringsLocked,true);
  const near=(lines,i,gap)=>{
    const {a,b}=lines[i],dx=(b.x-a.x)*4/3,dy=b.y-a.y,l=Math.hypot(dx,dy);
    return {x:a.x+(b.x-a.x)*.7-dy/l*gap/(4/3),y:a.y+dy*.7+dx/l*gap,z:0};
  };
  const lines=(await snap()).strings;
  r[8]=near(lines,1,.01);r[12]=near(lines,1,.01);await pose();
  let before=await snap();
  for(let n=0;n<12;n++){r[8]=r[12]=near(lines,1,n%2?.01:-.01);await pose(55);}
  let after=await snap();assert.equal(after.attacks-before.attacks,24);
  assert.equal(after.pointerCounts['right-index']-before.pointerCounts['right-index'],12);
  assert.equal(after.pointerCounts['right-middle']-(before.pointerCounts['right-middle']||0),12);
  r[12]={x:.02,y:.95};r[8]={x:.05,y:.5};await pose();before=await snap();
  r[8]={x:.95,y:.5};await pose();after=await snap();
  assert.equal(after.attacks-before.attacks,4);
  const sweep=after.audioHistory.slice(-4);assert.deepEqual(sweep.map(n=>n.midi),[57,52,50,45]);
  for(let i=1;i<4;i++)assert(Math.abs(sweep[i].at-sweep[i-1].at-.028)<.001);
  // Dual mode refuses to play against a moving left-hand string layout.
  await page.locator('#pipa-lock').click();await page.locator('#pipa-hands').selectOption('dual');
  before=await snap();for(let n=0;n<3;n++){r[8]={x:n%2?.05:.95,y:.5};await pose();}
  assert.equal((await snap()).attacks,before.attacks);assert.match(await page.locator('#pipa-layout-hint').textContent(),/先固定/);
  // Capture two small fans in separate parts of the image, in the requested order.
  await page.locator('#pipa-layout').selectOption('twice');
  const region=dx=>demoHand().map(p=>({...p,x:p.x*.45+dx,y:p.y*.7+.1}));
  left=region(.04);r=right();await pose(350);await page.locator('#pipa-lock').click();
  let partial=await snap();assert.equal(partial.layoutPhase,'second');assert.equal(partial.stringsLocked,false);
  const firstPair=partial.strings.slice(0,2);before=await snap();
  r[8]={x:.95,y:.5};await pose();r[8]={x:.05,y:.5};await pose();assert.equal((await snap()).attacks,before.attacks);
  left=region(.50);await pose(350);await page.locator('#pipa-lock').click();
  after=await snap();assert.equal(after.layoutPhase,'ready');assert.deepEqual(after.strings.slice(0,2),firstPair);
  assert(after.strings[2].a.x-after.strings[0].a.x>.4);const fixed=after.strings;
  // Each index can independently reach a region without triggering the intervening string.
  left[8]=near(fixed,0,.008);r[8]=near(fixed,2,.008);await pose();
  before=await snap();left[8]=near(fixed,0,-.008);r[8]=near(fixed,2,-.008);await pose();
  after=await snap();assert.equal(after.counts[0]-before.counts[0],1);assert.equal(after.counts[2]-before.counts[2],1);assert.equal(after.counts[1],before.counts[1]);
  assert.deepEqual(after.strings,fixed);
  // Simultaneous same-string repeats retain two voices and equal response counts.
  left[8]=r[8]=near(fixed,0,.008);await pose();before=await snap();
  for(let n=0;n<16;n++){left[8]=r[8]=near(fixed,0,n%2?.008:-.008);await pose(55);}
  after=await snap();assert.equal(after.attacks-before.attacks,32);
  assert.equal(after.pointerCounts['left-index']-before.pointerCounts['left-index'],16);
  assert.equal(after.pointerCounts['right-index']-before.pointerCounts['right-index'],16);
  const last=after.audioHistory.slice(-2);assert.equal(last[0].midi,last[1].midi);assert.notEqual(last[0].key,last[1].key);assert(Math.abs(last[0].level-last[1].level)<1e-8);
  // Each pointer has its own dream sweep gate. Both simultaneous plucks are kept.
  await page.locator('[data-pipa-mode="dream"]').click();await page.locator('#pipa-play').click();
  left[8]=r[8]=near(fixed,0,.008);await pose();before=await snap();
  left[8]=r[8]=near(fixed,0,-.008);await pose();after=await snap();assert.equal(after.index,before.index+2);
  assert(after.audioHistory.at(-1).at-after.audioHistory.at(-2).at>=.0219);
  await page.waitForTimeout(250);assert.equal((await snap()).index,after.index);
  for(let n=0;n<4;n++){left[8]=r[8]=near(fixed,0,n%2?-.008:.008);await pose(55);}
  assert.equal((await snap()).index,after.index+8);
  // Guided mode still requires the displayed string and accepts either hand.
  await page.locator('[data-pipa-mode="guided"]').click();
  const wanted=(await snap()).cue.string;
  left[8]=near(fixed,wanted,.008);r[8]={x:.02,y:.9};await pose();
  await page.locator('#pipa-play').click();
  await page.waitForFunction(()=>window.moonlight.snapshot().pipa.state==='waiting');
  before=await snap();left[8]=near(fixed,wanted,-.008);await pose();assert.equal((await snap()).index,before.index+1);
  await page.screenshot({path:'.local/pipa-duo-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'.local/pipa-duo-mobile.png',fullPage:true});
  // Check actual Web Audio output, not just event counters.
  const audio=await page.evaluate(async()=>{
    const {PipaAudio,pluckedSample}=await import('./lib/pipa-audio.js');
    const render=async(dual,cancel=false)=>{
      const context=new OfflineAudioContext(1,22050*.4,22050),a=new PipaAudio();a.attach(context);
      const data=pluckedSample(57),buffer=context.createBuffer(1,data.length,22050);buffer.copyToChannel(data,0);a.buffers.set(57,buffer);a.ready=true;
      const l=a.playFree(57,.3,.02,'left-index:0'),r=dual?a.playFree(57,.3,.02,'right-index:0'):null;
      const independent=!r||l.releaseAt===Infinity&&r.releaseAt===Infinity;
      if(cancel)a.stopAll();const rendered=await context.startRendering();let energy=0;for(const v of rendered.getChannelData(0))energy+=v*v;
      return {energy,independent};
    };
    return {single:await render(false),dual:await render(true),cancelled:await render(true,true)};
  });
  assert(audio.dual.independent);assert(audio.dual.energy>audio.single.energy*2.5);assert.equal(audio.cancelled.energy,0);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,checks:['two right fingertips','two-step spatial calibration','first/third-string independent access','both indices repeated simultaneously','two same-pitch audio voices','independent dream steps','guided gate','mobile layout','rendered audio energy and cancellation']}));
}finally{await browser.close();}
