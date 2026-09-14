window.GuildAuth = (() => {
  const URL = 'https://idiqbtujtqadhcfpqvdq.supabase.co';
  const KEY = 'sb_publishable_eCZ7RBMUJ6RXAbutedJ4EQ_brBqifhY';
  const profileColumns='id,nickname,bio,joined_at,rank,title,experience,avatar_path';
  const AVATAR_BUCKET = 'bouken-avatars';
  let client, user = null, profile = null;
  let ready = false, failure = '', mode = 'login', notice = '', generation = 0;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isAccount = () => location.hash === '#account';
  const redirectURL = () => location.origin + location.pathname;
  const errorText = error => {
    const code = error?.code || '';
    if (code === 'invalid_credentials') return 'メールアドレスまたはパスワードが違います。';
    if (code === 'email_not_confirmed') return '確認メールのリンクを開いてからログインしてください。';
    if (/rate_limit/.test(code)) return '送信回数の上限です。時間をおいてからお試しください。';
    if (code === 'email_address_not_authorized') return 'このメールアドレスへの送信はまだ利用できません。運営者にお問い合わせください。';
    if (code === 'user_already_exists') return '登録済みの場合はログインしてください。';
    if (code === 'weak_password') return 'より長く、推測されにくいパスワードを設定してください。';
    return '処理できませんでした。接続を確認して、もう一度お試しください。' + (code ? '（' + code + '）' : '');
  };
  function identity() {
    return {ready, error:failure, id:user?.id || null, nickname:profile?.nickname || '', avatarPath:profile?.avatar_path || null};
  }
  function avatarHTML(path = profile?.avatar_path, className = '') {
    const legacy=typeof path==='string'&&/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(path);
    const src=legacy?`${URL}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`:window.GuildMedia?.url(path);
    return src ? `<img class="guild-avatar ${className}" src="${escape(src)}" alt="プロフィール写真" width="96" height="96">` : `<span class="guild-avatar avatar-placeholder ${className}" aria-label="プロフィール写真未設定">✦</span>`;
  }
  function announce() {
    const link = document.querySelector('#account-link');
    if (link) link.innerHTML = user ? avatarHTML(profile?.avatar_path,'avatar-small') + '<span>マイページ</span>' : '登録・ログイン';
    window.dispatchEvent(new Event('guild-identity-changed'));
  }
  function refresh() {
    announce();
    if (isAccount()) window.render?.();
  }
  async function loadUser(nextUser) {
    const ticket = ++generation;
    user = nextUser; profile = null; failure = '';
    ready = !user;
    refresh();
    if (!user) return;
    const id = user.id;
    try {
      let p;
      for (let attempt = 0; attempt < 2; attempt++) {
        p = await client.from('profiles').select(profileColumns).eq('id', id).single();
        if (ticket !== generation) return;
        const failed = [p].filter(result => result.error);
        if (!failed.length || !failed.every(result => !result.status || result.status >= 500 || result.error.code === 'PGRST116')) break;
        if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (ticket !== generation) return;
      if (p.error) throw {...p.error, httpStatus:p.status};
      profile = p.data;
    } catch (e) {
      if (ticket !== generation) return;
      const code = /^[A-Za-z0-9_]{1,32}$/.test(e?.code||'') ? e.code :
        (e?.httpStatus ? 'HTTP_'+Number(e.httpStatus) : 'CONNECTION');
      const guidance = code==='PGRST116' ? '会員プロフィールが見つかりません。運営者にお問い合わせください。' :
        ['PGRST301','PGRST303'].includes(code) ? 'ログインの有効期限を確認できません。ログアウトして、もう一度ログインしてください。' :
        code==='42501' ? '会員情報を読み取る権限を確認できません。運営者にお問い合わせください。' :
        '会員情報を読み込めませんでした。再読み込みをお試しください。';
      failure = guidance + '（確認コード：'+code+'）';
    }
    if (ticket === generation) { ready = true; refresh(); }
  }
  const field = (label, input) => `<label class="field">${label}${input}</label>`;
  function avatarForm() {
    return `<section class="avatar-editor"><h3>プロフィール写真</h3><div id="avatar-preview">${avatarHTML()}</div><form id="avatar-form">${field('写真を選ぶ','<input id="avatar-file" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required><small>JPEG・PNG・WebP、5MBまで。正方形に整えて保存します。</small>')}<p class="meta">公開プロフィール用の写真です。画像URLを知っている人は閲覧できます。</p><button class="primary" type="submit">写真を保存</button><button class="button secondary" type="button" id="avatar-remove" ${profile?.avatar_path?'':'disabled'}>写真を削除</button><p id="avatar-status" role="status"></p></form></section>`;
  }
  // Decode and re-encode locally to bound dimensions and remove image metadata.
  async function prepareAvatar(file) {return GuildMedia.compress(file,true);}
  async function saveAvatar(blob) {
    const owner = user?.id, oldPath = profile?.avatar_path || null;
    if (!owner || !ready || !profile) throw Error('ログインし直してください。');
    const newPath = blob ? 'r2:'+owner + '/' + crypto.randomUUID() + '.webp' : null;
    if (blob) {
      await GuildMedia.upload(newPath.slice(3),blob);
    }
    try {
      let query = client.from('profiles').update({avatar_path:newPath}).eq('id',owner);
      query = oldPath ? query.eq('avatar_path',oldPath) : query.is('avatar_path',null);
      const {data,error} = await query.select(profileColumns).single();
      if (error) throw error;
      if (user?.id === owner) {profile = data; announce();}
    } catch (error) {
      const check = await client.from('profiles').select(profileColumns).eq('id',owner).single();
      if (!check.error && check.data.avatar_path === newPath) {
        if (user?.id === owner) {profile = check.data; announce();}
      } else {
        if (!check.error && newPath) await GuildMedia.remove(newPath,AVATAR_BUCKET);
        throw Error('写真の反映を確認できませんでした。マイページを再読み込みして確認してください。');
      }
    }
    if (oldPath && oldPath !== newPath) {
      const removed = await GuildMedia.remove(oldPath,AVATAR_BUCKET);
      if (removed.error) return '写真は更新されましたが、以前の画像を削除できませんでした。運営者にお問い合わせください。';
    }
    return blob ? 'プロフィール写真を保存しました。' : 'プロフィール写真を削除しました。';
  }
  function bindAvatar() {
    const form = document.querySelector('#avatar-form'); if (!form) return;
    const input = form.querySelector('#avatar-file'), status = form.querySelector('#avatar-status');
    let prepared = null, selection = 0;
    input.addEventListener('change',async()=>{
      const current = ++selection; prepared = null;
      status.textContent = 'プレビューを準備しています…';
      try {
        const blob = await prepareAvatar(input.files[0]); if (current !== selection) return;
        prepared = blob;
        const preview = document.createElement('img'), url = window.URL.createObjectURL(blob);
        preview.className='guild-avatar'; preview.alt='保存する写真のプレビュー'; preview.width=preview.height=96;
        preview.onload=preview.onerror=()=>window.URL.revokeObjectURL(url); preview.src=url;
        document.querySelector('#avatar-preview')?.replaceChildren(preview);
        status.textContent='この写真でよければ「写真を保存」を押してください。';
      } catch(error) {if(current===selection) status.textContent=error.message;}
    });
    async function apply(blob) {
      form.querySelectorAll('button,input').forEach(el=>el.disabled=true); status.textContent='保存しています…';
      try {
        status.textContent=await saveAvatar(blob); prepared=null; input.value='';
        const preview=document.querySelector('#avatar-preview'); if(preview) preview.innerHTML=avatarHTML();
      } catch(error) {status.textContent=error.message;}
      finally {form.querySelectorAll('button,input').forEach(el=>el.disabled=false);form.querySelector('#avatar-remove').disabled=!profile?.avatar_path;}
    }
    form.addEventListener('submit',e=>{e.preventDefault();if(!prepared){status.textContent='写真を選び、プレビューが表示されるまでお待ちください。';return;}apply(prepared);});
    form.querySelector('#avatar-remove').addEventListener('click',()=>{selection++;prepared=null;apply(null);});
  }
  function page() {
    const opening = `<section class="form-wrap account-page"><span class="kicker">${user?'冒険者名':'GUILD MEMBERSHIP'}</span><h1 id="account-title">${user?escape(profile?.nickname||'冒険者'):'冒険者登録・ログイン'}</h1>`;
    if (location.protocol === 'file:') return opening + '<div class="panel"><p>会員機能はウェブサイトのURLからご利用ください。</p><p>このファイルを直接開いた状態では、メール確認を完了できません。</p></div></section>';
    if (!ready) return opening + '<p role="status">会員情報を確認しています…</p></section>';
    if (!client) return opening + `<p class="error" role="alert">${escape(failure)}</p></section>`;
    if (user && mode !== 'password') {
      return opening + `<div class="panel">${failure ? `<p class="error" role="alert">${escape(failure)}</p><button id="account-retry" class="primary">再読み込み</button>` : `<p>おかえりなさい、${escape(profile?.nickname)}さん。</p><p><a href="#member/${user.id}">公開プロフィールを見る →</a></p>${avatarForm()}<dl class="account-stats"><dt>冒険者ランク</dt><dd>${escape(profile?.rank)}</dd><dt>称号</dt><dd>${escape(profile?.title)}</dd><dt>経験値</dt><dd>${escape(profile?.experience)} EXP</dd><dt>加入日</dt><dd>${escape(profile?.joined_at?.slice(0,10))}</dd></dl><p class="meta">新しい投稿の公開で10 EXP。クエストの達成承認でもEXPが加算されます。ランクと称号は累計EXPに応じて変わります。</p><form id="profile-form">${field('ニックネーム（名簿に公開）', `<input name="nickname" required maxlength="30" autocomplete="nickname" value="${escape(profile?.nickname)}">`)}${field('自己紹介（名簿に公開）', `<textarea name="bio" maxlength="500">${escape(profile?.bio)}</textarea>`)}<button class="primary">プロフィールを保存</button><p class="error" role="status" id="auth-status"></p></form><details><summary>自分の会員情報</summary><p class="account-id">会員ID：${escape(user.id)}</p><p>${escape(user.email)}</p></details>`}<button id="signout" class="button secondary">ログアウト</button></div></section>`;
    }
    const signup = mode === 'signup', reset = mode === 'reset', password = mode === 'password';
    return opening + `<div class="panel"><div class="tabs">${[['login','ログイン'],['signup','新規登録']].map(([m,l])=>`<button type="button" data-auth-mode="${m}" aria-pressed="${mode===m}">${l}</button>`).join('')}</div><h2>${password?'新しいパスワード':reset?'パスワードの再設定':signup?'冒険者として登録する':'おかえりなさい'}</h2><form id="auth-form">${signup?field('ニックネーム（名簿に公開）','<input name="nickname" autocomplete="nickname" maxlength="30" required>'):''}${!password?field('メールアドレス','<input name="email" type="email" autocomplete="email" maxlength="254" required>'):''}${!reset?field('パスワード',`<input name="password" type="password" autocomplete="${signup||password?'new-password':'current-password'}" ${signup||password?'minlength="12"':''} maxlength="128" required>${signup||password?'<small>12文字以上で設定してください。</small>':''}`):''}${signup||password?field('パスワード（確認）','<input name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required>'):''}${signup?'<p class="meta">ニックネーム・自己紹介・ランクは名簿に公開されます。メールアドレスは公開されません。</p>':''}<button class="primary" type="submit">${password?'パスワードを変更':reset?'再設定メールを送る':signup?'登録して確認メールを受け取る':'ログイン'}</button><p id="auth-status" role="status">${escape(notice)}</p></form>${mode==='login'?'<button type="button" class="text-button" data-auth-mode="reset">パスワードを忘れた方</button><button type="button" class="text-button" id="resend">確認メールを再送する</button>':''}</div></section>`;
  }
  function bind() {
    bindAvatar();
    document.querySelectorAll('[data-auth-mode]').forEach(b => b.onclick = () => {mode = b.dataset.authMode; notice = ''; refresh();});
    document.querySelector('#account-retry')?.addEventListener('click', () => loadUser(user));
    document.querySelector('#signout')?.addEventListener('click', async e => {
      e.currentTarget.disabled = true;
      const {error} = await client.auth.signOut({scope:'local'});
      if (error) { notice = errorText(error); window.toast?.(notice); e.target.disabled = false; }
      else { mode = 'login'; notice = 'ログアウトしました。'; await loadUser(null); }
    });
    document.querySelector('#profile-form')?.addEventListener('submit', async e => {
      e.preventDefault(); const form = e.target, status = form.querySelector('#auth-status'), button = form.querySelector('button');
      const data = new FormData(form), nickname = data.get('nickname').trim();
      if (!nickname) {status.textContent = 'ニックネームを入力してください。'; return;}
      button.disabled = true;
      try {
        const {data: saved, error} = await client.from('profiles').update({nickname, bio:data.get('bio').trim()}).eq('id',user.id).select(profileColumns).single();
        if (error) throw error;
        profile = saved; const heading=document.querySelector('#account-title');if(heading)heading.textContent=saved.nickname; announce(); status.textContent = 'プロフィールを保存しました。';
      } catch (error) {status.textContent = errorText(error);} finally {button.disabled = false;}
    });
    document.querySelector('#auth-form')?.addEventListener('submit', async e => {
      e.preventDefault(); const form = e.target, button = form.querySelector('button'), status = form.querySelector('#auth-status');
      const data = new FormData(form), email = data.get('email')?.trim(), password = data.get('password');
      if ((mode==='signup'||mode==='password') && password!==data.get('confirmation')) {status.textContent='パスワードが一致しません。';return;}
      if (mode==='signup' && !data.get('nickname').trim()) {status.textContent='ニックネームを入力してください。';return;}
      button.disabled = true; status.textContent = '処理しています…';
      try {
        let result;
        if (mode==='signup') {
          result = await client.auth.signUp({email,password,options:{data:{nickname:data.get('nickname').trim()},emailRedirectTo:redirectURL()}});
          if (result.error) throw result.error;
          if (result.data.session) {mode='login';await loadUser(result.data.user);return;}
          status.textContent = '登録を受け付けました。確認メールのリンクを開いてください。登録済みの場合はログインしてください。';
          form.querySelectorAll('[type="password"]').forEach(input=>input.value='');
        } else if (mode==='reset') {
          result = await client.auth.resetPasswordForEmail(email,{redirectTo:redirectURL()});
          if (result.error) throw result.error;
          status.textContent = '対象のアカウントがある場合、再設定メールが届きます。メールをご確認ください。';
        } else if (mode==='password') {
          result = await client.auth.updateUser({password});
          if (result.error) throw result.error;
          mode='login'; window.toast?.('パスワードを変更しました。'); await loadUser(result.data.user);
        } else {
          result = await client.auth.signInWithPassword({email,password});
          if (result.error) throw result.error;
          await loadUser(result.data.user);
        }
      } catch(error) {status.textContent=errorText(error);} finally {button.disabled=false;}
    });
    document.querySelector('#resend')?.addEventListener('click', async e => {
      const input = document.querySelector('#auth-form [name="email"]');
      if (!input.reportValidity()) return;
      const button = e.currentTarget, status = document.querySelector('#auth-status'); button.disabled=true;
      try {
        const {error} = await client.auth.resend({type:'signup',email:input.value.trim(),options:{emailRedirectTo:redirectURL()}});
        if (error) throw error;
        status.textContent='未確認の登録がある場合、確認メールが届きます。';
      } catch(error) {status.textContent=errorText(error);} finally {button.disabled=false;}
    });
  }
  async function init() {
    if (location.protocol==='file:') {ready=true;refresh();return;}
    if (!window.supabase?.createClient) {ready=true;failure='会員機能を読み込めません。ページを再読み込みしてください。';refresh();return;}
    try {
      const callback = /(?:access_token|error_description)=/.test(location.hash) || new URLSearchParams(location.search).has('code');
      const recovery = /type=recovery/.test(location.hash);
      const callbackError = new URLSearchParams(location.hash.slice(1)).get('error_description');
      client = window.supabase.createClient(URL,KEY,{global:{fetch:async (input, options = {}) => {const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)controller.abort();try{return await fetch(input,{...options,signal:controller.signal});}finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}}},auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}});
      client.auth.onAuthStateChange((event, session) => {
        if (event==='PASSWORD_RECOVERY') {mode='password';history.replaceState(null,'',redirectURL()+'#account');}
        if (['SIGNED_IN','SIGNED_OUT','PASSWORD_RECOVERY','USER_UPDATED'].includes(event)) setTimeout(()=>{
          if (event==='SIGNED_IN' && user?.id===session?.user?.id && (!ready || profile)) return;
          loadUser(session?.user||null);
        },0);
      });
      const {data,error} = await client.auth.getSession();
      if(error) throw error;
      if(callback) {
        history.replaceState(null,'',redirectURL()+'#account');
        if(recovery&&data.session) mode='password';
        if(callbackError) notice='確認リンクが無効か、有効期限が切れています。メールの再送をお試しください。';
      }
      await loadUser(data.session?.user||null);
    } catch(error) {ready=true;failure=errorText(error);client=null;refresh();}
  }
  return {page,bind,init,identity,avatarHTML,getClient:()=>client,reload:()=>loadUser(user)};
})();
