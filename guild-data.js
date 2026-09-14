/* Shared journals. Authorization is enforced by Supabase grants and RLS. */
window.GuildData = (() => {
  const bucket = 'bouken-journal-images';
  const uuidPattern = /^[0-9a-f-]{36}$/;
  const pathPattern = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;
  const columns = '*,author:profiles!journals_author_id_fkey(nickname,avatar_path),journal_likes(count),journal_comments(count)';
  function client() {
    const c = GuildAuth.getClient();
    if (!c) throw Error('接続を準備しています。時間をおいて再読み込みしてください。');
    return c;
  }
  function owner() {
    const who = GuildAuth.identity();
    if (!who.ready || !who.id || who.error) throw Error('ログイン状態をマイページで確認してください。');
    return who.id;
  }
  function fail(error) {
    if (['42501','PGRST301'].includes(error?.code)) return Error('この操作は許可されていません。ログイン状態をご確認ください。');
    if (['42P01','42703','PGRST200','PGRST204','PGRST205'].includes(error?.code)) return Error('日誌の保存設定が未完了です。運営者にお問い合わせください。');
    return Error('通信または保存に失敗しました。入力内容を残したまま、もう一度お試しください。');
  }
  async function pages(build) {
    const rows=[];
    for (let offset=0;;offset+=500) {
      const {data,error} = await build().range(offset,offset+499);
      if(error) throw fail(error);
      rows.push(...data);
      if(data.length<500) return rows;
    }
  }
  function map(row) {
    return {...row,member:row.author_id,author:row.author?.nickname || '冒険者',avatar:row.author?.avatar_path,
      text:row.content,date:row.adventure_date,place:row.prefecture,location:row.place,tags:row.tags||[],
      likesEnabled:row.likes_enabled,commentsEnabled:row.comments_enabled,baseLikes:row.journal_likes?.[0]?.count||0,
      commentCount:row.journal_comments?.[0]?.count||0,cloud:true,image:''};
  }
  async function images(rows) {
    const paths=[...new Set(rows.map(r=>r.image_path).filter(p=>pathPattern.test(p||'')))];
    const urls=new Map();
    for(let i=0;i<paths.length;i+=100) {
      const {data,error}=await client().storage.from(bucket).createSignedUrls(paths.slice(i,i+100),3600);
      if(!error) (data||[]).forEach(item=>{if(item.signedUrl) urls.set(item.path,item.signedUrl);});
    }
    return rows.map(r=>({...r,image:urls.get(r.image_path)||'',imageUnavailable:!!r.image_path&&!urls.has(r.image_path)}));
  }
  async function list() {
    const rows=await pages(()=>client().from('journals').select(columns).eq('published',true).order('created_at',{ascending:false}).order('id'));
    return images(rows.map(map));
  }
  async function members() {
    return pages(()=>client().from('profiles').select('id,nickname,bio,joined_at,rank,title,experience,avatar_path').order('joined_at').order('id'));
  }
  async function raw(id) {
    if(!uuidPattern.test(id)) throw Error('日誌が見つかりません。');
    const {data,error}=await client().from('journals').select(columns).eq('id',id).maybeSingle();
    if(error) throw fail(error);
    return data;
  }
  async function one(id) {
    const row=await raw(id);
    return row ? (await images([map(row)]))[0] : null;
  }
  async function preparePhoto(file) {
    if(!file || !['image/jpeg','image/png','image/webp','image/gif'].includes(file.type) || file.size>5*1024*1024) throw Error('JPEG・PNG・WebP・GIFの画像を5MB以内で選んでください。');
    const bitmap=await createImageBitmap(file);
    try {
      const factor=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)), canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*factor));canvas.height=Math.max(1,Math.round(bitmap.height*factor));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.85));
      if(!blob||blob.type!=='image/webp'||blob.size>5*1024*1024) throw Error('画像を処理できません。別の画像をお試しください。');
      return blob;
    } finally {bitmap.close();}
  }
  function same(row,payload) {
    return Object.entries(payload).every(([key,value])=>JSON.stringify(row[key])===JSON.stringify(value));
  }
  async function cleanup(path) {
    if(!path) return '';
    try {
      const {error}=await client().storage.from(bucket).remove([path]);
      return error ? '以前の写真を削除できませんでした。運営者にお問い合わせください。' : '';
    } catch {return '以前の写真を削除できませんでした。運営者にお問い合わせください。';}
  }
  // op remains attached to the form, preserving its UUID across uncertain responses.
  async function save(op,fields,photo,removePhoto=false) {
    const author=owner();
    if(op.author!==author) throw Error('ログイン中のアカウントが変わりました。日誌一覧から開き直してください。');
    const payload={title:fields.title.trim(),content:fields.content.trim(),adventure_date:fields.adventure_date,
      prefecture:fields.prefecture,place:fields.place.trim(),tags:fields.tags,
      likes_enabled:!!fields.likes_enabled,comments_enabled:!!fields.comments_enabled,published:true,
      image_path:removePhoto?null:(op.base?.image_path||null)};
    if(!payload.title||payload.title.length>120||!payload.content||payload.content.length>20000||payload.tags.length>10) throw Error('タイトル・本文・タグの入力をご確認ください。');
    if(photo) {
      if(op.uploadBlob!==photo) {op.uploadPath=null;op.uploadBlob=photo;}
      if(!op.uploadPath) {
        const path=author+'/'+op.id+'/'+crypto.randomUUID()+'.webp';
        const {error}=await client().storage.from(bucket).upload(path,photo,{contentType:'image/webp',upsert:false});
        if(error) throw Error('写真をアップロードできませんでした。接続と写真の保存設定をご確認ください。');
        op.uploadPath=path;
      }
      payload.image_path=op.uploadPath;
    }
    let row;
    try {
      if(op.base) {
        const {data,error}=await client().from('journals').update(payload).eq('id',op.id).eq('author_id',author).eq('updated_at',op.base.updated_at).select(columns).maybeSingle();
        if(error) throw fail(error);
        if(!data) throw Error('別の画面で更新または削除されています。本文をコピーしてから、この日誌を開き直してください。');
        row=data;
      } else {
        const {data,error}=await client().from('journals').insert({id:op.id,...payload}).select(columns).single();
        if(error) throw fail(error);
        row=data;
      }
    } catch(error) {
      let probe;
      try {probe=await raw(op.id);} catch {throw error;}
      if(probe?.author_id===author && same(probe,payload)) row=probe;
      else {
        // Only remove a candidate proven not to be referenced by the current record.
        if(op.uploadPath && probe?.image_path!==op.uploadPath) {await cleanup(op.uploadPath);op.uploadPath=null;}
        throw error;
      }
    }
    const warning=op.base?.image_path && op.base.image_path!==row.image_path ? await cleanup(op.base.image_path) : '';
    // The DB write has succeeded even if a later image read fails.
    let mapped=map(row);
    try {mapped=(await images([mapped]))[0];} catch {mapped.imageUnavailable=!!mapped.image_path;}
    return {record:mapped,warning};
  }
  async function remove(record) {
    const author=owner();
    if(record.member!==author) throw Error('自分の日誌だけ削除できます。');
    const {data,error}=await client().from('journals').delete().eq('id',record.id).eq('author_id',author).eq('updated_at',record.updated_at).select('id');
    if(error || !data?.length) {
      const probe=await raw(record.id);
      if(probe) throw error?fail(error):Error('この日誌は更新されています。再読み込みして確認してください。');
    }
    return cleanup(record.image_path);
  }
  async function social(id) {
    const author=GuildAuth.identity().id;
    const comments=await pages(()=>client().from('journal_comments').select('id,content,author_id,created_at,author:profiles!journal_comments_author_id_fkey(nickname,avatar_path)').eq('journal_id',id).order('created_at').order('id'));
    let liked=false;
    if(author) {
      const {data,error}=await client().from('journal_likes').select('journal_id').eq('journal_id',id).eq('user_id',author).maybeSingle();
      if(error) throw fail(error);liked=!!data;
    }
    return {comments,liked};
  }
  async function like(id,liked) {
    const author=owner();
    const result=liked ? await client().from('journal_likes').delete().eq('journal_id',id).eq('user_id',author) : await client().from('journal_likes').insert({journal_id:id});
    if(result.error && result.error.code!=='23505') throw fail(result.error);
  }
  async function comment(id,text,commentId) {
    owner();text=text.trim();if(!text||text.length>1000) throw Error('コメントは1〜1000文字で入力してください。');
    const {error}=await client().from('journal_comments').insert({id:commentId,journal_id:id,content:text});
    if(error && error.code!=='23505') throw fail(error);
  }
  async function deleteComment(id) {
    const author=owner();
    const {error}=await client().from('journal_comments').delete().eq('id',id).eq('author_id',author);
    if(error) throw fail(error);
  }
  return {list,members,one,preparePhoto,save,remove,social,like,comment,deleteComment};
})();
