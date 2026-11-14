/* DayBloom: a private, offline-first family planner. No external libraries or accounts. */
'use strict';
// V2 intentionally starts with a clean slate, separate from the original demo version.
const KEY = 'daybloom-family-planner-v2';
const COLORS = {
  pink: {tint:'#ffe2e5',accent:'#ee91a4'},
  yellow:{tint:'#fff1c7',accent:'#f4c84f'},
  mint:{tint:'#d8f3eb',accent:'#65cbb7'},
  sky:{tint:'#dceeff',accent:'#79b9ef'},
  lavender:{tint:'#eee3ff',accent:'#bb98ed'},
  peach:{tint:'#ffe9da',accent:'#efa67a'}
};
const MEAL_SLOTS=['Breakfast','Lunch','Dinner'];
const $ = sel => document.querySelector(sel);
const today = () => iso(new Date());
const pad = n => String(n).padStart(2,'0');
function iso(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function asDate(s){const [y,m,d]=String(s).slice(0,10).split('-').map(Number);return new Date(y||2026,(m||1)-1,d||1);}
function plusDays(s,n){const d=asDate(s);d.setDate(d.getDate()+n);return iso(d);}
function weekStart(s){return plusDays(s,-((asDate(s).getDay()+6)%7));}
function monthShift(s,n){const d=asDate(s);d.setDate(1);d.setMonth(d.getMonth()+n);return iso(d);}
function fmtDate(s,opts={month:'short',day:'numeric'}){return asDate(s).toLocaleDateString(undefined,opts);}
function fullDay(s){return fmtDate(s,{weekday:'long',month:'short',day:'numeric'});}
function timeLabel(s){if(!s)return 'All day';const [h,m]=s.split(':').map(Number);return new Date(2020,0,1,h,m).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});}
function uid(){return (typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():`id-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function color(person){return COLORS[person?.color]||COLORS.sky;}
function member(id){return state.people.find(p=>p.id===id);}
function tintAttr(id){const c=color(member(id));return `style="--tint:${c.tint};--accent:${c.accent}"`;}
function buttonLabel(s){return escapeHTML(s);}
function emptyState(){return {people:[],events:[],tasks:[],lists:[],meals:[],sleep:[],photos:[]};}
function load(){
  try{
    const raw=localStorage.getItem(KEY);
    if(!raw)return emptyState();
    const x=JSON.parse(raw);
    if(!x||!Array.isArray(x.people)||!Array.isArray(x.events))throw Error('Bad data');
    return {
      people:x.people,events:x.events,
      tasks:Array.isArray(x.tasks)?x.tasks:[],
      lists:Array.isArray(x.lists)?x.lists:[],
      meals:Array.isArray(x.meals)?x.meals:[],
      sleep:Array.isArray(x.sleep)?x.sleep:[],
      photos:Array.isArray(x.photos)?x.photos:[]
    };
  }catch(e){console.warn('Could not load planner',e);return emptyState();}
}
let state=load();
let view='calendar';
let mode='week';
let focusDate=today();
let personFilter='all';
let taskScope='all';
let toastTimer;
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));return true;}catch(e){showToast('Storage is full — export a backup or remove photos');return false;}}
function showToast(s){const el=$('#toast');el.textContent=s;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200);}
function notify(s){save();render();showToast(s);}
function filteredPerson(id){return personFilter==='all'||id===personFilter;}
function visibleTasks(){return state.tasks.filter(t=>filteredPerson(t.personId));}
function taskCounts(id){const start=weekStart(focusDate),end=plusDays(start,6);const arr=state.tasks.filter(t=>t.personId===id&&t.due>=start&&t.due<=end);return {done:arr.filter(t=>t.done).length,total:arr.length};}
function clock(){const d=new Date();$('#clockDate').textContent=d.toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'});$('#clockTime').textContent=d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});const hour=d.getHours();$('#greeting').textContent=hour<12?'Good morning, sunshine ☀️':hour<18?'Good afternoon, sunshine 🌷':'Good evening, sunshine ✨';}
function renderPeople(){
  if(!state.people.length){
    $('#familyOverview').innerHTML=`<div class="family-get-started"><span class="get-started-icon">🏡</span><div><strong>Make this space yours</strong><div class="person-sub">Add yourself or your family members to get started. Or create tasks without assigning anyone.</div></div><button class="btn btn-primary" data-add="member">＋ Add family member</button></div>`;
    return;
  }
  $('#familyOverview').innerHTML=state.people.map(p=>{const c=color(p),ct=taskCounts(p.id);return `<button class="person-chip ${personFilter===p.id?'active':''}" data-filter-person="${escapeHTML(p.id)}" style="--tint:${c.tint};--accent:${c.accent}" title="Filter to ${escapeHTML(p.name)}"><span class="person-avatar">${escapeHTML(p.name.slice(0,1).toUpperCase())}</span><span><span class="person-name">${escapeHTML(p.name)}</span><div class="person-sub">Weekly tasks</div></span><span class="person-count">${ct.done}/${ct.total}</span></button>`;}).join('')+`<button class="person-chip ${personFilter==='all'?'active':''}" data-filter-person="all" style="--tint:#edf0fa;--accent:#8392ab" title="Show everyone"><span class="person-avatar">⌂</span><span><span class="person-name">Everyone</span><div class="person-sub">Show all plans</div></span></button>`;
}
function renderNavigation(){document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===view||(view==='rewards'&&b.dataset.nav==='settings'&&b.closest('.bottom-nav'))||(view==='sleep'&&b.dataset.nav==='settings'&&b.closest('.bottom-nav'))||(view==='photos'&&b.dataset.nav==='settings'&&b.closest('.bottom-nav'))));$('#pendingCount').textContent=state.tasks.filter(t=>!t.done).length||'';}
function header(title,description,actions=''){return `<div class="section-head"><div><h1 class="section-title">${title}</h1><p class="section-sub">${description}</p></div>${actions}</div>`;}
function eventCard(e){const p=member(e.personId);return `<button class="event-card" ${tintAttr(e.personId)} data-edit-event="${escapeHTML(e.id)}" title="Edit ${escapeHTML(e.title)}"><div class="event-title">${escapeHTML(e.title)}</div><div class="event-time">${e.startTime?timeLabel(e.startTime)+(e.endTime?' – '+timeLabel(e.endTime):''):'All day'}</div>${p?`<span class="event-person" title="${escapeHTML(p.name)}">${escapeHTML(p.name[0].toUpperCase())}</span>`:''}</button>`;}
function eventsOn(day){return state.events.filter(e=>e.date===day&&filteredPerson(e.personId)).sort((a,b)=>(a.startTime||'').localeCompare(b.startTime||''));}
function calendarControls(){const from=mode==='week'?weekStart(focusDate):focusDate;const period=mode==='week'?`${fmtDate(from)} – ${fmtDate(plusDays(from,6))}`:fmtDate(from,{month:'long',year:'numeric'});return `<div class="toolbar"><div class="date-control"><button class="icon-btn" data-shift="-1" title="Previous">‹</button><div class="period-label">${escapeHTML(period)}</div><button class="icon-btn" data-shift="1" title="Next">›</button></div><button class="btn btn-small" data-today>Today</button><div class="segmented"><button class="${mode==='week'?'active':''}" data-mode="week">Week</button><button class="${mode==='month'?'active':''}" data-mode="month">Month</button></div></div>`;}
function renderWeek(){const first=weekStart(focusDate);let out='<div class="calendar-grid">';for(let i=0;i<7;i++){const d=plusDays(first,i),ev=eventsOn(d),isToday=d===today();out+=`<section class="day-panel ${isToday?'today':''}"><div class="day-heading"><div class="day-label">${fmtDate(d,{weekday:'short'})}<span>${fmtDate(d,{day:'numeric'})}</span></div><div class="day-meta">${ev.length} event${ev.length===1?'':'s'} <button class="mini-add" data-add-day="${d}" title="Add event on ${fullDay(d)}">＋</button></div></div><div class="event-stack">${ev.length?ev.map(eventCard).join(''):`<button class="empty-day" data-add-day="${d}">＋ Add an event</button>`}</div></section>`;}return out+'</div>';}
function renderMonth(){const first=iso(new Date(asDate(focusDate).getFullYear(),asDate(focusDate).getMonth(),1));const firstGrid=weekStart(first);const last=new Date(asDate(focusDate).getFullYear(),asDate(focusDate).getMonth()+1,0);const num=Math.ceil((Math.round((asDate(iso(last))-asDate(firstGrid))/86400000)+1)/7)*7;let s='<div class="month-scroll"><div class="month-grid">';for(const w of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])s+=`<div class="month-weekday">${w}</div>`;for(let i=0;i<num;i++){const d=plusDays(firstGrid,i),ev=eventsOn(d);s+=`<div class="month-day ${d.slice(0,7)!==focusDate.slice(0,7)?'outside':''} ${d===today()?'today':''}" data-jump-day="${d}"><div class="month-date">${fmtDate(d,{day:'numeric'})}<button data-add-day="${d}" title="Add event">+</button></div>${ev.slice(0,3).map(e=>`<div class="month-item" ${tintAttr(e.personId)} title="${escapeHTML(e.title)}">${escapeHTML(e.title)}</div>`).join('')}${ev.length>3?`<div class="month-extra">+${ev.length-3} more</div>`:''}</div>`;}return s+'</div></div>';}
function renderCalendar(){return header('Family calendar','All your meaningful moments in one place.',calendarControls())+(mode==='week'?renderWeek():renderMonth());}
function renderTasks(){const all=visibleTasks().filter(t=>taskScope==='all'||(taskScope==='open'?!t.done:t.done)).sort((a,b)=>a.due.localeCompare(b.due)||Number(a.done)-Number(b.done));let s=header('To-do list','One little win at a time.',`<button class="btn btn-primary" data-add="task">＋ New task</button>`);s+=`<div class="filter-line">${[['all','All tasks'],['open','To do'],['done','Completed']].map(([key,label])=>`<button class="filter-pill ${taskScope===key?'active':''}" data-task-scope="${key}">${label}</button>`).join('')}</div>`;if(!all.length)return s+empty('☑️','No tasks yet','Add your first task or try a different filter.');return s+`<div class="card-surface"><div class="task-list">${all.map(t=>{const p=member(t.personId);return `<div class="task-item ${t.done?'task-done':''}"><input class="custom-check" aria-label="Complete ${escapeHTML(t.title)}" data-check-task="${escapeHTML(t.id)}" type="checkbox" ${t.done?'checked':''}/><div class="task-body"><div class="task-title">${escapeHTML(t.title)}</div><div class="task-meta">📅 ${fmtDate(t.due,{weekday:'short',month:'short',day:'numeric'})}${p?` &nbsp; <span class="person-dot" style="background:${color(p).accent}"></span>${escapeHTML(p.name)}`:''}</div></div><div class="task-actions"><button class="bare-btn" data-edit-task="${escapeHTML(t.id)}" title="Edit task">✎</button><button class="bare-btn" data-delete-task="${escapeHTML(t.id)}" title="Delete task">✕</button></div></div>`;}).join('')}</div></div>`;}
function empty(emoji,title,description){return `<div class="empty-state"><div class="empty-emoji">${emoji}</div><strong>${title}</strong>${description}</div>`;}
function renderLists(){let s=header('Family lists','Keep the little things from slipping through the cracks.',`<button class="btn btn-primary" data-add="list">＋ New list</button>`);if(!state.lists.length)return s+empty('📝','Start your first list','Groceries, packing, ideas — whatever is on your mind.');return s+`<div class="two-cols">${state.lists.map(l=>`<div class="card-surface list-card"><div class="day-heading"><h2 class="card-title" style="margin:0">${escapeHTML(l.name)}</h2><div><button class="bare-btn" data-edit-list="${escapeHTML(l.id)}" title="Rename list">✎</button><button class="bare-btn" data-delete-list="${escapeHTML(l.id)}" title="Delete list">✕</button></div></div><p class="section-sub" style="margin:0 0 14px">${l.items.filter(i=>i.done).length} of ${l.items.length} completed</p><div class="list-items">${l.items.map(i=>`<label class="list-check-row ${i.done?'completed':''}"><input class="custom-check" type="checkbox" data-check-list="${escapeHTML(l.id)}" data-item-id="${escapeHTML(i.id)}" ${i.done?'checked':''}/><span style="flex:1;overflow-wrap:anywhere">${escapeHTML(i.text)}</span><button class="bare-btn" data-remove-list-item="${escapeHTML(l.id)}" data-item-id="${escapeHTML(i.id)}" title="Remove item" type="button">✕</button></label>`).join('')}</div><form class="list-input-row" data-list-form="${escapeHTML(l.id)}"><input name="item" placeholder="Add an item..." aria-label="New list item" required maxlength="160" /><button class="btn btn-small" type="submit">＋</button></form></div>`).join('')}</div>`;}
function getMeal(d,slot){return state.meals.find(m=>m.date===d&&m.slot===slot);}
function renderMeals(){const first=weekStart(focusDate),days=Array.from({length:7},(_,i)=>plusDays(first,i));return header('Meal planner','Breakfast, lunch, dinner — deliciously organized.',`<div class="toolbar"><button class="icon-btn" data-shift="-1">‹</button><span class="period-label">${fmtDate(first)} – ${fmtDate(plusDays(first,6))}</span><button class="icon-btn" data-shift="1">›</button><button class="btn btn-small" data-today>Today</button></div>`)+`<div class="three-cols">${days.map(d=>`<section class="card-surface"><div class="meal-day-title"><span>${fmtDate(d,{weekday:'short',month:'short',day:'numeric'})}</span>${d===today()?'<span class="pill">Today</span>':''}</div>${MEAL_SLOTS.map(slot=>{const m=getMeal(d,slot);return `<button class="meal-slot" data-meal-date="${d}" data-meal-slot="${slot}"><div class="slot-label">${slot}</div><div class="slot-value">${m?escapeHTML(m.title):'<span style="color:#b0b8c5">＋ Add a meal</span>'}</div></button>`;}).join('')}</section>`).join('')}</div>`;}
function renderRewards(){const counts=state.people.map(p=>({p,...taskCounts(p.id)})),done=counts.reduce((a,c)=>a+c.done,0);return header('Family rewards','Celebrate the small victories together. ✨')+`<div class="three-cols"><div class="card-surface"><div class="stat-number">${done} ⭐</div><div class="stat-caption">Tasks completed this week</div></div><div class="card-surface"><div class="stat-number">${state.tasks.filter(t=>t.done).length}</div><div class="stat-caption">All-time completed tasks</div></div><div class="card-surface"><div class="stat-number">${counts.length}</div><div class="stat-caption">Family members earning stars</div></div></div><h2 style="margin:27px 0 14px;font-size:17px">This week's stars</h2><div class="two-cols">${counts.map(({p,done,total})=>`<div class="reward-card"><div class="reward-icon">${done>=5?'🏆':done>=3?'🌟':done>=1?'⭐':'🌱'}</div><strong>${escapeHTML(p.name)}</strong><div class="stat-caption">${done} of ${total} tasks done</div><div class="progress-track"><div class="progress-fill" style="width:${total?Math.round(done/total*100):0}%;background:${color(p).accent}"></div></div><p class="hint">${done>=5?'Superstar! Five or more tasks finished.':done>=3?'Wonderful work! Three tasks finished.':done>=1?'A great start. Keep going!':'Every little step counts.'}</p></div>`).join('')}</div><p class="hint">Stars are automatically awarded when you check off tasks. No purchases or accounts are involved.</p>`;}
function renderSleep(){let s=header('Sleep tracker','Make space for a little more rest.',`<button class="btn btn-primary" data-add="sleep">＋ Log sleep</button>`);const logs=state.sleep.filter(x=>filteredPerson(x.personId)).slice().sort((a,b)=>b.date.localeCompare(a.date));if(!logs.length)return s+empty('🌙','No sleep logs yet','Log sleep to see patterns over time.');const avg=(logs.reduce((n,x)=>n+Number(x.hours),0)/logs.length).toFixed(1);s+=`<div class="card-surface" style="margin-bottom:16px"><div class="stat-number">${avg} <span style="font-size:16px">hrs</span></div><div class="stat-caption">Average from ${logs.length} recorded night${logs.length===1?'':'s'}</div></div><div class="two-cols">`;s+=logs.map(x=>{const p=member(x.personId);return `<div class="card-surface"><div class="day-heading"><strong>${fmtDate(x.date,{weekday:'short',month:'short',day:'numeric'})}</strong><div><button class="bare-btn" data-edit-sleep="${escapeHTML(x.id)}">✎</button><button class="bare-btn" data-delete-sleep="${escapeHTML(x.id)}">✕</button></div></div><div class="stat-number">${Number(x.hours).toFixed(1)} <span style="font-size:14px">hours</span></div><div class="stat-caption">${p?escapeHTML(p.name):'Family'}${x.notes?' · '+escapeHTML(x.notes):''}</div></div>`;}).join('');return s+'</div>';}
function renderPhotos(){let s=header('Family photos','Save a few favorite moments on this device.',`<button class="btn btn-primary" data-upload-photo>＋ Add photo</button>`);if(!state.photos.length)return s+empty('🖼️','Your gallery is empty','Add photos to keep a few memories close.');return s+`<div class="photo-grid">${state.photos.map(p=>`<div class="photo-card"><img src="${escapeHTML(p.data)}" alt="${escapeHTML(p.caption||'Family photo')}" loading="lazy"/><div class="photo-card-details"><span>${escapeHTML(p.caption||fmtDate(p.date))}</span><button class="bare-btn" data-delete-photo="${escapeHTML(p.id)}" title="Delete photo">✕</button></div></div>`).join('')}</div><p class="hint">Photos use device browser storage and may fill it quickly. Export a backup regularly.</p>`;}
function renderSettings(){return header('Settings','Make this space your own.')+`<div class="two-cols"><section class="card-surface settings-group"><div class="day-heading"><h3>Family members</h3><button class="btn btn-small" data-add="member">＋ Add person</button></div>${state.people.length?state.people.map(p=>`<div class="settings-person"><span class="person-avatar" style="background:${color(p).accent}">${escapeHTML(p.name[0].toUpperCase())}</span><strong>${escapeHTML(p.name)}</strong><span class="spacer"></span><button class="bare-btn" data-edit-member="${escapeHTML(p.id)}" title="Edit person">✎</button><button class="bare-btn" data-delete-member="${escapeHTML(p.id)}" title="Delete person">✕</button></div>`).join(''):'<p class="hint">No family members added yet. Tap Add person to get started.</p>'}<p class="hint">You can add up to 12 family members. Removing a member keeps their existing items unassigned.</p></section><section class="card-surface settings-group"><h3>Your data & backup</h3><p class="hint">Your events and photos are stored locally in this browser on this device. GitHub only hosts the app files; it does not receive or synchronize your planner data.</p><div class="setting-actions" style="margin-top:18px"><button class="btn btn-primary" data-export>↓ Export backup</button><button class="btn" data-import>↑ Import backup</button></div><p class="hint">Export a JSON file before switching phones, clearing browser data or reinstalling the app.</p></section><section class="card-surface settings-group"><h3>Other pages</h3><div class="setting-actions">${[['rewards','⭐ Rewards'],['sleep','🌙 Sleep'],['photos','🖼️ Photos']].map(([key,label])=>`<button class="btn" data-nav="${key}">${label}</button>`).join('')}</div></section><section class="card-surface settings-group danger-zone"><h3>Start fresh again</h3><p class="hint">Permanently clear all planner entries, family members and photos saved in this version on this device.</p><div class="setting-actions"><button class="btn btn-danger" data-reset>Erase all planner data</button></div></section></div>`;}
function render(){renderNavigation();renderPeople();let html='';switch(view){case 'calendar':html=renderCalendar();break;case 'tasks':html=renderTasks();break;case 'meals':html=renderMeals();break;case 'lists':html=renderLists();break;case 'rewards':html=renderRewards();break;case 'sleep':html=renderSleep();break;case 'photos':html=renderPhotos();break;case 'settings':html=renderSettings();break;}$('#content').innerHTML=html;}
function personOptions(selected){return `<option value="">Unassigned</option>`+state.people.map(p=>`<option value="${escapeHTML(p.id)}" ${p.id===selected?'selected':''}>${escapeHTML(p.name)}</option>`).join('');}
function field(name,label,input){return `<div class="form-field"><label for="field-${name}">${label}</label>${input}</div>`;}
function input(name,type,value='',extra=''){return `<input id="field-${name}" name="${name}" type="${type}" value="${escapeHTML(value)}" ${extra}/>`;}
function selectPerson(selected){return field('personId','Assign to',`<select id="field-personId" name="personId">${personOptions(selected)}</select>`);}
function modalButtons(type,isEdit){return `<div class="modal-actions">${isEdit?`<button type="button" class="btn btn-danger" data-modal-delete="${type}">Delete</button>`:''}<button type="button" class="btn" data-close-modal>Cancel</button><button type="submit" class="btn btn-primary">${isEdit?'Save changes':'Add to planner'}</button></div>`;}
let currentEditor=null;
function openEditor(type,id=null,preset={}){
  const collection={event:'events',task:'tasks',list:'lists',member:'people',meal:'meals',sleep:'sleep'}[type];
  if(!collection)return;
  const item=id?state[collection].find(x=>x.id===id):null;
  const data={...preset,...item};let form='';
  const labels={event:'event',task:'task',list:'list',member:'family member',meal:'meal',sleep:'sleep log'};
  $('#modalTitle').textContent=`${item?'Edit':'Add'} ${labels[type]}`;
  if(type==='event'){
    form+=field('title','Event title',input('title','text',data.title||'','required maxlength="150" placeholder="e.g. Visit the zoo" autofocus'));
    form+=field('date','Date',input('date','date',data.date||focusDate,'required'));
    form+=`<div class="form-row">${field('startTime','Start time',input('startTime','time',data.startTime||'10:00'))}${field('endTime','End time',input('endTime','time',data.endTime||'11:00'))}</div>`;
    form+=selectPerson(data.personId||'');
    form+=field('notes','Notes (optional)',`<textarea id="field-notes" name="notes" maxlength="1000" placeholder="Any extra details...">${escapeHTML(data.notes||'')}</textarea>`);
  } else if(type==='task'){
    form+=field('title','Task',input('title','text',data.title||'','required maxlength="150" placeholder="e.g. Take out recycling" autofocus'));
    form+=field('due','Due date',input('due','date',data.due||today(),'required'))+selectPerson(data.personId||'');
  }else if(type==='list'){
    form+=field('name','List name',input('name','text',data.name||'','required maxlength="80" placeholder="e.g. Weekend packing" autofocus'));
  }else if(type==='member'){
    form+=field('name','Name',input('name','text',data.name||'','required maxlength="40" placeholder="First name" autofocus'));
    form+=field('color','Favorite color',`<select name="color" id="field-color">${Object.keys(COLORS).map(c=>`<option value="${c}" ${c===(data.color||'lavender')?'selected':''}>${c[0].toUpperCase()+c.slice(1)}</option>`).join('')}</select>`);
  }else if(type==='meal'){
    form+=field('title','What is on the menu?',input('title','text',data.title||'','required maxlength="120" placeholder="e.g. Pasta and salad" autofocus'));
    form+=`<div class="form-row">${field('date','Date',input('date','date',data.date||today(),'required'))}${field('slot','Meal',`<select name="slot" id="field-slot">${MEAL_SLOTS.map(x=>`<option ${x===(data.slot||'Dinner')?'selected':''}>${x}</option>`).join('')}</select>`)}</div>`;
  }else if(type==='sleep'){
    form+=`<div class="form-row">${field('date','Night of',input('date','date',data.date||today(),'required'))}${field('hours','Hours slept',input('hours','number',data.hours??8,'min="0" max="24" step="0.25" required'))}</div>`+selectPerson(data.personId||'');
    form+=field('notes','Notes (optional)',input('notes','text',data.notes||'','maxlength="120" placeholder="e.g. Restful night"'));
  }
  $('#editorForm').innerHTML=form+modalButtons(type,!!item);
  currentEditor={type,id:item?.id||null};
  $('#editorDialog').showModal();
  setTimeout(()=>$('#editorForm [autofocus]')?.focus(),30);
}
function closeEditor(){$('#editorDialog').close();currentEditor=null;}
function submitEditor(e){e.preventDefault();if(!currentEditor)return;const {type,id}=currentEditor;const form=new FormData(e.target);const obj=Object.fromEntries(form.entries());const collection={event:'events',task:'tasks',list:'lists',member:'people',meal:'meals',sleep:'sleep'}[type];const item=id?state[collection].find(x=>x.id===id):null;
  Object.keys(obj).forEach(k=>obj[k]=String(obj[k]).trim());
  if(type==='event'&&obj.startTime&&obj.endTime&&obj.endTime<obj.startTime){showToast('End time must be after start time');return;}
  if(type==='event'&&((obj.startTime&&!obj.endTime)||(!obj.startTime&&obj.endTime))){showToast('Enter both times, or leave both blank for an all-day event');return;}
  if(type==='member'&&state.people.some(p=>p.name.toLowerCase()===obj.name.toLowerCase()&&p.id!==id)){showToast('A family member already has that name');return;}
  if(type==='member'&&!id&&state.people.length>=12){showToast('Maximum 12 family members');return;}
  if(type==='sleep'){obj.hours=Number(obj.hours);if(!(obj.hours>=0&&obj.hours<=24)){showToast('Enter between 0 and 24 hours');return;}}
  if(type==='meal'){
    // One meal per date and meal slot. Editing to another slot replaces its existing entry.
    const prior=state.meals.find(x=>x.date===obj.date&&x.slot===obj.slot&&x.id!==id);
    if(prior){if(!confirm('Replace the existing meal for that day and slot?'))return;state.meals=state.meals.filter(x=>x.id!==prior.id);}
  }
  if(item)Object.assign(item,obj);else state[collection].push({...obj,id:uid(),...(type==='task'?{done:false}:{}),...(type==='list'?{items:[]}:{} )});
  closeEditor();notify(item?'Saved changes':'Added successfully');
}
function removeById(collection,id,label){if(!confirm(`Delete this ${label}?`))return;state[collection]=state[collection].filter(x=>x.id!==id);notify(`${label[0].toUpperCase()+label.slice(1)} deleted`);}
function deleteMember(id){if(!confirm('Remove this person? Their existing events and tasks will stay unassigned.'))return;state.people=state.people.filter(p=>p.id!==id);for(const arr of [state.events,state.tasks,state.sleep])arr.forEach(x=>{if(x.personId===id)x.personId='';});if(personFilter===id)personFilter='all';notify('Person removed');}
function changeView(next){view=next;personFilter='all';render();window.scrollTo({top:0,behavior:'smooth'});}
function handleClick(e){
  const button=e.target.closest('button,[data-jump-day]');if(!button)return;
  const d=button.dataset;
  if(d.closeModal!==undefined){closeEditor();return;}
  if(d.nav){changeView(d.nav);return;}
  if(d.filterPerson){personFilter=d.filterPerson===personFilter?'all':d.filterPerson;render();return;}
  if(d.addDay){openEditor('event',null,{date:d.addDay});return;}
  if(d.jumpDay&&!e.target.closest('[data-add-day]')){focusDate=d.jumpDay;mode='week';render();return;}
  if(d.mode){mode=d.mode;render();return;}
  if(d.shift){focusDate=mode==='month'&&view==='calendar'?monthShift(focusDate,Number(d.shift)):plusDays(focusDate,7*Number(d.shift));render();return;}
  if(d.today!==undefined){focusDate=today();render();return;}
  if(d.add){openEditor(d.add);return;}
  const edits=[['editEvent','event'],['editTask','task'],['editList','list'],['editMember','member'],['editSleep','sleep']];
  for(const [key,type] of edits)if(d[key]){openEditor(type,d[key]);return;}
  if(d.taskScope){taskScope=d.taskScope;render();return;}
  if(d.mealDate){const m=getMeal(d.mealDate,d.mealSlot);openEditor('meal',m?.id||null,{date:d.mealDate,slot:d.mealSlot});return;}
  if(d.deleteTask){removeById('tasks',d.deleteTask,'task');return;}
  if(d.deleteList){removeById('lists',d.deleteList,'list');return;}
  if(d.deleteMember){deleteMember(d.deleteMember);return;}
  if(d.deleteSleep){removeById('sleep',d.deleteSleep,'sleep log');return;}
  if(d.deletePhoto){removeById('photos',d.deletePhoto,'photo');return;}
  if(d.removeListItem){const l=state.lists.find(x=>x.id===d.removeListItem);if(!l)return;l.items=l.items.filter(i=>i.id!==d.itemId);notify('Item removed');return;}
  if(d.modalDelete){const {type,id}=currentEditor||{};if(!id)return;if(type==='member'){closeEditor();deleteMember(id);return;}const c={event:'events',task:'tasks',list:'lists',meal:'meals',sleep:'sleep'}[type];closeEditor();removeById(c,id,type);return;}
  if(d.export!==undefined){exportBackup();return;}
  if(d.import!==undefined){$('#importFile').click();return;}
  if(d.uploadPhoto!==undefined){$('#photoFile').click();return;}
  if(d.reset!==undefined){if(!confirm('Erase ALL planner data, photos and family members from this device? This cannot be undone without a backup.'))return;state=emptyState();personFilter='all';notify('Planner cleared');return;}
}
function handleChange(e){const d=e.target.dataset;if(d.checkTask){const t=state.tasks.find(x=>x.id===d.checkTask);if(t){t.done=e.target.checked;notify(t.done?'Great job! ⭐':'Task reopened');}return;}if(d.checkList){const l=state.lists.find(x=>x.id===d.checkList),it=l?.items.find(x=>x.id===d.itemId);if(it){it.done=e.target.checked;notify('List updated');}}}
function handleSubmit(e){if(e.target.id==='editorForm'){submitEditor(e);return;}const listId=e.target.dataset.listForm;if(listId){e.preventDefault();const l=state.lists.find(x=>x.id===listId),t=String(new FormData(e.target).get('item')||'').trim();if(l&&t){l.items.push({id:uid(),text:t,done:false});notify('List item added');}}}
function exportBackup(){const file=new Blob([JSON.stringify({format:'daybloom-v1',exportedAt:new Date().toISOString(),...state},null,2)],{type:'application/json'});const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=`daybloom-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('Backup downloaded');}
async function importBackup(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;try{const json=JSON.parse(await file.text());if(!Array.isArray(json.people)||!Array.isArray(json.events)||!Array.isArray(json.tasks)||!Array.isArray(json.lists))throw Error('This does not look like a DayBloom backup');if(!confirm('Replace ALL current planner data with this backup? Export the current data first if needed.'))return;state={people:json.people,events:json.events,tasks:json.tasks,lists:json.lists,meals:Array.isArray(json.meals)?json.meals:[],sleep:Array.isArray(json.sleep)?json.sleep:[],photos:Array.isArray(json.photos)?json.photos:[]};personFilter='all';notify('Backup imported');}catch(err){showToast('Could not import: '+err.message);}}
function photoToJpeg(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const scale=Math.min(1,1100/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);resolve(c.toDataURL('image/jpeg',.72));};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Could not read photo'));};img.src=url;});}
async function uploadPhoto(e){const f=e.target.files?.[0];e.target.value='';if(!f)return;if(!f.type.startsWith('image/')){showToast('Choose an image file');return;}try{const data=await photoToJpeg(f);const caption=f.name.replace(/\.[^.]+$/,'').slice(0,80);state.photos.push({id:uid(),date:today(),caption,data});if(!save()){state.photos.pop();return;}render();showToast('Photo added');}catch(err){showToast('Could not add photo');}}
function init(){clock();render();setInterval(clock,30000);
  document.addEventListener('click',handleClick);
  document.addEventListener('change',handleChange);
  document.addEventListener('submit',handleSubmit);
  $('#closeModal').addEventListener('click',closeEditor);
  $('#editorDialog').addEventListener('click',e=>{if(e.target===$('#editorDialog'))closeEditor();});
  $('#headerAdd').addEventListener('click',()=>openEditor(view==='tasks'?'task':view==='lists'?'list':view==='sleep'?'sleep':view==='meals'?'meal':'event'));
  $('#fabAdd').addEventListener('click',()=>openEditor(view==='tasks'?'task':view==='lists'?'list':view==='sleep'?'sleep':view==='meals'?'meal':'event'));
  $('#importFile').addEventListener('change',importBackup);
  $('#photoFile').addEventListener('change',uploadPhoto);
  if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Offline support unavailable',err));
}
init();
