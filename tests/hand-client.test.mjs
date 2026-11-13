import test from 'node:test';
import assert from 'node:assert/strict';
import {HandWorker} from '../dist/lib/hand-client.js';

test('cold model startup can finish after 70 seconds without a false cancellation',async t=>{
  let worker,deadline;
  t.mock.method(globalThis,'setTimeout',(callback,delay)=>{deadline={callback,delay,cleared:false};return deadline;});
  t.mock.method(globalThis,'clearTimeout',id=>{if(id)id.cleared=true;});
  const previous=globalThis.Worker;
  globalThis.Worker=class{constructor(){worker=this;}postMessage(){}terminate(){this.terminated=true;}};
  t.after(()=>{if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous;});
  const client=new HandWorker(()=>{}),pending=client.init();
  assert(deadline.delay>110000&&deadline.delay<=180000);
  worker.onmessage({data:{type:'ready'}});await pending;
  assert.equal(client.ready,true);assert.equal(deadline.cleared,true);assert(!worker.terminated);
  client.close();assert.equal(worker.terminated,true);
});

test('startup timeout preserves its reason while terminating the download worker',async t=>{
  let worker,expire;
  t.mock.method(globalThis,'setTimeout',callback=>{expire=callback;return 1;});
  t.mock.method(globalThis,'clearTimeout',()=>{});
  const previous=globalThis.Worker;
  globalThis.Worker=class{constructor(){worker=this;}postMessage(){}terminate(){this.terminated=true;}};
  t.after(()=>{if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous;});
  const client=new HandWorker(()=>{}),pending=client.init();expire();
  await assert.rejects(pending,{message:'识别启动超时，请重试。'});
  assert.equal(client.ready,false);assert.equal(client.worker,null);assert.equal(worker.terminated,true);
});
