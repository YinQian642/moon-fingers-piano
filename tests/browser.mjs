import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import midiPackage from '@tonejs/midi';
import assert from 'node:assert/strict';
await fs.mkdir('.local',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext({viewport:{width:1440,height:1080},permissions:['camera']});
// A canvas stream exercises video inference without relying on host camera hardware.
await context.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const c=canvas.getContext('2d');setInterval(()=>{c.fillStyle='#334433';c.fillRect(0,0,640,480);c.fillStyle='#889988';c.fillRect((Date.now()/20)%580,100,60,60);},40);return canvas.captureStream(25);};});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4192');await page.waitForFunction(()=>window.moonlight?.snapshot().notes===1468);await page.screenshot({path:'.local/desktop.png',fullPage:true});
const snap=()=>page.evaluate(()=>window.moonlight.snapshot());
await page.locator('#play-button').click();await page.waitForFunction(()=>window.moonlight.snapshot().state==='waiting',{},{timeout:30000});
let s=await snap();assert.equal(s.cue.midi,68);assert.equal(s.index,0);await page.waitForTimeout(700);assert.equal((await snap()).position,.5);
await page.keyboard.press('a');assert.equal((await snap()).index,0);await page.keyboard.press('j');assert.equal((await snap()).index,1);
await page.waitForFunction(()=>window.moonlight.snapshot().state==='waiting');await page.locator('#play-button').click();assert.equal((await snap()).state,'paused');
await page.locator('[data-mode="dream"]').click();await page.locator('#play-button').click();await page.waitForFunction(()=>window.moonlight.snapshot().state==='waiting');s=await snap();await page.keyboard.press('a');assert.equal((await snap()).index,s.index+1);
await page.locator('[data-mode="free"]').click();await page.keyboard.press('s');assert.equal((await snap()).mode,'free');assert.equal(await page.locator('#next-pitch').textContent(),'D4 · 293.66 Hz');
await page.locator('#camera-button').click();await page.waitForFunction(()=>window.moonlight.snapshot().workerFrames>3,{},{timeout:60000});assert.equal((await snap()).cameraReady,true);assert.equal(await page.locator('#camera-placeholder').isVisible(),false);
await page.locator('[data-mode="dream"]').click();await page.locator('#reset-button').click();await page.locator('#play-button').click();s=await snap();await page.waitForTimeout(500);assert.equal((await snap()).index,0);assert.equal((await snap()).position,0);
for(let i=0;i<8;i++){await page.keyboard.press(['a','s','d','f','j','k','l',';'][i]);assert.equal((await snap()).index,i+1);}
const afterTaps=await snap();await page.waitForTimeout(800);assert.equal((await snap()).index,afterTaps.index);assert.equal((await snap()).position,afterTaps.position);assert((await snap()).workerFrames>afterTaps.workerFrames);
await page.screenshot({path:'.local/dream.png',fullPage:true});await page.locator('#camera-button').click();assert.equal(await page.locator('#camera-placeholder').isVisible(),true);
// Each occurrence in a repeated-pitch passage needs a distinct mouse/keyboard press.
const repeatedMidi=new midiPackage.Midi(),track=repeatedMidi.addTrack();for(let i=0;i<12;i++)track.addNote({midi:68,time:i*.3,duration:.2,velocity:.8});
await page.locator('#midi-file').setInputFiles({name:'repeated-notes.mid',mimeType:'audio/midi',buffer:Buffer.from(repeatedMidi.toArray())});await page.waitForSelector('#library-dialog[open]');await page.locator('#library-dialog .close-dialog').click();
assert.equal((await snap()).cues,12);assert.equal((await snap()).dreamAccompaniment,false);await page.locator('#play-button').click();
const key=page.locator('.piano-key').first(),rect=await key.boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.waitForTimeout(450);assert.equal((await snap()).index,1);await page.mouse.up();
await key.focus();await page.keyboard.down('Enter');for(let i=0;i<12;i++)await page.keyboard.down('Enter');assert.equal((await snap()).index,2);await page.keyboard.up('Enter');
for(let i=2;i<12;i++){await key.click();assert.equal((await snap()).index,i+1);}await page.waitForTimeout(300);assert.equal((await snap()).index,12);
await page.locator('#accompaniment-toggle').click();assert.equal((await snap()).dreamAccompaniment,true);await page.locator('#accompaniment-toggle').click();assert.equal((await snap()).dreamAccompaniment,false);
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.local/dream-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.setViewportSize({width:1440,height:1080});
await page.locator('#midi-file').setInputFiles('dist/assets/clair-de-lune.mid');await page.waitForSelector('#library-dialog[open]');assert.equal(await page.locator('#melody-track option').count(),2);await page.locator('#melody-track').selectOption('1');await page.locator('#library-dialog .close-dialog').click();
await page.locator('#library-button').click();await page.locator('#builtin-song').click();await page.locator('[data-mode="guided"]').click();await page.reload();await page.waitForFunction(()=>window.moonlight?.snapshot().notes===1468);await page.screenshot({path:'.local/desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.local/mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};});await page.locator('#camera-button').click();await page.waitForFunction(()=>document.querySelector('#camera-message').textContent.includes('允许摄像头'));
assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:['three modes','repeated pitches: one mouse press per note','held Enter cannot repeat','accompaniment toggle','sample decoding','wrong note gate','correct note gate','pause','dream any input','free C4-C5','real MediaPipe init + synthetic video','camera permission denial','MIDI import + track selection','mobile overflow'],snapshot:await snap()}));await browser.close();
