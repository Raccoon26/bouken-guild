/* 権限と報酬は画面のボタンだけでなく、データベース側でも検証します。 */
window.GuildQuests=(()=>{
 const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const status={pending:'確認待ち',revision:'補足をお願いします',rejected:'見送り',approved:'達成済み'};
 const time=v=>new Date(v).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})+' JST';
 const who=()=>GuildAuth.identity().id;
 const db=()=>GuildAuth.getClient();
 async function rpc(name,args){const {data,error}=await db().rpc(name,args);if(error)throw Error(/[ぁ-んァ-ヶ一-龯]/.test(error.message||'')?error.message:'処理できませんでした。接続と権限を確認して、もう一度お試しください。');return data;}
 async function pages(build){const result=[];for(let i=0;;i+=500){const {data,error}=await build().range(i,i+499);if(error)throw error;result.push(...data);if(data.length<500)return result;}}
 function page(){return '<section id="quest-app"><h1>冒険クエスト</h1><p role="status">クエストを読み込んでいます…</p></section>';}
 function dirty(form){form.addEventListener('input',()=>{window.guildQuestDirty=true;});}
 function mount(){const root=document.querySelector('#quest-app');if(!root)return;load(root);}
 async function load(root){
  const viewer=who();
  try{
   if(!db())throw Error('会員情報の読み込み後に再読み込みしてください。');
   const role=viewer?await rpc('guild_my_role'): 'member',manager=['owner','manager'].includes(role);
   const quests=await pages(()=>db().from('guild_quests').select('*').order('created_at',{ascending:false}).order('id'));
   const claims=viewer?await pages(()=>db().from('guild_claims').select('*,member:profiles!guild_claims_member_id_fkey(nickname)').order('submitted_at',{ascending:false}).order('id')):[];
   if(root!==document.querySelector('#quest-app')||viewer!==who())return;
   let tab=location.hash.split('/')[1]||'active';
   if(['review','create'].includes(tab)&&!manager||tab==='admin'&&role!=='owner')tab='active';
   const tabs=[['active','募集中'],['mine','自分の申請'],...(manager?[['review','達成の確認'],['create','クエストを作る'],['archive','終了したクエスト']]:[]),...(role==='owner'?[['admin','管理者の指定']]:[])];
   root.innerHTML=`<span class="kicker">クエスト掲示板</span><h1>冒険クエスト</h1><p class="sub">冒険を報告して、ギルドの経験値を積み重ねよう。</p><nav class="tabs">${tabs.map(([id,label])=>`<a class="button ${tab===id?'':'secondary'}" href="#quests/${id}">${label}</a>`).join('')}</nav><p class="meta">期限は日本時間です。承認されたクエストのEXPが一度だけ加算されます。ランクの昇格基準は準備中です。</p><div id="quest-content"></div><p id="quest-message" role="status"></p>`;
   const box=root.querySelector('#quest-content');
   const message=error=>{root.querySelector('#quest-message').textContent=error.message||String(error);};
   async function act(button,fn){button.disabled=true;try{await fn();window.guildQuestDirty=false;await load(root);}catch(error){message(error);button.disabled=false;}}
   function questCard(q,showForm=false){
    const c=claims.find(c=>c.quest_id===q.id&&c.member_id===viewer),open=!q.cancelled&&Date.now()>=Date.parse(q.starts_at)&&Date.now()<Date.parse(q.ends_at);
    return `<article class="panel quest-entry"><span class="title-pill">${q.exp} EXP</span><h2>${e(q.title)}</h2><p class="profile-bio">${e(q.description)}</p><p>${e(time(q.starts_at))} ～ ${e(time(q.ends_at))}</p><p>${q.cancelled?'中止':Date.now()>=Date.parse(q.ends_at)?'募集終了':Date.now()<Date.parse(q.starts_at)?'開始前':'受付中'}</p>${c?`<p>あなたの申請：${status[c.status]}</p>`:''}${showForm&&open&&!c?viewer?`<details><summary>達成を報告する</summary>${claimForm(q.id)}</details>`:'<a href="#account">ログインして達成を報告</a>':''}${manager&&!q.cancelled?`<button data-cancel="${q.id}" class="button secondary">募集を中止</button>`:''}</article>`;
   }
   function claimForm(id,c){return `<form data-quest-form data-claim-quest="${id}"><label class="field">達成した内容・確認方法<textarea name="proof" required maxlength="5000">${e(c?.evidence||'')}</textarea></label><label class="field">自分の公開冒険日誌（任意）<select name="journal"><option value="">添付しない</option></select></label><p class="meta">写真は冒険日誌に添付し、その日誌を選んでください。申請内容は本人とクエスト管理者が確認します。</p><button class="primary">確認を依頼する</button></form>`;}
   if(tab==='active')box.innerHTML=quests.filter(q=>!q.cancelled&&Date.parse(q.ends_at)>Date.now()).map(q=>questCard(q,true)).join('')||'<p class="empty">募集中のクエストはありません。</p>';
   if(tab==='archive')box.innerHTML=quests.filter(q=>q.cancelled||Date.parse(q.ends_at)<=Date.now()).map(q=>questCard(q)).join('')||'<p class="empty">終了したクエストはありません。</p>';
   if(['mine','review'].includes(tab)){
    const rows=claims.filter(c=>tab==='mine'?c.member_id===viewer:c.status==='pending'&&c.member_id!==viewer);
    box.innerHTML=rows.map(c=>{const q=quests.find(q=>q.id===c.quest_id);return `<article class="panel quest-entry"><h2>${e(q?.title||'クエスト')}</h2><p>${e(c.member?.nickname)} · ${status[c.status]} · ${e(time(c.submitted_at))}</p><p class="profile-bio">${e(c.evidence)}</p>${c.journal_id?`<a href="#journal/${c.journal_id}">添付された冒険日誌を見る →</a>`:''}${c.review_note?`<p class="notice">${e(c.review_note)}</p>`:''}${c.status==='approved'?`<p class="title-pill">${q?.exp||0} EXP 獲得</p>`:''}${tab==='mine'&&c.status==='revision'&&!q?.cancelled?claimForm(c.quest_id,c):''}${tab==='review'&&!q?.cancelled?`<form data-quest-form data-review="${c.id}"><label class="field">確認コメント<textarea name="note" maxlength="2000"></textarea></label><button class="primary" name="decision" value="approved">承認して ${q?.exp||0} EXP を付与</button><button name="decision" value="revision">補足を依頼</button><button name="decision" value="rejected">見送る</button></form>`:''}${q?.cancelled?'<p>このクエストは中止されました。</p>':''}</article>`;}).join('')||`<p class="empty">${viewer?'該当する申請はありません。':'ログインすると自分の申請を確認できます。'}</p>`;
   }
   if(tab==='create'){
    box.innerHTML='<form id="create-quest" data-quest-form class="panel"><label class="field">タイトル<input name="title" required maxlength="120"></label><label class="field">内容・達成条件<textarea name="description" required maxlength="10000"></textarea></label><label class="field">開始日時（日本時間）<input name="starts" type="datetime-local" required></label><label class="field">終了日時（日本時間）<input name="ends" type="datetime-local" required></label><label class="field">報酬EXP<input name="exp" type="number" min="1" max="10000" step="1" required value="100"></label><p class="meta">公開後の条件変更はできません。誤りがある場合は募集を中止して作り直してください。</p><button class="primary">クエストを公開する</button></form>';
    const form=box.querySelector('form'),id=crypto.randomUUID();
    form.onsubmit=ev=>{ev.preventDefault();const f=new FormData(form);act(form.querySelector('button'),async()=>{await rpc('guild_create_quest',{quest_id:id,quest_title:f.get('title'),quest_description:f.get('description'),start_time:new Date(f.get('starts')+':00+09:00').toISOString(),end_time:new Date(f.get('ends')+':00+09:00').toISOString(),reward:Number(f.get('exp'))});});};
   }
   if(tab==='admin'){
    const roles=await pages(()=>db().from('guild_roles').select('member_id,role,member:profiles!guild_roles_member_id_fkey(nickname)').order('member_id'));
    if(root!==document.querySelector('#quest-app')||viewer!==who())return;
    box.innerHTML=`<section class="panel"><h2>クエスト管理者の指定</h2><p>登録メールアドレスで検索し、ニックネームを確認して指定してください。</p><form id="find-manager" data-quest-form><label class="field">登録メールアドレス<input name="email" type="email" required autocomplete="off"></label><button>会員を検索</button></form><div id="manager-result"></div><h3>現在の管理者</h3>${roles.map(r=>`<p>${e(r.member?.nickname)} · ${r.role==='owner'?'運営者':`クエスト管理者 <button data-revoke="${r.member_id}">権限を解除</button>`}</p>`).join('')}</section>`;
    box.querySelector('#find-manager').onsubmit=ev=>{ev.preventDefault();const f=ev.target,b=f.querySelector('button');b.disabled=true;rpc('guild_find_member',{email_input:new FormData(f).get('email')}).then(rows=>{if(root!==document.querySelector('#quest-app')||viewer!==who())return;const r=rows[0],result=box.querySelector('#manager-result');result.innerHTML=r?`<p>${GuildAuth.avatarHTML(r.avatar_path||null)} <a href="#member/${r.id}">${e(r.nickname)}</a> · ${e({owner:'運営者',manager:'クエスト管理者',member:'一般会員'}[r.role]||'一般会員')}</p>${r.role==='member'?'<button id="grant-manager">この会員をクエスト管理者にする</button>':''}`:'<p>該当する会員がいません。</p>';result.querySelector('#grant-manager')?.addEventListener('click',ev=>{if(confirm(r.nickname+'さんにクエスト管理権限を付与しますか？'))act(ev.currentTarget,()=>rpc('guild_set_manager',{target:r.id,enabled:true}));});}).catch(message).finally(()=>b.disabled=false);};
    box.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=()=>{if(confirm('この会員のクエスト管理権限を解除しますか？'))act(b,()=>rpc('guild_set_manager',{target:b.dataset.revoke,enabled:false}));});
   }
   box.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>{if(confirm('募集を中止すると、新しい申請と承認ができなくなります。中止しますか？'))act(b,()=>rpc('guild_cancel_quest',{quest:b.dataset.cancel}));});
   box.querySelectorAll('[data-review]').forEach(form=>form.onsubmit=ev=>{ev.preventDefault();const b=ev.submitter;if(!b||b.disabled)return;const note=new FormData(form).get('note');if(b.value!=='approved'&&!note.trim()){message('補足・見送りの理由を入力してください。');return;}if(confirm(b.value==='approved'?'達成を承認してEXPを付与しますか？':'この内容で返答しますか？'))act(b,()=>rpc('guild_review_claim',{claim:form.dataset.review,decision:b.value,note}));});
   const forms=[...box.querySelectorAll('[data-claim-quest]')];
   if(forms.length){
    forms.forEach(form=>{dirty(form);form.onsubmit=ev=>ev.preventDefault();form.querySelector('button').disabled=true;});
    const journals=await pages(()=>db().from('journals').select('id,title').eq('author_id',viewer).eq('published',true).eq('post_kind','journal').order('created_at',{ascending:false}).order('id'));
    if(root!==document.querySelector('#quest-app')||viewer!==who())return;
    forms.forEach(form=>{form.querySelector('button').disabled=false;const old=claims.find(c=>c.quest_id===form.dataset.claimQuest&&c.member_id===viewer);form.querySelector('select').innerHTML='<option value="">添付しない</option>'+journals.map(j=>`<option value="${j.id}" ${old?.journal_id===j.id?'selected':''}>${e(j.title)}</option>`).join('');form.onsubmit=ev=>{ev.preventDefault();const f=new FormData(form);act(form.querySelector('button'),()=>rpc('guild_submit_claim',{quest:form.dataset.claimQuest,proof:f.get('proof'),journal:f.get('journal')||null}));};});
   }
   box.querySelectorAll('[data-quest-form]').forEach(dirty);
   const next=quests.filter(q=>Date.parse(q.ends_at)>Date.now()).map(q=>Date.parse(q.ends_at));
   if(next.length)setTimeout(()=>{if(root===document.querySelector('#quest-app')&&!window.guildQuestDirty)load(root);},Math.min(2147483647,Math.max(1000,Math.min(...next)-Date.now()+100)));
  }catch(error){if(root===document.querySelector('#quest-app')){root.innerHTML='<h1>冒険クエスト</h1><p role="alert">クエストを読み込めません。05のDB設定とログイン状態をご確認ください。</p><button>再読み込み</button>';root.querySelector('button').onclick=()=>load(root);}}
 }
 return {page,mount};
})();
