import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {demoHand,handFrame} from '../dist/lib/pipa-gestures.js';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
  await fs.mkdir('.local',{recursive:true});
  const context=await browser.newContext({viewport:{width:1440,height:1050}});
  await context.addInitScript(()=>{
    window.__pipaPose=null;
    const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{postMessage(data,transfers){if(data.type==='frame')data.testPose=window.__pipaPose;super.postMessage(data,transfers);}};
    navigator.mediaDevices.getUserMedia=async()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const c=canvas.getContext('2d');setInterval(()=>{c.fillStyle='#24202d';c.fillRect(0,0,640,480);},16);return canvas.captureStream(60);};
  });
  await context.route('**/lib/hand-worker.js',route=>route.fulfill({contentType:'text/javascript',body:`self.onmessage=({data})=>{if(data.type==='init'){self.postMessage({type:'ready'});return;}if(data.type!=='frame')return;const pose=data.testPose;let result={landmarks:[],handedness:[]};if(pose){const right=Array.from({length:21},()=>({x:.12,y:.65,z:0}));right[8]=pose.point||{x:pose.x,y:.5,z:0};result={landmarks:[pose.left,right],handedness:[[{categoryName:'Left',score:.99}],[{categoryName:'Right',score:.99}]]};}data.bitmap.close();self.postMessage({type:'result',result,timestamp:data.timestamp,session:data.session,inferenceMs:2});};`}));
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4192');
  const snap=()=>page.evaluate(()=>window.moonlight.snapshot());
  await page.waitForFunction(()=>window.moonlight?.snapshot().notes===1468);
  assert.equal((await snap()).instrument,'piano');
  await page.locator('#instrument-switch').click();assert.equal((await snap()).instrument,'pipa');
  await page.waitForFunction(()=>window.moonlight.snapshot().pipa.songId==='jasmine-pipa');
  assert.equal((await snap()).pipa.mode,'guided');
  await page.locator('[data-pipa-mode="free"]').click();
  await page.locator('#pipa-play').click();await page.waitForFunction(()=>window.moonlight.snapshot().pipa.audioReady);
  for(const key of ['1','2','3','4'])await page.keyboard.press(key);
  assert.equal((await snap()).pipa.attacks,4);assert.equal((await snap()).audioAttacks,0);
  const bounds=await page.locator('#pipa-canvas').boundingBox();
  // Demo frame is a contained 4:3 camera image, horizontally mirrored.
  const fw=Math.min(bounds.width,bounds.height*4/3),fh=fw/(4/3),ox=(bounds.width-fw)/2,oy=(bounds.height-fh)/2;
  const pointer=x=>({x:bounds.x+ox+(1-x)*fw,y:bounds.y+oy+.5*fh});
  let a=pointer(.05),b=pointer(.95);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:15});await page.mouse.up();
  assert.equal((await snap()).pipa.attacks,8);
  await page.locator('[data-pipa-mode="dream"]').click();await page.locator('#pipa-reset').click();
  await page.locator('#pipa-play').click();
  for(let i=0;i<5;i++){await page.locator('[data-string="0"]').click();assert.equal((await snap()).pipa.index,i+1);}
  await page.waitForTimeout(300);assert.equal((await snap()).pipa.index,5);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:15});await page.mouse.up();assert.equal((await snap()).pipa.index,6);
  await page.locator('#pipa-play').click();await page.locator('[data-string="0"]').click();assert.equal((await snap()).pipa.index,6);
  await page.locator('#pipa-backing').click();assert.equal((await snap()).pipa.accompaniment,true);await page.locator('#pipa-backing').click();
  await page.locator('#pipa-library').click();assert.equal(await page.locator('#pipa-library-dialog [data-song-id]').count(),0);assert.equal(await page.locator('[data-pipa-song-id]').count(),1);await page.locator('[data-pipa-song-id="jasmine-pipa"]').click();await page.waitForFunction(()=>!document.querySelector('#pipa-library-dialog').open);
  assert.equal((await snap()).pipa.cues,77);assert.equal((await snap()).pipa.index,0);assert.equal((await snap()).songId,'debussy-clair-de-lune-piano');
  await page.locator('[data-string="2"]').click();assert.equal((await snap()).pipa.index,1);
  // First two Jasmine notes are the same pitch: each must require a separate input.
  for(let i=1;i<77;i++){await page.locator('[data-string="2"]').click();assert.equal((await snap()).pipa.index,i+1);}
  await page.waitForFunction(()=>window.moonlight.snapshot().pipa.state==='ended');
  await page.locator('#pipa-reset').click();
  await page.locator('[data-pipa-mode="guided"]').click();await page.locator('#pipa-play').click();
  await page.waitForFunction(()=>window.moonlight.snapshot().pipa.state==='waiting');
  const expected=(await snap()).pipa.cue.string;
  const wrong=(expected+1)%4,detectedBefore=(await snap()).pipa.detectedCounts[wrong];
  await page.locator(`[data-string="${wrong}"]`).click();assert.equal((await snap()).pipa.index,0);assert.equal((await snap()).pipa.detectedCounts[wrong],detectedBefore+1);
  await page.locator(`[data-string="${expected}"]`).click();assert.equal((await snap()).pipa.index,1);
  await page.waitForFunction(()=>window.moonlight.snapshot().pipa.state==='waiting');
  await page.waitForTimeout(200);assert.equal((await snap()).pipa.index,1);
  await page.screenshot({path:'.local/pipa-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'.local/pipa-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1050});
  await page.locator('[data-pipa-mode="free"]').click();
  const pose=async x=>{await page.evaluate(p=>window.__pipaPose=p,{left:demoHand(),x});await page.waitForTimeout(65);};
  await pose(.28);await page.locator('#camera-button').click();await page.waitForFunction(()=>window.moonlight.snapshot().workerFrames>4);
  const baseline=(await snap()).pipa.attacks;
  for(let i=0;i<10;i++)await pose(i%2?.28:.35);
  assert.equal((await snap()).pipa.attacks,baseline+10);
  // Exercise association, endpoint stabilization, detection and audio together.
  const frame=handFrame(demoHand(),4/3);
  const near=(i,gap)=>{const {a,b}=frame.strings[i],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy);return frame.imagePoint({x:a.x+dx*.7-dy/l*gap,y:a.y+dy*.7+dx/l*gap});};
  const posePoint=async(point,left=demoHand())=>{await page.evaluate(p=>window.__pipaPose=p,{left,point});await page.waitForTimeout(65);};
  for(let i=0;i<4;i++){
    await posePoint(near(i,.06));const before=(await snap()).pipa.counts[i];
    for(const gap of [.008,0,.008,.06])await posePoint(near(i,gap));
    assert.equal((await snap()).pipa.counts[i],before,'approach without crossing is silent');
    for(let j=0;j<5;j++)await posePoint(near(i,j%2?.06:-.06));
    assert.equal((await snap()).pipa.counts[i],before+5,'five small plucks on string '+i);
  }
  await posePoint(near(1,.06));const beforeOcclusion=(await snap()).pipa.counts[1];
  for(let j=0;j<4;j++){
    const tip=near(1,j%2?.06:-.06),bad=demoHand();bad[4]={...tip};await posePoint(tip,bad);
  }
  assert.equal((await snap()).pipa.counts[1],beforeOcclusion+4);
  await page.locator('#pipa-lock').click();assert.equal((await snap()).pipa.stringsLocked,true);
  const held=(await snap()).pipa.attacks;await page.waitForTimeout(300);assert.equal((await snap()).pipa.attacks,held);
  await page.locator('[data-pipa-mode="dream"]').click();await page.locator('#pipa-reset').click();await page.locator('#pipa-play').click();
  assert.equal((await snap()).pipa.stringsLocked,true);
  await pose(.05);const start=(await snap()).pipa.index;for(const x of [.3,.4,.52,.8])await pose(x);assert.equal((await snap()).pipa.index,start+1);
  await page.locator('#camera-button').click();await page.locator('#instrument-switch').click();
  assert.equal((await snap()).instrument,'piano');assert.equal((await snap()).pipa.stringsLocked,false);assert.equal((await snap()).pipa.state,'paused');assert(await page.locator('.sidebar #camera-button').isVisible());
  await page.locator('[data-mode="free"]').click();await page.locator('#play-button').click();await page.waitForFunction(()=>window.moonlight.snapshot().audioReady);await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('a');assert.equal((await snap()).audioAttacks,1);
  await page.locator('#library-button').click();await page.locator('[data-song-id="moscow-nights-eop-1024-piano"]').click();await page.waitForFunction(()=>window.moonlight.snapshot().songId==='moscow-nights-eop-1024-piano');
  assert.equal((await snap()).pipa.songId,'jasmine-pipa');const savedIndex=(await snap()).pipa.index;
  await page.locator('#instrument-switch').click();assert.equal((await snap()).pipa.index,savedIndex);assert.equal((await snap()).pipa.songId,'jasmine-pipa');
  await page.locator('#import-button').click();assert(await page.locator('#pipa-library-dialog').isVisible());await page.locator('#pipa-library-dialog .close-dialog').click();
  await page.reload();await page.waitForFunction(()=>window.moonlight?.snapshot().notes===1468);assert.equal((await snap()).instrument,'piano');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:['piano default and round trip','four plucked pitches','mouse sweep','one sweep per melody step','repeated inputs and pause','independent libraries','77 dream steps including repeats','guided correct and wrong strings','camera worker 10 reversals','camera sweep grouping','small repeated crossings on all four strings','thumb occlusion stabilization','fixed strings lifecycle','mobile overflow','piano audio preserved']}));
}finally{await browser.close();}
