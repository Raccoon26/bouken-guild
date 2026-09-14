/* Supabase Auth integration. Only the browser-safe publishable key belongs here. */
window.GuildAuth = (() => {
  const URL = 'https://idiqbtujtqadhcfpqvdq.supabase.co';
  const KEY = 'sb_publishable_eCZ7RBMUJ6RXAbutedJ4EQ_brBqifhY';
  let client, user = null, profile = null, wallet = null;
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
  function refresh() {
    const link = document.querySelector('#account-link');
    if (link) link.textContent = user ? 'マイページ' : '登録・ログイン';
    if (isAccount()) window.render?.();
  }
  async function loadUser(nextUser) {
    const ticket = ++generation;
    user = nextUser; profile = null; wallet = null; failure = '';
    ready = !user;
    refresh();
    if (!user) return;
    const id = user.id;
    try {
      const [p, w] = await Promise.all([
        client.from('profiles').select('id,nickname,bio,joined_at,rank,title,experience').eq('id', id).single(),
        client.from('member_wallets').select('points').eq('member_id', id).single()
      ]);
      if (ticket !== generation) return;
      if (p.error || w.error) throw p.error || w.error;
      profile = p.data; wallet = w.data;
    } catch (e) {
      if (ticket !== generation) return;
      failure = '会員情報を読み込めませんでした。再読み込みをお試しください。';
    }
    if (ticket === generation) { ready = true; refresh(); }
  }
  const field = (label, input) => `<label class="field">${label}${input}</label>`;
  function page() {
    const opening = '<section class="form-wrap account-page"><span class="kicker">GUILD MEMBERSHIP</span><h1>冒険ギルドの受付</h1>';
    if (location.protocol === 'file:') return opening + '<div class="panel"><p>会員機能はウェブサイトのURLからご利用ください。</p><p>このファイルを直接開いた状態では、メール確認を完了できません。</p></div></section>';
    if (!ready) return opening + '<p role="status">会員情報を確認しています…</p></section>';
    if (!client) return opening + `<p class="error" role="alert">${escape(failure)}</p></section>`;
    if (user && mode !== 'password') {
      return opening + `<div class="panel">${failure ? `<p class="error" role="alert">${escape(failure)}</p><button id="account-retry" class="primary">再読み込み</button>` : `<h2>${escape(profile?.nickname)}さん、おかえりなさい。</h2><dl class="account-stats"><dt>冒険者ランク</dt><dd>${escape(profile?.rank)}</dd><dt>称号</dt><dd>${escape(profile?.title)}</dd><dt>経験値</dt><dd>${escape(profile?.experience)} EXP</dd><dt>ポイント</dt><dd>${escape(wallet?.points)} GP</dd><dt>加入日</dt><dd>${escape(profile?.joined_at?.slice(0,10))}</dd></dl><p class="meta">ランク・経験値・ポイントの付与は準備中です。</p><form id="profile-form">${field('ニックネーム（名簿に公開）', `<input name="nickname" required maxlength="30" autocomplete="nickname" value="${escape(profile?.nickname)}">`)}${field('自己紹介（名簿に公開）', `<textarea name="bio" maxlength="500">${escape(profile?.bio)}</textarea>`)}<button class="primary">プロフィールを保存</button><p class="error" role="status" id="auth-status"></p></form><details><summary>自分の会員情報</summary><p class="account-id">会員ID：${escape(user.id)}</p><p>${escape(user.email)}</p></details>`}<button id="signout" class="button secondary">ログアウト</button></div></section>`;
    }
    const signup = mode === 'signup', reset = mode === 'reset', password = mode === 'password';
    return opening + `<div class="panel"><div class="tabs">${[['login','ログイン'],['signup','新規登録']].map(([m,l])=>`<button type="button" data-auth-mode="${m}" aria-pressed="${mode===m}">${l}</button>`).join('')}</div><h2>${password?'新しいパスワード':reset?'パスワードの再設定':signup?'冒険者として登録する':'おかえりなさい'}</h2><form id="auth-form">${signup?field('ニックネーム（名簿に公開）','<input name="nickname" autocomplete="nickname" maxlength="30" required>'):''}${!password?field('メールアドレス','<input name="email" type="email" autocomplete="email" maxlength="254" required>'):''}${!reset?field('パスワード',`<input name="password" type="password" autocomplete="${signup||password?'new-password':'current-password'}" ${signup||password?'minlength="12"':''} maxlength="128" required>${signup||password?'<small>12文字以上で設定してください。</small>':''}`):''}${signup||password?field('パスワード（確認）','<input name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required>'):''}${signup?'<p class="meta">ニックネーム・自己紹介・ランクは名簿に公開されます。メールアドレスは公開されません。</p>':''}<button class="primary" type="submit">${password?'パスワードを変更':reset?'再設定メールを送る':signup?'登録して確認メールを受け取る':'ログイン'}</button><p id="auth-status" role="status">${escape(notice)}</p></form>${mode==='login'?'<button type="button" class="text-button" data-auth-mode="reset">パスワードを忘れた方</button><button type="button" class="text-button" id="resend">確認メールを再送する</button>':''}</div></section>`;
  }
  function bind() {
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
        const {data: saved, error} = await client.from('profiles').update({nickname, bio:data.get('bio').trim()}).eq('id',user.id).select().single();
        if (error) throw error;
        profile = saved; status.textContent = 'プロフィールを保存しました。';
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
        // Auth callbacks must return synchronously; DB work runs after the auth lock is released.
        if (['SIGNED_IN','SIGNED_OUT','PASSWORD_RECOVERY','USER_UPDATED'].includes(event)) setTimeout(()=>loadUser(session?.user||null),0);
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
  return {page,bind,init};
})();
