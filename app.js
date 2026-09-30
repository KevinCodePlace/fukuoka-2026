'use strict';
const KEY = 'fukuoka-2026-v1';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const map = query => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
const link = (url, text) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
const money = value => new Intl.NumberFormat('zh-TW').format(value);
const shoppingItems = ['小熊維尼｜Disney Store','Miffy｜太宰府甜點＋天神周邊','mofusand｜天神 PARCO','藥妝、保養與日用品','日系生活雜貨｜Afternoon Tea LIVING','普通伴手禮｜機場採購'];
const initial = () => ({version:2,checks:{},meals:{},statuses:{},notes:{},budgets:BUDGET.map((r,i)=>({id:`budget-${i}`,name:r[0],min:r[1],max:r[2],note:r[3],actual:null})),shoppingItems:shoppingItems.map((name,i)=>({id:`shop-${i}`,name,done:false}))});
let state = initial();
let storageOK = true;
let currentView = 'days';
let dayId = 1;
const mealKeys = TRIP.days.flatMap(day => day.meals.filter(m => m.options.length).map(m => `${day.id}-${m.key}`));
let lastRemoved = null;
const validAmount = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e8;
const newId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
function validate(raw) {
  if (!raw || typeof raw !== 'object' || ![1,2].includes(raw.version)) throw new Error('不支援的備份格式');
  const clean = initial();
  for (const t of TASKS) if (raw.checks?.[t.id] === true) clean.checks[t.id] = true;
  for (const day of TRIP.days) {
    if (typeof raw.notes?.[day.id] === 'string') clean.notes[day.id] = raw.notes[day.id].slice(0,10000);
    for (const meal of day.meals) {
      const key = `${day.id}-${meal.key}`;
      if (meal.options.includes(raw.meals?.[key])) clean.meals[key] = raw.meals[key];
      if (['pending','contacted','booked','walkin'].includes(raw.statuses?.[key])) clean.statuses[key] = raw.statuses[key];
    }
  }
  if (raw.version === 1) {
    for (let i=0;i<BUDGET.length;i++) if (validAmount(raw.actual?.[i])) clean.budgets[i].actual = raw.actual[i];
    for (let i=0;i<shoppingItems.length;i++) clean.shoppingItems[i].done = raw.shopping?.[i] === true;
  } else {
    if (!Array.isArray(raw.budgets) || !Array.isArray(raw.shoppingItems) || raw.budgets.length>500 || raw.shoppingItems.length>500) throw new Error('清單格式錯誤');
    const ids = new Set();
    function identity(item) {
      if (!item || typeof item.id!=='string' || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id) || ids.has(item.id) || typeof item.name!=='string' || !item.name.trim() || item.name.length>200) throw new Error('項目格式錯誤');
      ids.add(item.id);
      return {id:item.id,name:item.name};
    }
    clean.budgets = raw.budgets.map(item=>{
      const base=identity(item);
      if (!validAmount(item.min) || !validAmount(item.max) || item.max<item.min || (item.actual!==null && !validAmount(item.actual))) throw new Error('金額格式錯誤');
      return {...base,min:item.min,max:item.max,actual:item.actual,note:typeof item.note==='string'?item.note.slice(0,1000):''};
    });
    clean.shoppingItems = raw.shoppingItems.map(item=>({...identity(item),done:item.done===true}));
  }
  if (typeof raw.notes?.shopping === 'string') clean.notes.shopping = raw.notes.shopping.slice(0,10000);
  return clean;
}
try {const raw=localStorage.getItem(KEY);if(raw) state=validate(JSON.parse(raw));} catch {storageOK=false;}
function save() {
  try {localStorage.setItem(KEY,JSON.stringify(state));storageOK=true;} catch {storageOK=false;}
  $('#storage-status').textContent = storageOK ? '進度僅保存在此瀏覽器' : '無法儲存，請使用備份進度';
  if(!storageOK) toast('此瀏覽器無法保存進度，請使用「備份進度」下載保存。');
}
function toast(message) {$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),4000);}
const completed = () => TASKS.filter(t=>state.checks[t.id]).length;
function progress() {const n=completed();return `<div class="progress-top"><span>準備完成度</span><strong>${Math.round(n/TASKS.length*100)}<small>%</small></strong></div><div class="progress-track" role="progressbar" aria-label="準備完成度" aria-valuemin="0" aria-valuemax="${TASKS.length}" aria-valuenow="${n}"><div class="progress-fill" style="width:${n/TASKS.length*100}%"></div></div><small>${n} / ${TASKS.length} 項準備完成</small>`;}
function taskRow(t,full=false){return `<div class="checkrow ${state.checks[t.id]?'done':''}"><input id="check-${t.id}" data-check="${t.id}" type="checkbox" ${state.checks[t.id]?'checked':''}><div><label for="check-${t.id}">${full?`<b class="due">${esc(t.due)}</b>`:''}<span>${esc(t.title)}</span><small>${esc(full?t.detail:t.due)}</small></label>${full&&t.url?link(t.url,'開啟官方資訊'):''}</div></div>`;}
function restaurantCard(id,index,key){const r=RESTAURANTS[id];const selected=state.meals[key]===id;return `<article class="restaurant ${selected?'selected':''}"><div class="restaurant-top"><div><h4>${esc(r.name)}</h4><div class="branch">${esc(r.branch)}</div></div><span class="rank">${selected?'已選擇':index===0?'主選':'備選'}</span></div><div class="dish">${esc(r.dish)} · ${esc(r.budget)} / 人</div><p>${esc(r.why)}</p><details><summary>營業、訂位與禁菸資訊</summary><p><b>地點：</b>${esc(r.area)}</p><p><b>營業：</b>${esc(r.hours)}</p><p><b>訂位：</b>${esc(r.booking)}</p><p><b>禁菸：</b>${esc(r.smoking)}</p></details><div class="restaurant-links">${link(map(r.name+' '+r.branch+' '+r.area),'地圖')}${link(r.url,'官方資訊')}${r.reserve?link(r.reserve,'訂位入口'):''}${r.phone?`<a href="tel:${esc(r.phone)}">電話</a>`:''}${r.source?link(r.source,'查證來源'):''}</div><button class="select-meal" data-meal="${key}" data-restaurant="${id}" aria-pressed="${selected}">${selected?'✓ 已選這間 · 再按取消':'選這間'}</button></article>`;}
function mealGroup(meal,day){const key=`${day.id}-${meal.key}`;return `<section class="meal-group"><div class="meal-head"><h3>${esc(meal.label)} <small>${esc(meal.time)}</small></h3>${meal.options.length?`<span>${meal.options.length} 間候選</span>`:''}</div><p>${esc(meal.note)}</p>${meal.options.length?meal.options.map((id,i)=>restaurantCard(id,i,key)).join(''):`<div class="empty-meal">${esc(meal.label)}無福岡餐廳安排</div>`}${meal.options.length?`<div class="meal-status"><label for="status-${key}">安排狀態</label><select id="status-${key}" data-status="${key}" ${!state.meals[key]?'disabled':''}>${[['pending','尚未確認'],['contacted','已詢問店家'],['booked','已取得訂位確認'],['walkin','決定現場候位']].map(([v,label])=>`<option value="${v}" ${(state.statuses[key]||'pending')===v?'selected':''}>${label}</option>`).join('')}</select><small>${state.meals[key]?'由你手動記錄，不會自動訂位':'先選一間餐廳'}</small></div>`:''}</section>`;}
function dayContent(d,printing=false){return `<div class="day-head"><div class="day-overline">DAY 0${d.id} <span>2026 / ${d.date.replace('.',' / ')} ${esc(d.week)}</span></div><h2>${esc(d.title)}</h2><p>${esc(d.subtitle)}</p><div class="tags">${d.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div></div><div class="section-title"><h3>這一天怎麼走</h3><small>${esc(d.steps)}</small></div><div class="timeline">${d.timeline.map(([time,title,note,location])=>`<div class="event"><time>${esc(time)}</time><div><h4>${esc(title)}</h4><p>${esc(note)}</p>${location?link(map(location),'查看地圖'):''}</div></div>`).join('')}</div><div class="alert"><strong>今天的節奏</strong><br>${esc(d.priority)}<br><strong>備案：</strong>${esc(d.weather)}</div><div class="meals"><div class="section-title"><h3>午餐、晚餐吃什麼</h3></div><p class="meta">預算為每人日圓規劃估計，非報價；選擇餐廳不等於完成訂位。未證實禁菸的店先向店家確認。</p>${d.meals.map(m=>mealGroup(m,d)).join('')}</div><section class="panel"><label class="note-label" for="day-note-${d.id}">這一天的備忘</label>${printing?`<p>${esc(state.notes[d.id]||'尚無備忘')}</p>`:`<textarea id="day-note-${d.id}" data-note="${d.id}" maxlength="10000" placeholder="例如：訂位姓名、集合時間、想買的商品…">${esc(state.notes[d.id]||'')}</textarea><p class="savehint">只保存在此瀏覽器；換裝置請先備份，再匯入。</p>`}</section>`;}
function renderDays(){const d=TRIP.days[dayId-1];$('#main').innerHTML=`<div class="day-layout"><aside class="daynav" aria-label="選擇日期">${TRIP.days.map(day=>`<button data-day="${day.id}" class="${day.id===dayId?'active':''}" aria-pressed="${day.id===dayId}"><span class="number">${day.date}</span><span class="day-label">${esc(day.place)}<small>DAY 0${day.id} · ${day.week}</small></span></button>`).join('')}<div class="trip-base"><strong>五晚，同一個家</strong><p>Encounter Ohori<br>大濠公園駅周邊</p>${link(map('Encounter Ohori 福岡'),'住宿地圖')}<p>不換宿、不搬行李。<br>機場往返直搭計程車。</p></div></aside><section class="day-content">${dayContent(d)}</section><aside class="side"><section class="panel progress-panel">${progress()}</section><section class="panel prep-panel"><div class="progress-top"><h3>這天要先準備</h3><small>${d.tasks.filter(id=>state.checks[id]).length}/${d.tasks.length}</small></div>${d.tasks.map(id=>taskRow(TASKS.find(t=>t.id===id))).join('')}<button class="all-prep" data-view="prep">查看全部行前準備</button></section><section class="panel note-panel"><h3>留點彈性給旅行</h3><p>餐廳候位以 20 分鐘為上限。太累時刪掉可選項目，大餐與休息優先。</p><p>時間為規劃目標，交通班次與所有預約尚須自行確認。</p></section></aside></div>`;}
function renderPrep(){const groups=[...new Set(TASKS.map(t=>t.group))];$('#main').innerHTML=`<div class="view-heading"><div><p class="eyebrow">BEFORE WE GO</p><h2>一件一件準備好</h2><p>先訂大餐，再鎖定交通。勾選會同步到每日行程旁。</p></div><span class="meta">出發日 · 2026/11/05</span></div><div class="prep-intro"><section class="panel">${progress()}</section><section class="panel"><h3>最先處理：水たき長野</h3><p>原稿建議出發前兩個月先詢問，目前直接著手即可。電話預約時確認 11 月 9 日（一）17:30、兩位。</p><p lang="ja">11月9日の17時30分に、2名で予約できますか？</p>${link('https://mizutakinagano.com/','官網與電話')}</section></div><div class="prep-grid">${groups.map(group=>`<section class="task-card"><h3>${esc(group)}</h3>${TASKS.filter(t=>t.group===group).map(t=>taskRow(t,true)).join('')}</section>`).join('')}</div>`;}
function totals(){const rows=state.budgets;const values=rows.filter(r=>r.actual!==null);return {min:rows.reduce((sum,r)=>sum+r.min,0),max:rows.reduce((sum,r)=>sum+r.max,0),actual:values.reduce((sum,r)=>sum+r.actual,0),count:values.length};}
function totalsMarkup(){const t=totals();return `<div><small>目前清單預估 · 兩人 / NT$</small><strong>${money(t.min)}–${money(t.max)}</strong></div><div><small>已填金額 · ${t.count}/${state.budgets.length} 項</small><strong>NT$ ${money(t.actual)}</strong></div>`;}
function renderBudget(){
  $('#main').innerHTML=`<div class="view-heading"><div><p class="eyebrow">TRAVEL LIGHT, PLAN WELL</p><h2>旅費與想帶回家的東西</h2><p>自由新增、修改或移除項目；匯出檔會保留完整清單與進度。</p></div><button class="quiet" data-undo ${lastRemoved?'':'disabled'}>復原上次刪除</button></div>
  <div class="budget-layout"><section><div class="budget-total" id="budget-total">${totalsMarkup()}</div>
  <form id="add-budget" class="add-form"><label>新增旅費項目<input name="name" required maxlength="200" placeholder="例如：上網 eSIM"></label><label>預估 NT$<input name="estimate" type="number" min="0" max="100000000" step="0.01" required placeholder="例如：500"></label><button class="primary" type="submit">新增旅費</button></form>
  <div class="table-wrap"><table class="budget-table"><thead><tr><th>項目</th><th>預估 NT$<small>下限／上限</small></th><th>已確認／實際 NT$</th><th><span class="sr-only">管理項目</span></th></tr></thead><tbody>${state.budgets.map(r=>`<tr><td><input class="item-name" aria-label="${esc(r.name)}項目名稱" maxlength="200" data-budget-name="${r.id}" value="${esc(r.name)}"><small>${esc(r.note)}</small></td><td><div class="estimate-range"><input aria-label="${esc(r.name)}預估下限" type="number" min="0" max="100000000" step="0.01" data-budget-min="${r.id}" value="${r.min}"><input aria-label="${esc(r.name)}預估上限" type="number" min="0" max="100000000" step="0.01" data-budget-max="${r.id}" value="${r.max}"></div></td><td><input aria-label="${esc(r.name)}實際金額" type="number" min="0" max="100000000" step="0.01" data-budget="${r.id}" value="${r.actual??''}" placeholder="未填"></td><td><button class="remove-item" data-remove-budget="${r.id}" aria-label="刪除旅費：${esc(r.name)}">刪除</button></td></tr>`).join('')||'<tr><td colspan="4" class="empty-list">目前沒有旅費項目，從上方新增第一筆。</td></tr>'}</tbody></table></div>
  <p class="budget-foot">所有金額以兩人新台幣計算。空白實際金額不列入合計；下限不可大於上限。初始清單取自原稿，自訂後合計會隨清單更新。</p><div class="alert">潮風号官網成人單程 ¥500、一日券 ¥1,000。兩人來回為 ¥2,000（依原稿匯率約 NT$408–417），原稿 NT$210 少算，請更新預估或實際金額。</div></section>
  <aside><section class="panel shopping-checks"><h3>購物清單</h3><p class="meta">勾選已買項目，名稱可直接修改；不需要的也可以刪除。</p><form id="add-shopping" class="add-form shopping-add"><label>新增購物項目<input name="name" required maxlength="200" placeholder="例如：Miffy 杯子 ×2"></label><button class="primary" type="submit">新增購物</button></form>
  ${state.shoppingItems.map(item=>`<div class="shopping-row ${item.done?'done':''}"><input aria-label="已購買：${esc(item.name)}" data-shopping="${item.id}" type="checkbox" ${item.done?'checked':''}><input class="item-name" aria-label="${esc(item.name)}購物名稱" maxlength="200" data-shopping-name="${item.id}" value="${esc(item.name)}"><button class="remove-item" data-remove-shopping="${item.id}" aria-label="刪除購物：${esc(item.name)}">刪除</button></div>`).join('')||'<p class="empty-list">清單是空的，新增想帶回家的東西吧。</p>'}
  <label class="note-label" for="shopping-note">品項、尺寸、購買數量備忘</label><textarea id="shopping-note" data-note="shopping" maxlength="10000" placeholder="例如：維尼玩偶 ×1、Miffy 文具、送家人的伴手禮…">${esc(state.notes.shopping||'')}</textarea><p class="savehint">新增、刪除、金額與勾選都會存入「備份進度」。也可匯入舊版備份。</p></section><section class="panel" style="margin-top:20px"><h3>機場留給普通伴手禮</h3><p class="meta">維尼 → Miffy → mofusand。市區買限定商品與喜歡的雜貨，普通伴手禮留到返程機場；15:00 停止購物，回住宿放戰利品。</p></section></aside></div>`;
}
function renderInfo(){$('#main').innerHTML=`<div class="view-heading"><div><p class="eyebrow">GOOD TO KNOW</p><h2>交通與查證筆記</h2><p>行程時間沿用原稿；已查證、修正與尚待確認的內容分開標示。</p></div><span class="meta">資料查核 · ${TRIP.updated}</span></div><div class="info-grid"><section class="panel"><h3>住宿與航班</h3><p><b>Encounter Ohori</b><br>2-chōme-4-4 Minato, 中央区, 福岡市 810-0075<br>全程五晚，以你的住宿憑證為準。</p>${link(map('Encounter Ohori 福岡'),'住宿地圖')}<p><b>11/5 CI116</b> 桃園 16:25 → 福岡 19:35<br><b>11/10 CI111</b> 福岡 11:00 → 桃園<br>以上為原稿資訊，尚未查核航空公司最終班表。時間均為各機場當地時間，日本比台灣快一小時。</p><h4>市內移動</h4><p>大濠公園站位於機場線，經赤坂到天神（兩站），同線可到博多與福岡機場國內線。國際線需接駁，本行程機場往返採計程車。</p></section><section class="panel"><h3>近郊交通，這樣準備</h3><ul><li><b>太宰府＋柳川：</b>西鐵套票；太宰府到柳川須在西鐵二日市轉乘。購票前確認指定船家、使用方向與退費條款。</li><li><b>門司港＋小倉：</b>博多⇄小倉新幹線，加小倉⇄門司港 JR；轉乘與車站步行另留緩衝。</li><li><b>潮風号：</b>成人單程 ¥500，確認 2026/11/7 運行表；有車頂不代表惡劣天候照常行駛。</li><li><b>中洲夜遊：</b>20:00 僅為目標航次，先確認實際售票，再安排報到時間。</li></ul><div class="sources">${link('https://nishitetsu.jp/train/digitalkippu/','西鐵觀光套票')}${link('https://www.retro-line.net/blog/5784/','潮風号改價公告')}${link('https://www.crossroadfukuoka.jp/transport/11452','中洲遊船資訊')}${link('https://www.fukuoka-airport.jp/','福岡機場')}</div></section><section class="panel"><h3>已修正原稿的地方</h3><ul><li>大濠公園→天神為兩站，非一站。</li><li>太宰府→柳川並非直達列車，需轉乘。</li><li>博多→門司港需要計入小倉轉乘緩衝。</li><li>潮風号已核對成人單程 ¥500；原稿兩人來回預算少算一半。</li><li>柳川停航退費／改期須依實際票券條款確認。</li><li>週日不安排公休的祇園鐵鍋，改為天神餃子／定食。</li><li>行程不任意對調週五與週六，以免潮風号無班次。</li></ul></section><section class="panel"><h3>出發前仍要再確認</h3><p>若松屋 10 月起新營業公告；PARCO 各角色店營業、樓層與商品庫存；太宰府整修；旦過市場移轉與收攤；だるま堂井筒屋店 11 月營業。候選餐廳未證實禁菸者均在卡片標示。</p><div class="sources">${link('https://wakamatuya.com/','若松屋公告')}${link('https://mizutakinagano.com/','水たき長野')}${link('https://fukuoka.parco.jp/shop/?category_search=category','PARCO 店舖')}${link('https://www.dazaifutenmangu.or.jp/','太宰府天滿宮')}${link('https://www.izutsuya.co.jp/storelist/kokura/','小倉井筒屋')}${link('https://www.fukuokatower.co.jp/','福岡塔')}</div><h4>網站怎麼保存準備進度</h4><p>勾選、餐廳、安排狀態、備忘與金額僅存在目前瀏覽器；兩人的手機不會自動同步。用「備份進度」下載 JSON，再到另一裝置「匯入備份」。匯入會取代該裝置目前紀錄。關閉私密瀏覽或清除網站資料可能移除紀錄。</p></section></div>`;}
function render(){document.querySelectorAll('.sections [data-view]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.view===currentView);btn.setAttribute('aria-pressed',String(btn.dataset.view===currentView));});$('#prep-count').textContent=`${completed()}/${TASKS.length}`;({days:renderDays,prep:renderPrep,budget:renderBudget,info:renderInfo})[currentView]();$('#storage-status').textContent=storageOK?'進度僅保存在此瀏覽器':'無法儲存，請使用備份進度';}
function route(){const hash=location.hash.slice(1);if(/^day-[1-6]$/.test(hash)){dayId=Number(hash.slice(4));currentView='days';}else if(['prep','budget','info'].includes(hash)){currentView=hash;}else{currentView='days';dayId=1;}render();}
document.addEventListener('click',event=>{const btn=event.target.closest('button');if(!btn)return;if(btn.dataset.day){location.hash=`day-${btn.dataset.day}`;}else if(btn.dataset.view){location.hash=btn.dataset.view==='days'?`day-${dayId}`:btn.dataset.view;}else if(btn.dataset.meal){const key=btn.dataset.meal;const id=btn.dataset.restaurant;if(state.meals[key]===id){delete state.meals[key];delete state.statuses[key];}else{state.meals[key]=id;state.statuses[key]='pending';}save();const y=scrollY;render();window.scrollTo(0,y);toast(state.meals[key]?'已保存餐廳選擇；尚未完成訂位':'已取消選擇');}});
document.addEventListener('change',event=>{const el=event.target;if(el.dataset.check){state.checks[el.dataset.check]=el.checked;save();const y=scrollY;render();window.scrollTo(0,y);document.getElementById(`check-${el.dataset.check}`)?.focus({preventScroll:true});}else if(el.dataset.status){state.statuses[el.dataset.status]=el.value;save();toast('安排狀態已保存');}else if(el.dataset.shopping){const item=state.shoppingItems.find(r=>r.id===el.dataset.shopping);if(item){item.done=el.checked;save();el.closest('.shopping-row').classList.toggle('done',el.checked);}}});
document.addEventListener('input',event=>{
  const el=event.target;
  if(el.name==='name')el.setCustomValidity('');
  if(el.dataset.note){state.notes[el.dataset.note]=el.value;save();return;}
  const fields=[['budget','actual'],['budgetMin','min'],['budgetMax','max'],['budgetName','name']];
  for(const [attribute,field] of fields){if(el.dataset[attribute]===undefined)continue;
    const item=state.budgets.find(r=>r.id===el.dataset[attribute]);if(!item)return;
    let value=field==='name'?el.value.trim():el.value===''?null:Number(el.value);
    const valid=field==='name'?Boolean(value):field==='actual'&&value===null||validAmount(value)&&(field!=='min'||value<=item.max)&&(field!=='max'||value>=item.min);
    el.setCustomValidity(valid?'':'請輸入有效內容；預估下限不可大於上限。');el.setAttribute('aria-invalid',String(!valid));
    if(!valid)return;item[field]=value;save();$('#budget-total').innerHTML=totalsMarkup();return;
  }
  if(el.dataset.shoppingName){const item=state.shoppingItems.find(r=>r.id===el.dataset.shoppingName);if(item&&el.value.trim()){item.name=el.value.trim();el.setCustomValidity('');save();}else el.setCustomValidity('請填寫項目名稱。');}
});
document.addEventListener('focusout',event=>{const el=event.target;if(el.matches('input[aria-invalid="true"], .item-name:invalid')){el.reportValidity();toast('無效的欄位尚未保存，請修正後再匯出。');}});
document.addEventListener('submit',event=>{
  if(!['add-budget','add-shopping'].includes(event.target.id))return;
  event.preventDefault();const form=event.target;const name=form.elements.name.value.trim();if(!name){form.elements.name.setCustomValidity('請填寫項目名稱。');form.elements.name.reportValidity();return;}
  const budget=form.id==='add-budget';const list=budget?state.budgets:state.shoppingItems;
  if(list.length>=500){toast('單一清單最多 500 筆，請先刪除不需要的項目。');return;}
  if(budget){const estimate=Number(form.elements.estimate.value);if(!validAmount(estimate))return;list.push({id:newId('budget'),name,min:estimate,max:estimate,note:'自訂項目',actual:null});}
  else list.push({id:newId('shop'),name,done:false});
  save();renderBudget();toast(budget?'已新增旅費項目':'已新增購物項目');$(`#${budget?'add-budget':'add-shopping'} input[name="name"]`).focus({preventScroll:true});
});
document.addEventListener('click',event=>{
  const btn=event.target.closest('button');if(!btn)return;
  if(btn.hasAttribute('data-undo')){if(lastRemoved){state[lastRemoved.list].splice(lastRemoved.index,0,lastRemoved.item);lastRemoved=null;save();renderBudget();toast('已復原上次刪除');}return;}
  const id=btn.dataset.removeBudget||btn.dataset.removeShopping;if(!id)return;
  const list=btn.dataset.removeBudget?'budgets':'shoppingItems';const index=state[list].findIndex(item=>item.id===id);if(index<0)return;
  lastRemoved={list,index,item:state[list].splice(index,1)[0]};save();renderBudget();toast('項目已刪除，可用上方「復原上次刪除」還原');
});
$('#export').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`fukuoka-preparation-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('準備進度已匯出，可在另一裝置匯入');});
$('#import').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>1000000)throw new Error('備份檔案過大');const incoming=validate(JSON.parse(await file.text()));if(confirm('匯入會取代這個瀏覽器目前的準備進度。建議先備份，確定匯入嗎？')){state=incoming;lastRemoved=null;save();render();toast('已匯入準備進度');}}catch(error){toast('無法匯入：請選擇本網站匯出的有效 JSON 備份。');}event.target.value='';});
$('#print').addEventListener('click',()=>{const printArea=document.createElement('div');printArea.className='print-all';printArea.innerHTML=`<h1 class="print-head">福岡 2026｜11/5–11/10 · 六天五夜</h1><p>資料查核 2026/09/29 · 時間與訂位以實際確認為準</p>${TRIP.days.map(d=>`<section class="print-day">${dayContent(d,true)}</section>`).join('')}<section class="print-day"><h2>行前準備清單</h2>${TASKS.map(t=>`<p>${state.checks[t.id]?'☑':'□'} ${esc(t.title)} · ${esc(t.due)}<br><small>${esc(t.detail)}</small></p>`).join('')}</section>`;document.body.append(printArea);document.body.classList.add('printing');window.print();document.body.classList.remove('printing');printArea.remove();});
window.addEventListener('hashchange',route);
route();




