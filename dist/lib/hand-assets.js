// Pinned files: validate persistent cache entries before use, including offline reuse.
const CACHE='moonlight-hand-assets-v1';
const SPECS={
  model:['hand_landmarker.task',7819105,'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1','application/octet-stream'],
  bundle:['vision_bundle.mjs',137735,'40f4123dfcd75cfa58add046919cc6f52fde66f009ff582997c09ba54c6ba27c','text/javascript'],
  loader:['wasm/vision_wasm_internal.js',204284,'4a97e2520ba506c680ecd6ba6acfb146888afa0e2746d57f205352bc6ebb82eb','text/javascript'],
  wasm:['wasm/vision_wasm_internal.wasm',9574032,'f00ec4731faa23b3e714d00e88d4d10e2df5c0a427d3a2b4ae6e3526fdd14ef7','application/wasm'],
  loaderNoSIMD:['wasm/vision_wasm_nosimd_internal.js',204137,'927def7b465c51b86e4b3060f93646aca4e27121f4b8fc0483786e407ea9cf1f','text/javascript'],
  wasmNoSIMD:['wasm/vision_wasm_nosimd_internal.wasm',9448638,'3821ea9b1f7fb8c549ef2a064ef5c85750bf375c545a49fd6eea0df44a95f1f4','application/wasm'],
};
function check(signal){if(signal?.aborted)throw new DOMException('识别已取消','AbortError');}

// A deadline measures lack of incoming data, not total download duration.
export async function downloadBytes(url,{signal,onProgress=()=>{},idleMs=30000,retries=2,fetcher=fetch}={}){
  for(let attempt=0;attempt<=retries;attempt++){
    check(signal);
    const controller=new AbortController();let timer,stalled=false;
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
    const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>{stalled=true;controller.abort();},idleMs);};
    try{
      onProgress(0,attempt);touch();
      const response=await fetcher(url,{signal:controller.signal});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      let bytes;
      if(response.body?.getReader){
        const reader=response.body.getReader(),chunks=[];let count=0;touch();
        try{for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);count+=value.byteLength;touch();onProgress(count,attempt);}}
        finally{reader.releaseLock();}
        bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      }else{bytes=new Uint8Array(await response.arrayBuffer());onProgress(bytes.length,attempt);}
      check(signal);return bytes;
    }catch(error){
      check(signal);
      if(attempt===retries)throw Error(stalled?'识别资源下载已停滞，点击开启摄像头重试；已完成的资源会保留。':`识别资源下载失败，请重试（${error.message}）。`);
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();}
  }
}

async function valid(bytes,spec){
  if(bytes.byteLength!==spec[1])return false;
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')===spec[2];
}

export async function loadHandAssets(signal,onStatus=()=>{}){
  check(signal);
  const simd=WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]));
  const specs=[SPECS.model,SPECS.bundle,simd?SPECS.loader:SPECS.loaderNoSIMD,simd?SPECS.wasm:SPECS.wasmNoSIMD];
  let cache;try{cache=await globalThis.caches?.open(CACHE);}catch{/* Private browsing / storage quotas must not block playing. */}
  const sizes=specs.map(()=>0),total=specs.reduce((n,s)=>n+s[1],0);let lastStatus=0;
  const progress=(i,n,attempt=0)=>{
    sizes[i]=Math.min(n,specs[i][1]);const now=Date.now();
    if(now-lastStatus<200&&n!==specs[i][1]&&n!==0)return;lastStatus=now;
    const loaded=sizes.reduce((a,b)=>a+b,0);
    onStatus(`${attempt?'连接重试中，':''}加载识别资源… ${(loaded/1048576).toFixed(1)} / ${(total/1048576).toFixed(1)} MB`);
  };
  onStatus('检查已保存的识别资源…');
  const group=new AbortController(),abort=()=>group.abort();signal?.addEventListener('abort',abort,{once:true});
  let buffers;
  try{
    check(signal);
    buffers=await Promise.all(specs.map(async(spec,i)=>{
      const url=new URL(`../vendor/${spec[0]}`,import.meta.url).href,key=`${url}?sha256=${spec[2]}`;
      let bytes;
      try{const hit=await cache?.match(key);if(hit){const cached=new Uint8Array(await hit.arrayBuffer());if(await valid(cached,spec))bytes=cached;else await cache.delete(key);}}catch{/* Use the network when storage is unavailable. */}
      check(group.signal);
      if(!bytes){
        bytes=await downloadBytes(url,{signal:group.signal,onProgress:(n,attempt)=>progress(i,n,attempt)});
        if(!await valid(bytes,spec))throw Error('识别资源不完整，请重新开启摄像头下载。');
        check(group.signal);
        try{await cache?.put(key,new Response(bytes,{headers:{'Content-Type':spec[3]}}));}catch{/* Full cache is not fatal. */}
      }
      progress(i,bytes.byteLength);return bytes;
    }));
  }catch(error){group.abort();throw error;}
  finally{signal?.removeEventListener('abort',abort);}
  check(signal);
  const urls=buffers.slice(1).map((bytes,i)=>URL.createObjectURL(new Blob([bytes],{type:specs[i+1][3]})));
  return {modelAssetBuffer:buffers[0],bundleUrl:urls[0],files:{wasmLoaderPath:urls[1],wasmBinaryPath:urls[2]},release(){urls.forEach(url=>URL.revokeObjectURL(url));}};
}
