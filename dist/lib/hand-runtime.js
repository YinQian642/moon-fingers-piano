export async function createHandDetector(assets,makeCanvas,onStatus=()=>{},isCancelled=()=>false){
  const {HandLandmarker}=await import(assets.bundleUrl);
  for(const delegate of ['GPU','CPU']){
    if(isCancelled())throw new DOMException('识别已取消','AbortError');
    let detector;
    try{
      onStatus(delegate==='GPU'?'资源就绪，正在启动识别…':'正在尝试兼容识别…');
      // Explicit canvas bypasses MediaPipe's user-agent-based document fallback in a Worker.
      detector=await HandLandmarker.createFromOptions(assets.files,{
        baseOptions:{modelAssetBuffer:assets.modelAssetBuffer,delegate},canvas:makeCanvas(),
        runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.55,
      });
      if(isCancelled())throw new DOMException('识别已取消','AbortError');
      const input=makeCanvas();input.width=32;input.height=32;input.getContext('2d').fillRect(0,0,32,32);
      detector.detectForVideo(input,0); // Validate the image path before reporting ready.
      return {detector,delegate};
    }catch(error){detector?.close();if(isCancelled()||delegate==='CPU')throw error;}
  }
}
