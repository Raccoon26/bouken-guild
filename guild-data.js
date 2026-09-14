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
  function photoPaths(row){return row.image_paths|| (row.image_path?[row.image_path]:[]);}
  async function images(rows) {
    const paths=[...new Set(rows.flatMap(photoPaths))],urls=new Map();
    for(const path of paths)if(path.startsWith('r2:')){const url=GuildMedia.url(path);if(url)urls.set(path,url);}
    const old=paths.filter(p=>pathPattern.test(p));
    for(let i=0;i<old.length;i+=100){const {data,error}=await client().storage.from(bucket).createSignedUrls(old.slice(i,i+100),3600);if(!error)(data||[]).forEach(p=>{if(p.signedUrl)urls.set(p.path,p.signedUrl);});}
    return rows.map(r=>({...r,photos:photoPaths(r).map(path=>({path,url:urls.get(path)||''})),image:urls.get(photoPaths(r)[0])||'',imageUnavailable:photoPaths(r).some(p=>!urls.has(p))}));
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
  async function preparePhoto(file){return GuildMedia.compress(file);}
  function youtubeID(value){
    if(!value?.trim())return null;
    try{const u=new URL(value.trim());if(u.protocol!=='https:')throw Error();
      let id;if(['youtu.be','www.youtu.be'].includes(u.hostname))id=u.pathname.slice(1);
      else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname))id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)\/?$/)?.[1];
      if(/^[A-Za-z0-9_-]{11}$/.test(id||''))return id;
    }catch{}throw Error('YouTubeの動画URLを入力してください。');
  }
  function same(row,payload){return Object.entries(payload).every(([k,v])=>JSON.stringify(row[k])===JSON.stringify(v));}
  async function cleanup(path){const {error}=await GuildMedia.remove(path,bucket);return error?'以前の写真を削除できませんでした。運営者にお問い合わせください。':'';}
  async function save(op,fields,entries=[]){
    const author=owner();if(op.author!==author)throw Error('ログイン中のアカウントが変わりました。日誌一覧から開き直してください。');
    if(!Array.isArray(entries)||entries.length>10)throw Error('写真は10枚までです。');
    const payload={title:fields.title.trim(),content:fields.content.trim(),adventure_date:fields.adventure_date,prefecture:fields.prefecture,place:fields.place.trim(),tags:fields.tags,likes_enabled:!!fields.likes_enabled,comments_enabled:!!fields.comments_enabled,published:true,youtube_video_id:youtubeID(fields.youtube_url),image_paths:[]};
    if(!payload.title||payload.title.length>120||!payload.content||payload.content.length>20000||payload.tags.length>10)throw Error('タイトル・本文・タグの入力をご確認ください。');
    op.uploads ||= new Map();
    // A stable per-blob path is retained across retries and uncertain DB responses.
    for(const entry of entries){
      if(entry.blob){if(!op.uploads.has(entry.blob)){const key=author+'/'+op.id+'/'+crypto.randomUUID()+'.webp';op.uploads.set(entry.blob,await GuildMedia.upload(key,entry.blob));}payload.image_paths.push(op.uploads.get(entry.blob));}
      else if(photoPaths(op.base||{}).includes(entry.path))payload.image_paths.push(entry.path);
      else throw Error('写真の選択を確認してください。');
    }
    payload.image_path=payload.image_paths[0]||null;
    let row;
    try{
      let result;
      if(op.base)result=await client().from('journals').update(payload).eq('id',op.id).eq('author_id',author).eq('updated_at',op.base.updated_at).select(columns).maybeSingle();
      else result=await client().from('journals').insert({id:op.id,...payload}).select(columns).single();
      if(result.error)throw fail(result.error);if(!result.data)throw Error('別の画面で更新または削除されています。本文をコピーしてから開き直してください。');row=result.data;
    }catch(error){
      let probe;try{probe=await raw(op.id);}catch{throw error;}
      if(probe?.author_id===author&&same(probe,payload))row=probe;
      else{for(const [blob,path] of op.uploads){if(!photoPaths(probe||{}).includes(path)){if(!await cleanup(path))op.uploads.delete(blob);}}throw error;}
    }
    let warning='';
    for(const path of new Set([...photoPaths(op.base||{}),...op.uploads.values()]))if(!photoPaths(row).includes(path))warning=(await cleanup(path))||warning;
    let mapped=map(row);try{mapped=(await images([mapped]))[0];}catch{mapped.imageUnavailable=!!mapped.image_path;}
    return {record:mapped,warning};
  }
  async function remove(record){
    const author=owner();if(record.member!==author)throw Error('自分の日誌だけ削除できます。');
    const {data,error}=await client().from('journals').delete().eq('id',record.id).eq('author_id',author).eq('updated_at',record.updated_at).select('id');
    if(error||!data?.length){const probe=await raw(record.id);if(probe)throw error?fail(error):Error('この日誌は更新されています。再読み込みして確認してください。');}
    let warning='';for(const path of photoPaths(record))warning=(await cleanup(path))||warning;return warning;
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
  return {list,members,one,preparePhoto,youtubeID,save,remove,social,like,comment,deleteComment};
})();
