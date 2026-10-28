'use strict';
const KEY = 'fukuoka-2026-v1';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const map = query => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
const link = (url, text) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
const money = value => new Intl.NumberFormat('zh-TW').format(value);
const legacyShopping = ['小熊維尼｜Disney Store','Miffy｜太宰府甜點＋天神周邊','mofusand｜天神 PARCO','藥妝、保養與日用品','日系生活雜貨｜Afternoon Tea LIVING','普通伴手禮｜機場採購'];
const shoppingItems = SHOPPING_DEFAULTS;
const initial = () => ({version:6,checks:{},meals:{'2-lunch':'wakamatsu','2-dinner':'fishman'},statuses:{'2-lunch':'booked','2-dinner':'booked'},notes:{},foods:{},legacyMeals:[],legacyFoods:[],budgets:BUDGET.map((r,i)=>({id:`budget-${i}`,name:r[0],min:r[1],max:r[2],note:r[3],actual:null})),shoppingItems:shoppingItems.map((name,i)=>({id:`shop-${i}`,name,done:false}))});
let state = initial();
let storageOK = true;
let currentView = 'days';
let dayId = 1;
const mealKeys = TRIP.days.flatMap(day => day.meals.filter(m => m.options.length).map(m => `${day.id}-${m.key}`));
let lastRemoved = null;
const validAmount = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e8;
const newId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
function validate(raw) {
  if (!raw || typeof raw !== 'object' || ![1,2,3,4,5,6].includes(raw.version)) throw new Error('不支援的備份格式');
  const clean = initial();
  for (const t of TASKS) if (raw.checks?.[t.id] === true) clean.checks[t.id] = true;
  for (const day of TRIP.days) {
    if (typeof raw.notes?.[day.id] === 'string') clean.notes[day.id] = raw.notes[day.id].slice(0,10000);
    for (const meal of day.meals) {
      const key = `${day.id}-${meal.key}`;
      if (!meal.fixed && raw.version===6 && meal.options.includes(raw.meals?.[key])) {
        clean.meals[key] = raw.meals[key];
        if (['pending','contacted','booked','walkin'].includes(raw.statuses?.[key])) clean.statuses[key] = raw.statuses[key];
      }
    }
  }
  if (raw.version === 1) {
    clean.budgets=LEGACY_BUDGET.map((r,i)=>({id:`budget-${i}`,name:r[0],min:r[1],max:r[2],note:r[3],actual:validAmount(raw.actual?.[i])?raw.actual[i]:null}));
    clean.shoppingItems=legacyShopping.map((name,i)=>({id:`shop-${i}`,name,done:raw.shopping?.[i]===true}));
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
  for (let i=0;i<(raw.version<6?LEGACY_FOODS:FOODS).length;i++) if(raw.foods?.[i]===true){const j=raw.version<6?FOODS.indexOf(LEGACY_FOODS[i]):i;if(j>=0)clean.foods[j]=true;else clean.legacyFoods.push(LEGACY_FOODS[i]);}
  if(Array.isArray(raw.legacyFoods))clean.legacyFoods=[...new Set([...clean.legacyFoods,...raw.legacyFoods.filter(x=>typeof x==='string').map(x=>x.slice(0,200))])].slice(0,30);
  if(raw.version<6){
    for(const [key,id] of Object.entries(raw.meals||{})){
      if(!/^[1-6]-(breakfast|lunch|dinner)$/.test(key)||typeof id!=='string'||clean.meals[key]===id)continue;
      clean.legacyMeals.push({key,name:(RESTAURANTS[id]?.name||id).slice(0,200),status:String(raw.statuses?.[key]||'pending').slice(0,30)});
    }
  }
  if(Array.isArray(raw.legacyMeals)){
    clean.legacyMeals.push(...raw.legacyMeals.slice(0,30).filter(x=>x&&typeof x.key==='string'&&typeof x.name==='string').map(x=>({key:x.key.slice(0,40),name:x.name.slice(0,200),status:String(x.status||'pending').slice(0,30)})));
    clean.legacyMeals=clean.legacyMeals.filter((x,i,a)=>a.findIndex(y=>y.key===x.key&&y.name===x.name&&y.status===x.status)===i).slice(0,30);
  }
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
function restaurantCard(id,index,key,unavailable=false,fixed=false){const r=RESTAURANTS[id];const selected=state.meals[key]===id;return `<article class="restaurant ${selected?'selected':''}"><div class="restaurant-top"><div><h4>${esc(r.name)}</h4><div class="branch">${esc(r.branch)}</div></div><span class="rank">${fixed?(r.confirmed?'✅ 已預約':'⚠️ 未預約'):unavailable?'此餐不適用':selected?'已選擇':index===0?'主選':'備選'}</span></div><div class="dish">${esc(r.dish)} · ${esc(r.budget)} / 人</div><p>${esc(r.why)}</p><details><summary>營業、訂位與禁菸資訊</summary><p><b>地點：</b>${esc(r.area)}</p><p><b>營業：</b>${esc(r.hours)}</p><p><b>訂位：</b>${esc(r.booking)}</p><p><b>禁菸：</b>${esc(r.smoking)}</p></details><div class="restaurant-links">${locationLinks(r.mapQuery||r.name+' '+r.branch+' '+r.area)}${r.url?link(r.url,r.urlLabel||'官方資訊'):''}${r.reserve?link(r.reserve,'訂位入口'):''}${r.phone?`<a href="tel:${esc(r.phone)}">電話</a>`:''}${r.source?link(r.source,'查證來源'):''}</div>${fixed?`<p class="meta">${esc(r.confirmed||r.booking)}</p>`:`<button class="select-meal" ${unavailable?'disabled':''} data-meal="${key}" data-restaurant="${id}" aria-pressed="${selected}">${unavailable?'當日／此時段不適用':selected?'✓ 已選這間 · 再按取消':'選這間'}</button>`}</article>`;}
function mealGroup(meal,day){const key=`${day.id}-${meal.key}`;return `<section class="meal-group"><div class="meal-head"><h3>${esc(meal.label)} <small>${esc(meal.time)}</small></h3>${meal.options.length?`<span>${meal.fixed?'已預約':meal.options.length+' 間候選'}</span>`:''}</div><p>${esc(meal.note)}</p>${meal.options.length?`<p class="booking-badge">${meal.fixed?'✅ 已預約（依v4.0行程）':state.statuses[key]==='booked'?'✅ 已預約（你的更新紀錄）':'⚠️ 未預約／尚未取得訂位確認'}</p>`:''}${meal.options.length?meal.options.map((id,i)=>restaurantCard(id,i,key,false,meal.fixed)).join(''):`<div class="empty-meal">${esc(meal.displayText||meal.label+'無福岡餐廳安排')}</div>`}${meal.backups?.length?`<details class="unavailable"><summary>僅預約異常時使用的備案</summary>${meal.backups.map(id=>restaurantCard(id,1,key,false,true)).join('')}</details>`:''}${meal.unavailable?.length?`<details class="unavailable"><summary>原稿候選：公休或此時段不適用（${meal.unavailable.length}）</summary>${meal.unavailable.map(id=>restaurantCard(id,0,key,true)).join('')}</details>`:''}${meal.options.length&&!meal.fixed?`<div class="meal-status"><label for="status-${key}">安排狀態</label><select id="status-${key}" data-status="${key}" ${!state.meals[key]?'disabled':''}>${[['pending','尚未確認'],['contacted','已詢問店家'],['booked','已取得訂位確認'],['walkin','決定現場候位']].map(([v,label])=>`<option value="${v}" ${(state.statuses[key]||'pending')===v?'selected':''}>${label}</option>`).join('')}</select><small>${state.meals[key]?'由你手動記錄，不會自動訂位':'先選一間餐廳'}</small></div>`:''}</section>`;}
function dayContent(d,printing=false){return `<div class="day-head"><div class="day-overline">DAY 0${d.id} <span>2026 / ${d.date.replace('.',' / ')} ${esc(d.week)}</span></div><h2>${esc(d.title)}</h2><p>${esc(d.subtitle)}</p><div class="tags">${d.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div></div><div class="section-title"><h3>這一天怎麼走</h3><small>${esc(d.steps)}</small></div><div class="timeline">${d.timeline.map(([time,title,note,location])=>`<div class="event"><time>${esc(time)}</time><div><h4>${esc(title)}</h4><p>${esc(note)}</p>${locationLinks(location)}</div></div>`).join('')}</div><div class="alert"><strong>今天的節奏</strong><br>${esc(d.priority)}<br><strong>備案：</strong>${esc(d.weather)}</div>${d.extras?.length?`<details class="panel"><summary>其他彈性餐飲：開啟區域地圖</summary><p class="meta">原稿未指定分店的選項；先看地圖、營業與現場菜單。</p>${d.extras.map(([label,q])=>`<p>${esc(label)}</p>${locationLinks(q)}`).join('')}</details>`:''}<div class="meals"><div class="section-title"><h3>這一天吃什麼</h3></div><p class="meta">預算為每人日圓規劃估計，非報價；選擇餐廳不等於完成訂位。未證實禁菸的店先向店家確認。</p>${d.meals.map(m=>mealGroup(m,d)).join('')}${d.snacks?.length?`<section class="meal-group"><h3>順路小吃與下午茶｜⚠️ 未預約／現場</h3>${d.snacks.map(id=>restaurantCard(id,0,'snack',false,true)).join('')}</section>`:''}</div><section class="panel"><label class="note-label" for="day-note-${d.id}">這一天的備忘</label>${printing?`<p>${esc(state.notes[d.id]||'尚無備忘')}</p>`:`<textarea id="day-note-${d.id}" data-note="${d.id}" maxlength="10000" placeholder="例如：訂位姓名、集合時間、想買的商品…">${esc(state.notes[d.id]||'')}</textarea><p class="savehint">只保存在此瀏覽器；換裝置請先備份，再匯入。</p>`}</section>`;}
function renderDays(){const d=TRIP.days[dayId-1];$('#main').innerHTML=`<div class="day-layout"><aside class="daynav" aria-label="選擇日期">${TRIP.days.map(day=>`<button data-day="${day.id}" class="${day.id===dayId?'active':''}" aria-pressed="${day.id===dayId}"><span class="number">${day.date}</span><span class="day-label">${esc(day.place)}<small>DAY 0${day.id} · ${day.week}</small></span></button>`).join('')}<div class="trip-base"><strong>五晚，同一個家</strong><p>Encounter Ohori<br>大濠公園駅周邊</p>${link(map('Encounter Ohori 福岡'),'住宿地圖')}<p>不換宿、不搬行李。<br>機場往返直搭計程車。</p></div></aside><section class="day-content">${dayContent(d)}</section><aside class="side"><section class="panel progress-panel">${progress()}</section><section class="panel prep-panel"><div class="progress-top"><h3>這天要先準備</h3><small>${d.tasks.filter(id=>state.checks[id]).length}/${d.tasks.length}</small></div>${d.tasks.map(id=>taskRow(TASKS.find(t=>t.id===id))).join('')}<button class="all-prep" data-view="prep">查看全部行前準備</button></section><section class="panel note-panel"><h3>留點彈性給旅行</h3><p>一般候位超過20–30分鐘就換備案；真正必吃最多30–40分鐘，且兩人都願意。</p><p>時間為規劃目標，交通班次須再確認；若松屋12:30與魚男18:00皆已預約，請保存確認資料。</p></section></aside></div>`;}
function renderPrep(){const groups=[...new Set(TASKS.map(t=>t.group))];$('#main').innerHTML=`<div class="view-heading"><div><p class="eyebrow">BEFORE WE GO</p><h2>一件一件準備好</h2><p>先確認11/2天氣決策與Klook，再核對餐廳和交通。勾選會同步到每日行程旁。</p></div><span class="meta">出發日 · 2026/11/05</span></div><div class="prep-intro"><section class="panel">${progress()}</section><section class="panel"><h3>待確認：華味鳥博多駅前店</h3><p>⚠️ 第一順位11/7（六）17:30、兩位尚未預約；11/2決定購物日期後再核對。長野已客滿，本趟放棄；若松屋與魚男已預約，保存確認資料即可。</p><p lang="ja">11月7日の17時30分に、2名で予約できますか？</p>${link('https://yoyaku.toreta.in/hakataekimaeten/','官方訂位入口')}</section></div>${mealSummary()}<div class="prep-grid">${groups.map(group=>`<section class="task-card"><h3>${esc(group)}</h3>${TASKS.filter(t=>t.group===group).map(t=>taskRow(t,true)).join('')}</section>`).join('')}</div>${foodMarkup()}${legacyMarkup()}`;}
function totals(){const rows=state.budgets;const values=rows.filter(r=>r.actual!==null);return {min:rows.reduce((sum,r)=>sum+r.min,0),max:rows.reduce((sum,r)=>sum+r.max,0),actual:values.reduce((sum,r)=>sum+r.actual,0),count:values.length};}
function totalsMarkup(){const t=totals();return `<div><small>目前清單預估 · 兩人 / NT$</small><strong>${money(t.min)}–${money(t.max)}</strong></div><div><small>已填金額 · ${t.count}/${state.budgets.length} 項</small><strong>NT$ ${money(t.actual)}</strong></div>`;}
function renderBudget(){
  $('#main').innerHTML=`<div class="view-heading"><div><p class="eyebrow">TRAVEL LIGHT, PLAN WELL</p><h2>旅費與想帶回家的東西</h2><p>自由新增、修改或移除項目；匯出檔會保留完整清單與進度。</p></div><button class="quiet" data-undo ${lastRemoved?'':'disabled'}>復原上次刪除</button></div>
  <div class="budget-layout"><section><div class="budget-total" id="budget-total">${totalsMarkup()}</div>
  <form id="add-budget" class="add-form"><label>新增旅費項目<input name="name" required maxlength="200" placeholder="例如：上網 eSIM"></label><label>預估 NT$<input name="estimate" type="number" min="0" max="100000000" step="0.01" required placeholder="例如：500"></label><button class="primary" type="submit">新增旅費</button></form>
  <div class="table-wrap"><table class="budget-table"><thead><tr><th>項目</th><th>預估 NT$<small>下限／上限</small></th><th>已確認／實際 NT$</th><th><span class="sr-only">管理項目</span></th></tr></thead><tbody>${state.budgets.map(r=>`<tr><td><input class="item-name" aria-label="${esc(r.name)}項目名稱" maxlength="200" data-budget-name="${r.id}" value="${esc(r.name)}"><small>${esc(r.note)}</small></td><td><div class="estimate-range"><input aria-label="${esc(r.name)}預估下限" type="number" min="0" max="100000000" step="0.01" data-budget-min="${r.id}" value="${r.min}"><input aria-label="${esc(r.name)}預估上限" type="number" min="0" max="100000000" step="0.01" data-budget-max="${r.id}" value="${r.max}"></div></td><td><input aria-label="${esc(r.name)}實際金額" type="number" min="0" max="100000000" step="0.01" data-budget="${r.id}" value="${r.actual??''}" placeholder="未填"></td><td><button class="remove-item" data-remove-budget="${r.id}" aria-label="刪除旅費：${esc(r.name)}">刪除</button></td></tr>`).join('')||'<tr><td colspan="4" class="empty-list">目前沒有旅費項目，從上方新增第一筆。</td></tr>'}</tbody></table></div>
  <p class="budget-foot">所有金額以兩人新台幣計算。空白實際金額不列入合計；下限不可大於上限。v4.0未重報預算。初始清單移除舊交通票券；已有清單完整保留，請自行調整。</p><div class="alert">Klook團費、另付門票與餐費尚未報價；待填項目不代表免費，合計尚未包含完整一日遊費用。既有自訂清單不會被更新覆蓋，請新增或調整相關項目。</div></section>
  <aside><section class="panel shopping-checks"><h3>購物清單</h3><p class="meta">勾選已買項目，名稱可直接修改；不需要的也可以刪除。</p><form id="add-shopping" class="add-form shopping-add"><label>新增購物項目<input name="name" required maxlength="200" placeholder="例如：Miffy 杯子 ×2"></label><button class="primary" type="submit">新增購物</button></form>
  ${state.shoppingItems.map(item=>`<div class="shopping-row ${item.done?'done':''}"><input aria-label="已購買：${esc(item.name)}" data-shopping="${item.id}" type="checkbox" ${item.done?'checked':''}><input class="item-name" aria-label="${esc(item.name)}購物名稱" maxlength="200" data-shopping-name="${item.id}" value="${esc(item.name)}"><button class="remove-item" data-remove-shopping="${item.id}" aria-label="刪除購物：${esc(item.name)}">刪除</button></div>`).join('')||'<p class="empty-list">清單是空的，新增想帶回家的東西吧。</p>'}
  <label class="note-label" for="shopping-note">品項、尺寸、購買數量備忘</label><textarea id="shopping-note" data-note="shopping" maxlength="10000" placeholder="例如：維尼玩偶 ×1、Miffy 文具、送家人的伴手禮…">${esc(state.notes.shopping||'')}</textarea><p class="savehint">新增、刪除、金額與勾選都會存入「備份進度」。也可匯入舊版備份。</p></section><section class="panel" style="margin-top:20px"><h3>機場留給普通伴手禮</h3><p class="meta">11/7博多＋11/8天神兩個完整購物日。維尼→Miffy→mofusand→拉拉熊；新增耳夾、襪子、護手霜／Body Milk與乾肌彩妝。舊自訂清單會保留，可自行新增這些品項。</p></section></aside></div>`;
}
function mealSummary(){return `<section class="panel"><h3>v4.0 用餐與預約總表</h3><p>午餐11:00–12:30、晚餐17:00–18:30開始；抵達日與Klook日例外。原稿只有11/6兩餐已預約，其餘可在餐廳卡更新你的後續確認。</p><div class="table-wrap"><table class="budget-table"><thead><tr><th>日期</th><th>午餐</th><th>晚餐</th><th>目前紀錄</th></tr></thead><tbody>${TRIP.days.map(d=>`<tr><td>${d.date}</td>${['lunch','dinner'].map(k=>{const m=d.meals.find(x=>x.key===k);return `<td>${esc(m?.time||'—')}<br>${m?.options.length?esc(state.meals[d.id+'-'+k]?RESTAURANTS[state.meals[d.id+'-'+k]].name:k==='lunch'&&d.id===4?'天神店家待定':RESTAURANTS[m.options[0]].name):esc(m?.displayText||'無福岡安排')}</td>`;}).join('')}<td>${d.id===6?'回程航班':d.meals.filter(m=>m.options.length).map(m=>`${esc(m.label.split('｜')[0])}：${m.fixed?'✅ 已預約':state.statuses[d.id+'-'+m.key]==='booked'?'✅ 已預約（你的紀錄）':'⚠️ 未預約'}`).join('<br>')}</td></tr>`).join('')}</tbody></table></div><p>❌ 水たき長野：11/9客滿，本趟已放棄。</p></section>`;}
function renderInfo(){$('#main').innerHTML=`<div class="view-heading"><div><p class="eyebrow">GOOD TO KNOW · V4.0</p><h2>交通、購物與行前須知</h2><p>兩天完整購物版 · 查核 ${TRIP.updated} · 所有時間仍以當日公告為準</p></div></div>${mealSummary()}<div class="info-grid">${INFO.map(([title,body,places=[],sources=[]])=>`<section class="panel"><h3>${esc(title)}</h3><p>${esc(body)}</p><div class="sources">${places.map(([label,query])=>link(map(query),label+'地圖')).join('')}${sources.map(([label,url])=>link(url,label)).join('')}</div></section>`).join('')}</div>${legacyMarkup()}`;}
function legacyMarkup(){return state.legacyMeals.length?`<section class="panel legacy-record"><h3>舊版餐廳紀錄：請重新核對</h3><p>行程時段已變更，以下紀錄保留供參考，不會自動視為新行程已訂位；已有訂位請自行聯絡店家改約。</p>${state.legacyMeals.map(x=>`<p>DAY ${esc(x.key)} · ${esc(x.name)} · ${esc(({pending:'尚未確認',contacted:'已詢問店家',booked:'曾記錄已訂位',walkin:'曾決定候位'})[x.status]||x.status)}</p>`).join('')}</section>`:'';}
function locationLinks(location){return (Array.isArray(location)?location:[location]).filter(Boolean).map(q=>`<span class="location-links">${link(map(q),'Google Maps：'+q)}${link('https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(q),'從目前位置導航')}</span>`).join('');}
function foodMarkup(){return `<section class="panel food-checklist"><h3>福岡必吃完成度</h3><p>吃過就勾選，會一起保存與備份。</p>${state.legacyFoods.length?`<details><summary>舊行程已完成的美食紀錄</summary><p>${state.legacyFoods.map(esc).join('、')}</p></details>`:''}<div class="food-grid">${FOODS.map((food,i)=>`<label><input type="checkbox" data-food="${i}" ${state.foods[i]?'checked':''}> ${esc(food)}</label>`).join('')}</div></section>`;}
function render(){document.querySelectorAll('.sections [data-view]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.view===currentView);btn.setAttribute('aria-pressed',String(btn.dataset.view===currentView));});$('#prep-count').textContent=`${completed()}/${TASKS.length}`;({days:renderDays,prep:renderPrep,budget:renderBudget,info:renderInfo})[currentView]();$('#storage-status').textContent=storageOK?'進度僅保存在此瀏覽器':'無法儲存，請使用備份進度';}
function route(){const hash=location.hash.slice(1);if(/^day-[1-6]$/.test(hash)){dayId=Number(hash.slice(4));currentView='days';}else if(['prep','budget','info'].includes(hash)){currentView=hash;}else{currentView='days';dayId=1;}render();}
document.addEventListener('click',event=>{const btn=event.target.closest('button');if(!btn)return;if(btn.dataset.day){location.hash=`day-${btn.dataset.day}`;}else if(btn.dataset.view){location.hash=btn.dataset.view==='days'?`day-${dayId}`:btn.dataset.view;}else if(btn.dataset.meal){const key=btn.dataset.meal;const id=btn.dataset.restaurant;if(state.meals[key]===id){delete state.meals[key];delete state.statuses[key];}else{state.meals[key]=id;state.statuses[key]='pending';}save();const y=scrollY;render();window.scrollTo(0,y);toast(state.meals[key]?'已保存餐廳選擇；尚未完成訂位':'已取消選擇');}});
document.addEventListener('change',event=>{const el=event.target;if(el.dataset.food!==undefined){state.foods[el.dataset.food]=el.checked;save();}else if(el.dataset.check){state.checks[el.dataset.check]=el.checked;save();const y=scrollY;render();window.scrollTo(0,y);document.getElementById(`check-${el.dataset.check}`)?.focus({preventScroll:true});}else if(el.dataset.status){state.statuses[el.dataset.status]=el.value;save();const y=scrollY;render();window.scrollTo(0,y);toast('安排狀態已保存');}else if(el.dataset.shopping){const item=state.shoppingItems.find(r=>r.id===el.dataset.shopping);if(item){item.done=el.checked;save();el.closest('.shopping-row').classList.toggle('done',el.checked);}}});
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
$('#print').addEventListener('click',()=>{const printArea=document.createElement('div');printArea.className='print-all';printArea.innerHTML=`<h1 class="print-head">福岡 2026｜11/5–11/10 · 六天五夜</h1><p>v4.0 · 資料查核 2026/10/28 · 時間與訂位以實際確認為準</p>${TRIP.days.map(d=>`<section class="print-day">${dayContent(d,true)}</section>`).join('')}<section class="print-day"><h2>行前準備清單</h2>${TASKS.map(t=>`<p>${state.checks[t.id]?'☑':'□'} ${esc(t.title)} · ${esc(t.due)}<br><small>${esc(t.detail)}</small></p>`).join('')}</section>`;document.body.append(printArea);document.body.classList.add('printing');window.print();document.body.classList.remove('printing');printArea.remove();});
window.addEventListener('hashchange',route);
route();





