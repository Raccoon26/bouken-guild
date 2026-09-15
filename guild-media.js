window.GuildMedia = (() => {
  const workerURL = new URL('./vendor/webp/worker.mjs', document.currentScript.src).href;
  const pathRE=/^[0-9a-f-]{36}\/(?:[0-9a-f-]{36}\/)?[0-9a-f-]{36}\.webp$/;
  function base(){try{const u=new URL(window.GUILD_MEDIA_CONFIG?.workerURL);return u.protocol==='https:'&&u.pathname==='/'&&!u.search&&!u.hash?u.origin:'';}catch{return '';}}
  function url(path){return typeof path==='string'&&path.startsWith('r2:')&&pathRE.test(path.slice(3))&&base()?base()+'/images/'+path.slice(3):'';}
  function safe(value){try{const u=new URL(value);return !!base()&&u.origin===base()&&u.pathname.startsWith('/images/')&&pathRE.test(u.pathname.slice(8));}catch{return false;}}
  async function request(path,method,blob){
    const endpoint=url(path);if(!endpoint)throw Error('写真の保存先を準備中です。運営者にお問い合わせください。');
    const {data,error}=await GuildAuth.getClient().auth.getSession();
    if(error||!data.session?.access_token)throw Error('ログインし直してください。');
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),30000);
    try {
      const response=await fetch(endpoint,{method,headers:{Authorization:'Bearer '+data.session.access_token,...(blob?{'Content-Type':'image/webp'}:{})},body:blob,signal:controller.signal});
      if(!response.ok)throw Error((response.status===413?'写真は700KB以内にしてください。':'写真を保存・削除できませんでした。接続とログイン状態をご確認ください。')+'（確認コード：HTTP_'+response.status+'）');
    } catch(error) {
      if(controller.signal.aborted)throw Error('通信がタイムアウトしました。再読み込みして保存状態をご確認ください。');
      if(error instanceof TypeError)throw Error('写真の保存先に接続できませんでした。通信状態をご確認ください。');
      throw error;
    } finally {clearTimeout(timer);}
  }
  async function upload(key,blob){const path='r2:'+key;await request(path,'PUT',blob);return path;}
  async function remove(path,bucket){
    try{if(path?.startsWith('r2:'))await request(path,'DELETE');else if(path){const {error}=await GuildAuth.getClient().storage.from(bucket).remove([path]);if(error)throw error;}return {error:null};}catch(error){return {error};}
  }
  function readImage(file) {
    return new Promise((resolve,reject)=>{
      const image=new Image(), src=URL.createObjectURL(file);
      const timer=setTimeout(()=>finish(false),30000);
      function finish(ok){
        clearTimeout(timer); image.onload=image.onerror=null; URL.revokeObjectURL(src);
        if(ok&&image.naturalWidth&&image.naturalHeight)resolve(image);
        else {image.src='';reject(Error('写真を読み込めませんでした。別のJPEG・PNG画像をお試しください。'));}
      }
      image.onload=()=>finish(true);image.onerror=()=>finish(false);image.src=src;
    });
  }
  function encoder() {
    let worker=null, serial=0;
    return {
      async encode(pixels,quality){
        if(!worker)worker=new Worker(workerURL,{type:'module'});
        const current=worker, id=++serial;
        return new Promise((resolve,reject)=>{
          const fail=()=>{cleanup();current.terminate();worker=null;reject(Error('画像変換機能を読み込めないか、変換に失敗しました。再読み込みしてお試しください。（確認コード：WEBP_ENCODER）'));};
          const timer=setTimeout(fail,45000);
          const done=({data})=>{if(data.id!==id)return;if(data.error){fail();return;}cleanup();resolve(new Blob([data.bytes],{type:'image/webp'}));};
          function cleanup(){clearTimeout(timer);current.removeEventListener('message',done);current.removeEventListener('error',fail);current.removeEventListener('messageerror',fail);}
          current.addEventListener('message',done);current.addEventListener('error',fail);current.addEventListener('messageerror',fail);
          try{current.postMessage({id,pixels:pixels.data,width:pixels.width,height:pixels.height,quality:Math.round(quality*100)});}catch{fail();}
        });
      },
      close(){worker?.terminate();worker=null;}
    };
  }
  async function compress(file,avatar=false){
    if(!file||!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>5*1024*1024)throw Error('JPEG・PNG・WebP・GIFの画像を5MB以内で選んでください。');
    const image=await readImage(file), canvas=document.createElement('canvas'), fallback=encoder();
    const width=image.naturalWidth,height=image.naturalHeight,edge=Math.min(width,height);
    let scale=Math.min(1,1600/Math.max(width,height)),useFallback=false;
    try{
      for(let attempt=0;attempt<8;attempt++){
        canvas.width=avatar?Math.max(1,Math.round(Math.min(512,edge)*Math.pow(.8,attempt))):Math.max(1,Math.round(width*scale));
        canvas.height=avatar?canvas.width:Math.max(1,Math.round(height*scale));
        const context=canvas.getContext('2d');
        if(!context)throw Error('画像を処理できませんでした。');
        if(avatar)context.drawImage(image,(width-edge)/2,(height-edge)/2,edge,edge,0,0,canvas.width,canvas.height);
        else context.drawImage(image,0,0,canvas.width,canvas.height);
        let pixels;
        for(const quality of [.86,.8,.74,.68]){
          let blob;
          if(!useFallback){
            blob=await new Promise(resolve=>{
              const timer=setTimeout(()=>resolve(null),10000);
              try{canvas.toBlob(result=>{clearTimeout(timer);resolve(result);},'image/webp',quality);}catch{clearTimeout(timer);resolve(null);}
            });
            if(!blob||blob.type!=='image/webp')useFallback=true;
          }
          if(useFallback){pixels ||= context.getImageData(0,0,canvas.width,canvas.height);blob=await fallback.encode(pixels,quality);}
          if(blob.size>0&&(blob.size<=500*1024||(quality===.68&&blob.size<=700*1024)))return blob;
        }
        scale*=.8;
      }
      throw Error('写真を700KB以内にできませんでした。別の画像をお試しください。');
    }finally{fallback.close();canvas.width=canvas.height=1;image.src='';}
  }
  return {url,safe,upload,remove,compress};
})();
