// Classic worker permits MediaPipe's WASM loader to use importScripts.
let detector;
self.onmessage=async ({data})=>{
  try {
    if(data.type==='init'){
      self.postMessage({type:'status',text:'加载识别模型…'});
      const {FilesetResolver,HandLandmarker}=await import('../vendor/vision_bundle.mjs');
      const response=await fetch(new URL('../vendor/hand_landmarker.task',self.location.href),{signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw Error(`模型加载失败 (${response.status})`);
      const modelAssetBuffer=new Uint8Array(await response.arrayBuffer());
      const files=await FilesetResolver.forVisionTasks(new URL('../vendor/wasm',self.location.href).href);
      self.postMessage({type:'status',text:'启动识别…'});
      const opts={baseOptions:{modelAssetBuffer,delegate:'GPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.55};
      try{detector=await HandLandmarker.createFromOptions(files,opts);}catch{opts.baseOptions.delegate='CPU';detector=await HandLandmarker.createFromOptions(files,opts);}
      self.postMessage({type:'ready',delegate:opts.baseOptions.delegate});
    }else if(data.type==='frame'){
      const started=performance.now();
      try{const result=detector.detectForVideo(data.bitmap,data.timestamp);self.postMessage({type:'result',result,timestamp:data.timestamp,session:data.session,inferenceMs:performance.now()-started});}finally{data.bitmap.close();}
    }
  }catch(error){self.postMessage({type:'error',phase:data.type,message:error.message||String(error),session:data.session});}
};
