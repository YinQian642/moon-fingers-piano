import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const base=process.env.TEST_URL||'http://127.0.0.1:4192';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const workerSource=await fs.readFile('dist/lib/hand-worker.js','utf8');
const scenarios=[
  {name:'normal',backend:'worker'},
  {name:'same-origin scripts only',backend:'worker',policy:true},
  {name:'same-origin scripts only with main fallback',backend:'main',policy:true,setup:()=>{window.createImageBitmap=undefined;}},
  {name:'Safari 16 UA branch',backend:'worker',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'},
  {name:'iOS Chrome UA branch',backend:'worker',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1'},
  {name:'without AbortSignal.timeout',backend:'worker',setup:()=>{AbortSignal.timeout=undefined;}},
  {name:'without Worker canvas',backend:'main',workerPrefix:'self.OffscreenCanvas=undefined;'},
  {name:'without Worker WebGL',backend:'main',workerPrefix:'const getContext=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(type,...args){return type.startsWith("webgl")?null:getContext.call(this,type,...args);};'},
  {name:'without ImageBitmap',backend:'main',setup:()=>{window.createImageBitmap=undefined;}},
  {name:'without persistent storage',backend:'worker',setup:()=>{Storage.prototype.getItem=()=>{throw Error('disabled');};CacheStorage.prototype.open=()=>Promise.reject(Error('disabled'));}},
  {name:'without SIMD',backend:'worker',setup:()=>{WebAssembly.validate=()=>false;}},
  {name:'worker initialization hangs',backend:'main',workerBody:'self.onmessage=()=>{};',setup:()=>{const native=setTimeout;window.setTimeout=(fn,ms,...args)=>native(fn,ms===20000?300:ms,...args);}},
  {name:'first worker frame fails',backend:'main',workerSuffix:'const original=self.onmessage;self.onmessage=e=>{if(e.data.type==="frame"){e.data.bitmap.close();self.postMessage({type:"error",phase:"frame",message:"simulated image transfer failure"});}else original(e);};'},
  {name:'full model unavailable, recover verified parts',backend:'worker',retry:true},
];
async function run(page){
  return page.evaluate(async()=>{
    const {HandWorker}=await import('./lib/hand-client.js');
    const messages=[],h=new HandWorker(text=>messages.push(text)),started=performance.now();window.testHands=h;
    try{
      await h.init();const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;canvas.getContext('2d').fillRect(0,0,64,64);
      await h.detect(canvas,performance.now(),1);
      return {backend:h.backend,frames:h.frames,ms:Math.round(performance.now()-started),messages};
    }finally{h.close();}
  });
}
let slowServer;
try{
  if(process.argv.includes('--slow')){
    const root=path.resolve('dist');
    slowServer=http.createServer(async(req,res)=>{
      const p=new URL(req.url,'http://localhost').pathname,target=path.resolve(root,'.'+(p==='/'?'/index.html':p));
      if(!target.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
      try{
        const bytes=await fs.readFile(target),mime={'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.html':'text/html','.json':'application/json','.css':'text/css'};
        res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Content-Length':bytes.length});
        if(p.endsWith('hand_landmarker.task')){
          let offset=0;const timer=setInterval(()=>{res.write(bytes.subarray(offset,offset+12*1024));offset+=12*1024;if(offset>=bytes.length){clearInterval(timer);res.end();}},100);res.on('close',()=>clearInterval(timer));
        }else res.end(bytes);
      }catch{res.writeHead(404);res.end();}
    });
    await new Promise(r=>slowServer.listen(0,'127.0.0.1',r));
    const page=await browser.newPage();await page.goto(`http://127.0.0.1:${slowServer.address().port}`);
    const result=await run(page);assert(result.ms>60000);assert.equal(result.frames,1);assert(result.messages.filter(m=>m.includes('%')).length>20);
    console.log(JSON.stringify({check:'continuous model download beyond 60 seconds',ms:result.ms,backend:result.backend,passed:true}));
  }else{
    for(const s of scenarios){
      const context=await browser.newContext({userAgent:s.userAgent});
      if(s.setup)await context.addInitScript(s.setup);
      if(s.policy){
        const policy="script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'";
        const applyPolicy=async route=>{
          const response=await route.fetch();
          await route.fulfill({response,headers:{...response.headers(),'content-security-policy':policy}});
        };
        await context.route(new URL('./',base).href,applyPolicy);
        await context.route('**/lib/hand-worker.js*',applyPolicy);
      }
      if(s.workerPrefix||s.workerSuffix||s.workerBody)await context.route('**/lib/hand-worker.js*',r=>r.fulfill({contentType:'text/javascript',body:s.workerBody||`${s.workerPrefix||''}\n${workerSource}\n${s.workerSuffix||''}`}));
      let requests=0;
      if(s.retry)await context.route('**/vendor/hand_landmarker.task',r=>++requests===1?r.fulfill({status:503,body:'temporary failure'}):r.continue());
      const page=await context.newPage();await page.goto(base);const result=await run(page);
      assert.equal(result.backend,s.backend,s.name);assert.equal(result.frames,1,s.name);if(s.retry)assert.equal(requests,1);
      if(s.name==='normal'){
        let downloads=0;await context.route(/\.(task|wasm)$/,r=>{downloads++;return r.abort();});
        const cached=await run(page);assert.equal(cached.frames,1);assert.equal(downloads,0,'model and WASM reused without network');
        await context.unroute(/\.(task|wasm)$/);
        await page.evaluate(async()=>{const cache=await caches.open('moonlight-hand-assets-v1');for(const key of await cache.keys())if(key.url.includes('hand_landmarker.task'))await cache.put(key,new Response('corrupt'));});
        let repaired=0;await context.route('**/vendor/hand_landmarker.task',r=>{repaired++;return r.continue();});
        assert.equal((await run(page)).frames,1);assert.equal(repaired,1,'corrupt cache refetched');
      }
      console.log(JSON.stringify({check:s.name,backend:result.backend,ms:result.ms,passed:true}));await context.close();
    }
    // Cancellation must reject promptly and never resurrect the old initialization.
    const context=await browser.newContext();
    await context.route('**/vendor/hand_landmarker.task',async r=>{await new Promise(resolve=>setTimeout(resolve,700));try{await r.continue();}catch{}});
    const page=await context.newPage();await page.goto(base);
    const cancellation=await page.evaluate(async()=>{
      const {HandWorker}=await import('./lib/hand-client.js');const h=new HandWorker();const pending=h.init().then(()=>false,()=>true);
      setTimeout(()=>h.close(),100);const rejected=await pending;await new Promise(r=>setTimeout(r,900));return {rejected,ready:h.ready,worker:!!h.worker};
    });assert.deepEqual(cancellation,{rejected:true,ready:false,worker:false});await context.close();
    console.log(JSON.stringify({check:'cancel startup without late completion',passed:true}));
  }
}finally{await browser.close();slowServer?.close();}
