import {loadHandAssets} from './hand-assets.js';
import {createHandDetector} from './hand-runtime.js';

export class HandWorker {
  constructor(onStatus=()=>{}){this.onStatus=onStatus;this.ready=false;this.busy=false;this.frames=0;this.inferenceMs=0;this.generation=0;}
  init(){
    if(this.ready)return Promise.resolve();if(this.loading)return this.loading;
    const generation=++this.generation,controller=new AbortController();this.controller=controller;
    this.loading=(async()=>{
      const assets=await loadHandAssets(controller.signal,text=>{if(!controller.signal.aborted)this.onStatus(text);});
      if(controller.signal.aborted){assets.release();throw Error('识别已取消');}this.assets=assets;
      try{
        if(typeof Worker==='undefined'||typeof createImageBitmap!=='function')throw Error('Worker image input unavailable');
        await this.startWorker(controller.signal);
      }catch(error){
        if(controller.signal.aborted)throw error;
        this.stopWorker();this.onStatus('正在切换兼容识别…');
        await this.startMain(controller.signal);
      }
      if(controller.signal.aborted)throw Error('识别已取消');
      this.ready=true;
    })().catch(error=>{if(this.generation===generation)this.close();throw error;});
    return this.loading;
  }
  startWorker(signal){
    return new Promise((resolve,reject)=>{
      const worker=this.worker=new Worker(new URL('./hand-worker.js?v=2',import.meta.url));
      let settled=false;
      const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);error?reject(error):resolve();};
      const abort=()=>finish(Error('识别已取消'));
      const timer=setTimeout(()=>finish(Error('识别线程启动超时')),20000);
      signal.addEventListener('abort',abort,{once:true});
      worker.onmessage=({data})=>{
        if(this.worker!==worker)return;
        if(data.type==='status')this.onStatus(data.text);
        if(data.type==='ready'){this.backend='worker';this.delegate=data.delegate;finish();}
        if(data.type==='result'){clearTimeout(this.frameTimer);const resolveFrame=this.resolveFrame;this.resolveFrame=this.rejectFrame=null;resolveFrame?.(data);}
        if(data.type==='error'){const error=Error(data.message);if(data.phase==='init')finish(error);else this.rejectFrame?.(error);}
      };
      worker.onerror=e=>{const error=Error(e.message||'识别线程中断');finish(error);this.rejectFrame?.(error);};
      try{worker.postMessage({type:'init',assets:{modelAssetBuffer:this.assets.modelAssetBuffer,bundleUrl:this.assets.bundleUrl,files:this.assets.files}});}catch(error){finish(error);}
    });
  }
  async startMain(signal){
    this.backend='main';
    let expired=false,timer,abort;
    const task=createHandDetector(this.assets,()=>document.createElement('canvas'),text=>{if(!signal.aborted&&!expired)this.onStatus(text);},()=>signal.aborted||expired);
    try{
      const result=await Promise.race([task,new Promise((_,reject)=>{
        timer=setTimeout(()=>{expired=true;reject(Error('识别初始化超时，请重新开启摄像头。'));},45000);
        abort=()=>reject(Error('识别已取消'));signal.addEventListener('abort',abort,{once:true});
      })]);
      if(signal.aborted){result.detector.close();throw Error('识别已取消');}
      this.mainDetector=result.detector;this.backend='main';this.delegate=result.delegate;
    }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
  async detect(video,timestamp,session){
    if(!this.ready||this.busy)return null;
    const generation=this.generation;this.busy=true;
    try{
      let data;
      if(this.backend==='worker'){
        try{
          const bitmap=await createImageBitmap(video);
          if(generation!==this.generation||!this.worker){bitmap.close();return null;}
          data=await new Promise((resolve,reject)=>{
            this.resolveFrame=resolve;this.rejectFrame=reject;
            this.frameTimer=setTimeout(()=>reject(Error('识别帧处理超时')),10000);
            try{this.worker.postMessage({type:'frame',bitmap,timestamp,session},[bitmap]);}catch(error){bitmap.close();reject(error);}
          });
        }catch(error){
          if(generation!==this.generation)return null;
          this.stopWorker();this.onStatus('正在切换兼容识别…');await this.startMain(this.controller.signal);this.onStatus('');
        }
      }
      if(generation!==this.generation)return null;
      if(this.backend==='main'){
        const start=performance.now(),result=this.mainDetector.detectForVideo(video,timestamp);
        data={result,timestamp,session,inferenceMs:performance.now()-start};
      }
      if(data){this.frames++;this.inferenceMs=data.inferenceMs;}return data;
    }finally{if(generation===this.generation){clearTimeout(this.frameTimer);this.busy=false;this.resolveFrame=this.rejectFrame=null;}}
  }
  stopWorker(){clearTimeout(this.frameTimer);this.worker?.terminate();this.worker=null;this.resolveFrame?.(null);this.resolveFrame=this.rejectFrame=null;}
  close(){
    ++this.generation;this.controller?.abort();this.stopWorker();this.mainDetector?.close();this.mainDetector=null;
    this.assets?.release();this.assets=null;this.ready=false;this.busy=false;this.loading=null;
  }
}
