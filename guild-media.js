/* New photos use private R2 through an authenticated Worker. Legacy paths remain readable. */
window.GuildMedia = (() => {
  const pathRE=/^[0-9a-f-]{36}\/(?:[0-9a-f-]{36}\/)?[0-9a-f-]{36}\.webp$/;
  function base(){try{const u=new URL(window.GUILD_MEDIA_CONFIG?.workerURL);return u.protocol==='https:'&&u.pathname==='/'&&!u.search&&!u.hash?u.origin:'';}catch{return '';}}
  function url(path){return typeof path==='string'&&path.startsWith('r2:')&&pathRE.test(path.slice(3))&&base()?base()+'/images/'+path.slice(3):'';}
  function safe(value){try{const u=new URL(value);return !!base()&&u.origin===base()&&u.pathname.startsWith('/images/')&&pathRE.test(u.pathname.slice(8));}catch{return false;}}
  async function request(path,method,blob){
    const endpoint=url(path);if(!endpoint)throw Error('写真の保存先を準備中です。運営者にお問い合わせください。');
    const {data,error}=await GuildAuth.getClient().auth.getSession();
    if(error||!data.session?.access_token)throw Error('ログインし直してください。');
    const response=await fetch(endpoint,{method,headers:{Authorization:'Bearer '+data.session.access_token,...(blob?{'Content-Type':'image/webp'}:{})},body:blob,signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error(response.status===413?'写真は700KB以内にしてください。':'写真を保存・削除できませんでした。接続とログイン状態をご確認ください。');
  }
  async function upload(key,blob){const path='r2:'+key;await request(path,'PUT',blob);return path;}
  async function remove(path,bucket){
    try{if(path?.startsWith('r2:'))await request(path,'DELETE');else if(path){const {error}=await GuildAuth.getClient().storage.from(bucket).remove([path]);if(error)throw error;}return {error:null};}catch(error){return {error};}
  }
  async function compress(file,avatar=false){
    if(!file||!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>5*1024*1024)throw Error('JPEG・PNG・WebP・GIFの画像を5MB以内で選んでください。');
    const bitmap=await createImageBitmap(file);
    try{
      const canvas=document.createElement('canvas'),edge=Math.min(bitmap.width,bitmap.height);
      let scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
      for(let attempt=0;attempt<8;attempt++){
        canvas.width=avatar?Math.max(1,Math.round(Math.min(512,edge)*Math.pow(.8,attempt))):Math.max(1,Math.round(bitmap.width*scale));
        canvas.height=avatar?canvas.width:Math.max(1,Math.round(bitmap.height*scale));
        if(avatar)canvas.getContext('2d').drawImage(bitmap,(bitmap.width-edge)/2,(bitmap.height-edge)/2,edge,edge,0,0,canvas.width,canvas.height);
        else canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
        for(const quality of [.86,.8,.74,.68]){
          const blob=await new Promise(ok=>canvas.toBlob(ok,'image/webp',quality));
          if(!blob||blob.type!=='image/webp')throw Error('画像を処理できません。別の画像をお試しください。');
          if(blob.size<=500*1024||(quality===.68&&blob.size<=700*1024))return blob;
        }
        scale*=.8;
      }
      throw Error('写真を700KB以内にできませんでした。別の画像をお試しください。');
    }finally{bitmap.close();}
  }
  return {url,safe,upload,remove,compress};
})();
