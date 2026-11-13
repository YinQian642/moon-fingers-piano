import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadBytes} from '../dist/lib/hand-assets.js';
import {HandWorker} from '../dist/lib/hand-client.js';

function streaming(chunks,interval,signal){
  let timer;
  return new Response(new ReadableStream({start(controller){let n=0;timer=setInterval(()=>{controller.enqueue(Uint8Array.of(chunks[n++]));if(n===chunks.length){clearInterval(timer);controller.close();}},interval);signal.addEventListener('abort',()=>{clearInterval(timer);if(n<chunks.length)controller.error(new DOMException('Aborted','AbortError'));},{once:true});}}));
}
test('active downloads continue beyond the idle deadline without AbortSignal.timeout',async t=>{
  t.mock.method(AbortSignal,'timeout',()=>{throw Error('unsupported');});
  const progress=[];
  const bytes=await downloadBytes('test',{idleMs:100,onProgress:n=>progress.push(n),fetcher:async(_,{signal})=>streaming([1,2,3,4,5,6],30,signal)});
  assert.deepEqual([...bytes],[1,2,3,4,5,6]);assert(progress.includes(3));
});
test('a stalled download is aborted and retried',async()=>{
  let calls=0,aborted=false;
  const bytes=await downloadBytes('test',{idleMs:20,retries:1,fetcher:async(_,{signal})=>{
    if(++calls===2)return new Response(Uint8Array.of(7,8));
    return new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('stalled'));}));
  }});
  assert.equal(calls,2);assert(aborted);assert.deepEqual([...bytes],[7,8]);
});
test('HTTP errors retry but exhausted failures are actionable',async()=>{
  let calls=0;await assert.rejects(downloadBytes('test',{fetcher:async()=>{calls++;return new Response('',{status:503});}}),/下载失败/);assert.equal(calls,3);
});
test('user cancellation aborts the body and never retries',async()=>{
  const controller=new AbortController();let calls=0;
  const pending=downloadBytes('test',{signal:controller.signal,onProgress:n=>{if(n===1)controller.abort();},fetcher:async(_,{signal})=>{calls++;return streaming([1,2,3],10,signal);}});
  await assert.rejects(pending,{name:'AbortError'});assert.equal(calls,1);
});
test('worker startup timeout permits fallback and cancellation cleans up',async t=>{
  let worker,expire;const original=globalThis.Worker;
  globalThis.Worker=class{constructor(){worker=this;}postMessage(){}terminate(){this.terminated=true;}};
  t.after(()=>{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;});
  t.mock.method(globalThis,'setTimeout',callback=>{expire=callback;return 1;});t.mock.method(globalThis,'clearTimeout',()=>{});
  const h=new HandWorker(),controller=new AbortController();h.assets={};
  const pending=h.startWorker(controller.signal);expire();await assert.rejects(pending,/启动超时/);h.stopWorker();assert(worker.terminated);
  const cancelled=h.startWorker(controller.signal);controller.abort();await assert.rejects(cancelled,/已取消/);h.stopWorker();assert(worker.terminated);
});
