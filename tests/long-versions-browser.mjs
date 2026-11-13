import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[],results=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:4192');
 await page.waitForFunction(()=>window.moonlight?.snapshot().notes===1468);
 for(const [id,notes,cues,key]of [['moscow-nights-21405ff9-piano',1928,216,'C · 小调'],['merry-christmas-mr-lawrence-murashin-piano',2272,640,'Db · 大调']]){
  await page.locator('#library-button').click();
  await page.locator(`[data-song-id="${id}"]`).click();
  await page.waitForFunction(id=>window.moonlight.snapshot().songId===id,id);
  let state=await page.evaluate(()=>window.moonlight.snapshot());
  assert.equal(state.notes,notes);assert.equal(state.cues,cues);assert.equal(state.revision,'r0001');
  assert.equal(await page.locator('#pitch-label').textContent(),key);
  await page.locator('button[data-mode="dream"]').click();await page.locator('#reset-button').click();
  await page.locator('#play-button').click();await page.waitForFunction(()=>window.moonlight.snapshot().audioReady);
  for(let i=0;i<16;i++){await page.locator('[data-slot="0"]').click();assert.equal((await page.evaluate(()=>window.moonlight.snapshot())).index,i+1);}
  await page.waitForTimeout(300);assert.equal((await page.evaluate(()=>window.moonlight.snapshot())).index,16);
  await page.locator('#reset-button').click();await page.locator('#accompaniment-toggle').click();
  const before=(await page.evaluate(()=>window.moonlight.snapshot())).audioAttacks;
  await page.keyboard.press('a');await page.waitForTimeout(200);
  state=await page.evaluate(()=>window.moonlight.snapshot());assert.ok(state.audioAttacks>before+1);
  await page.locator('#accompaniment-toggle').click();
  results.push({id,notes,cues,revision:state.revision,distinctDreamTaps:16,accompaniment:true});
 }
 await page.setViewportSize({width:390,height:844});await page.locator('#library-button').click();
 assert.equal(await page.locator('[data-song-id]').count(),3);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await fs.mkdir('.local',{recursive:true});await page.screenshot({path:'.local/long-versions-library.png',fullPage:true});
 await page.locator('[data-song-id="moscow-nights-eop-1024-piano"]').click();
 await page.waitForFunction(()=>window.moonlight.snapshot().notes===199);
 assert.deepEqual(errors,[]);
 const report={valid:true,newSongs:results,oldShortVersionPreserved:true,browserErrors:errors,actualListening:false};
 await fs.writeFile('.local/long-versions-browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
