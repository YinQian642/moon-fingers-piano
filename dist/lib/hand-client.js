export class HandWorker {
  constructor(onStatus){this.onStatus=onStatus;this.ready=false;this.busy=false;this.frames=0;this.inferenceMs=0;}
  init(){
    if(this.ready)return Promise.resolve();if(this.loading)return this.loading;
    this.worker=new Worker(new URL('./hand-worker.js',import.meta.url));
    this.loading=new Promise((resolve,reject)=>{
      this.rejectInit=reject;
      this.timer=setTimeout(()=>{this.close();reject(Error('识别启动超时，请重试。'));},70000);
      this.worker.onmessage=({data})=>{
        if(data.type==='status')this.onStatus(data.text);
        if(data.type==='ready'){clearTimeout(this.timer);this.ready=true;resolve();}
        if(data.type==='result'){this.busy=false;this.frames++;this.inferenceMs=data.inferenceMs;this.resolveFrame?.(data);this.resolveFrame=null;this.rejectFrame=null;}
        if(data.type==='error'){this.busy=false;if(data.phase==='init'){clearTimeout(this.timer);reject(Error(data.message));}else this.rejectFrame?.(Error(data.message));}
      };
      this.worker.onerror=e=>{clearTimeout(this.timer);this.busy=false;const error=Error(e.message||'识别线程中断');reject(error);this.rejectFrame?.(error);};
      this.worker.postMessage({type:'init'});
    }).catch(e=>{this.close();throw e;});return this.loading;
  }
  async detect(video,timestamp,session){
    if(!this.ready||this.busy)return null;
    this.busy=true;
    try{
      const bitmap=await createImageBitmap(video);
      if(!this.worker){bitmap.close();this.busy=false;return null;}
      return await new Promise((resolve,reject)=>{this.resolveFrame=resolve;this.rejectFrame=reject;this.worker.postMessage({type:'frame',bitmap,timestamp,session},[bitmap]);});
    }catch(e){this.busy=false;throw e;}
  }
  close(){clearTimeout(this.timer);const reject=this.rejectInit;this.rejectInit=null;reject?.(Error('识别已取消'));this.worker?.terminate();this.worker=null;this.ready=false;this.busy=false;this.loading=null;this.resolveFrame?.(null);this.resolveFrame=null;}
}
