// Classic Worker: the MediaPipe WASM loader needs importScripts.
let detector;
self.onmessage=async({data})=>{
  try{
    if(data.type==='init'){
      if(typeof OffscreenCanvas==='undefined')throw Error('Worker canvas unavailable');
      const {createHandDetector}=await import('./hand-runtime.js');
      const ready=await createHandDetector(data.assets,()=>new OffscreenCanvas(1,1),text=>self.postMessage({type:'status',text}));
      detector=ready.detector;self.postMessage({type:'ready',delegate:ready.delegate});
    }else if(data.type==='frame'){
      const started=performance.now();
      try{const result=detector.detectForVideo(data.bitmap,data.timestamp);self.postMessage({type:'result',result,timestamp:data.timestamp,session:data.session,inferenceMs:performance.now()-started});}
      finally{data.bitmap.close();}
    }
  }catch(error){self.postMessage({type:'error',phase:data.type,message:error.message||String(error),session:data.session});}
};
