/* DayBloom Personal Planner — private, local-first, no third-party services. */
'use strict';
const KEY = 'daybloom-personal-planner-v1';
const LEGACY_KEY = 'daybloom-family-planner-v2';
const COLORS = {
  pink: {tint:'#ffe2e5',accent:'#ee91a4'},
  yellow: {tint:'#fff1c7',accent:'#e8bf4a'},
  mint: {tint:'#d8f3eb',accent:'#65cbb7'},
  sky: {tint:'#dceeff',accent:'#79b9ef'},
  lavender: {tint:'#eee3ff',accent:'#bb98ed'},
  peach: {tint:'#ffe9da',accent:'#efa67a'}
};
const MEAL_SLOTS = ['Breakfast','Lunch','Dinner'];
const PRIORITIES = ['High','Medium','Low'];
const $ = selector => document.querySelector(selector);
const pad = n => String(n).padStart(2,'0');
const today = () => iso(new Date());
function iso(date){return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;}
function asDate(s){const [y,m,d] = String(s || '').slice(0,10).split('-').map(Number);return new Date(y || 2026,(m || 1)-1,d || 1);}
function plusDays(s,n){const d=asDate(s);d.setDate(d.getDate()+n);return iso(d);}
function weekStart(s){return plusDays(s,-((asDate(s).getDay()+6)%7));}
function monthShift(s,n){const d=asDate(s);d.setDate(1);d.setMonth(d.getMonth()+n);return iso(d);}
function fmtDate(s,opts={month:'short',day:'numeric'}){return asDate(s).toLocaleDateString(undefined,opts);}
function fullDay(s){return fmtDate(s,{weekday:'long',month:'short',day:'numeric'});}
function timeLabel(s){if(!s)return 'All day';const [h,m]=s.split(':').map(Number);return new Date(2020,0,1,h,m).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});}
function uid(){return (typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():`id-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function tintAttr(name='lavender'){const c=COLORS[name]||COLORS.lavender;return `style="--tint:${c.tint};--accent:${c.accent}"`;}
function emptyState(){return {events:[],tasks:[],lists:[],meals:[],goals:[]};}
function cleanData(raw){
  if(!raw || !Array.isArray(raw.events) || !Array.isArray(raw.tasks) || !Array.isArray(raw.lists))throw Error('Not a DayBloom planner backup');
  const safeArr = a => Array.isArray(a)?a.filter(x=>x && typeof x==='object' && !Array.isArray(x)):[];
  return {
    events:safeArr(raw.events).map(e=>({id:e.id||uid(),title:String(e.title||''),date:e.date||today(),startTime:e.startTime||'',endTime:e.endTime||'',notes:e.notes||'',color:COLORS[e.color]?e.color:'lavender'})),
    tasks:safeArr(raw.tasks).map(t=>({id:t.id||uid(),title:String(t.title||''),due:t.due||today(),notes:t.notes||'',priority:PRIORITIES.includes(t.priority)?t.priority:'Medium',done:!!t.done})),
    lists:safeArr(raw.lists).map(l=>({id:l.id||uid(),name:String(l.name||''),items:safeArr(l.items).map(i=>({id:i.id||uid(),text:String(i.text||''),done:!!i.done}))})),
    meals:safeArr(raw.meals).map(m=>({id:m.id||uid(),title:String(m.title||''),date:m.date||today(),slot:MEAL_SLOTS.includes(m.slot)?m.slot:'Dinner'})),
    goals:safeArr(raw.goals).map(g=>({id:g.id||uid(),title:String(g.title||''),target:Math.max(1,Math.min(1000000,Math.round(Number(g.target)||1))),current:Math.max(0,Math.min(1000000,Math.round(Number(g.current)||0))),unit:String(g.unit||'times'),due:String(g.due||''),notes:String(g.notes||''),color:COLORS[g.color]?g.color:'mint'}))
  };
}
function load(){
  try {
    const stored=localStorage.getItem(KEY);
    if(stored)return cleanData(JSON.parse(stored));
    // Copy only personal entries from the prior *clean-start* edition.
    // Keep the legacy key intact so users retain their old backup opportunity.
    const legacy=localStorage.getItem(LEGACY_KEY);
    if(legacy){
      const migrated=cleanData(JSON.parse(legacy));
      localStorage.setItem(KEY,JSON.stringify(migrated));
      return migrated;
    }
  } catch(e){console.warn('Planner data unavailable; use an exported backup if needed.',e);}
  return emptyState();
}
let state=load();
let view='dashboard';
let mode='week';
let focusDate=today();
let taskScope='all';
let goalScope='all';
let currentEditor=null;
let toastTimer;
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));return true;}catch(err){showToast('Could not save — storage full or unavailable. Export a backup.');return false;}}
function showToast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3300);}
function notify(message){if(save())showToast(message);render();}
function clock(){
  const d=new Date();
  $('#clockDate').textContent=d.toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'});
  $('#clockTime').textContent=d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  const hour=d.getHours();
  $('#greeting').textContent=hour<12?'Good morning, sunshine ☀️':hour<18?'Good afternoon, sunshine 🌷':'Good evening, sunshine ✨';
}
function renderNavigation(){
  document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===view || (b.closest('.bottom-nav') && b.dataset.nav==='settings' && ['meals','lists','settings'].includes(view))));
  $('#pendingCount').textContent=state.tasks.filter(t=>!t.done).length||'';
}
function header(title,description,actions=''){return `<div class="section-head"><div><h1 class="section-title">${title}</h1><p class="section-sub">${description}</p></div>${actions}</div>`;}
function empty(emoji,title,description){return `<div class="empty-state"><div class="empty-emoji">${emoji}</div><strong>${title}</strong><div>${description}</div></div>`;}
function progress(goal){return Math.min(100,Math.round(goal.current/goal.target*100));}
function goalDone(goal){return goal.current>=goal.target;}
function overviewStats(){
  const now=today();
  const due=state.tasks.filter(t=>!t.done&&t.due<=now).length;
  const upcoming=state.events.filter(e=>e.date>=now&&e.date<=plusDays(now,7)).length;
  const complete=state.tasks.length?Math.round(state.tasks.filter(t=>t.done).length/state.tasks.length*100):0;
  const reached=state.goals.filter(goalDone).length;
  return `<div class="dashboard-stats">
    <div class="dashboard-stat pink"><div class="stat-emoji">☑️</div><div class="stat-number">${due}</div><div class="stat-caption">Tasks needing attention</div></div>
    <div class="dashboard-stat mint"><div class="stat-emoji">🗓️</div><div class="stat-number">${upcoming}</div><div class="stat-caption">Events in the next 7 days</div></div>
    <div class="dashboard-stat yellow"><div class="stat-emoji">✨</div><div class="stat-number">${complete}%</div><div class="stat-caption">Tasks completed overall</div></div>
    <div class="dashboard-stat lavender"><div class="stat-emoji">🎯</div><div class="stat-number">${reached}/${state.goals.length}</div><div class="stat-caption">Goals reached</div></div>
  </div>`;
}
function renderDashboard(){
  const now=today();
  const attention=state.tasks.filter(t=>t.due<=now).sort((a,b)=>Number(a.done)-Number(b.done)||a.due.localeCompare(b.due)).slice(0,6);
  const upcoming=state.events.filter(e=>e.date>=now).sort((a,b)=>a.date.localeCompare(b.date)||(a.startTime||'').localeCompare(b.startTime||'')).slice(0,5);
  const activeGoals=state.goals.filter(g=>!goalDone(g)).slice(0,3);
  let html=header('My dashboard',"Here's your day at a glance.")+overviewStats();
  html+=`<div class="two-cols dashboard-columns">
    <section class="card-surface dashboard-panel"><div class="panel-top"><h2>Today's tasks</h2><button class="text-action" data-nav="tasks">View all →</button></div>`;
  html+=attention.length?attention.map(t=>`<label class="dashboard-task ${t.done?'task-done':''}"><input type="checkbox" class="custom-check" data-check-task="${escapeHTML(t.id)}" ${t.done?'checked':''}/><span class="task-body"><span class="task-title">${escapeHTML(t.title)}</span><span class="task-meta">${t.due<now?'Overdue · ':''}${fmtDate(t.due)} · ${escapeHTML(t.priority||'Medium')} priority</span></span></label>`).join(''):empty('☑️','Nothing due today','Enjoy a clear schedule or add your first task.');
  html+=`<div class="panel-footer"><button class="btn btn-small" data-add="task">＋ Add task</button></div></section>`;
  html+=`<section class="card-surface dashboard-panel"><div class="panel-top"><h2>Upcoming events</h2><button class="text-action" data-nav="calendar">View calendar →</button></div>`;
  html+=upcoming.length?upcoming.map(e=>`<button class="dashboard-event" data-edit-event="${escapeHTML(e.id)}" ${tintAttr(e.color)}><span class="dashboard-event-date">${fmtDate(e.date,{month:'short',day:'numeric'})}</span><span class="task-body"><span class="task-title">${escapeHTML(e.title)}</span><span class="task-meta">${e.startTime?timeLabel(e.startTime):'All day'}</span></span></button>`).join(''):empty('🗓️','No upcoming events','Your calendar is ready for your plans.');
  html+=`<div class="panel-footer"><button class="btn btn-small" data-add="event">＋ Add event</button></div></section></div>`;
  html+=`<div class="two-cols dashboard-lower"><section class="card-surface dashboard-panel"><div class="panel-top"><h2>Goals in progress</h2><button class="text-action" data-nav="goals">All goals →</button></div>`;
  html+=activeGoals.length?activeGoals.map(g=>`<div class="goal-snapshot"><div class="goal-snapshot-top"><strong>${escapeHTML(g.title)}</strong><span>${progress(g)}%</span></div><div class="progress-track"><div class="progress-fill" style="width:${progress(g)}%;background:${(COLORS[g.color]||COLORS.mint).accent}"></div></div><div class="task-meta">${g.current} of ${g.target} ${escapeHTML(g.unit)}</div></div>`).join(''):empty('🎯','Set a personal goal','Track workouts, learning, habits, and more.');
  html+=`<div class="panel-footer"><button class="btn btn-small" data-add="goal">＋ New goal</button></div></section>`;
  html+=`<section class="card-surface dashboard-panel"><div class="panel-top"><h2>Plan the little things</h2></div><p class="section-sub">Your meals and checklists, just a tap away.</p><div class="quick-links"><button class="quick-link" data-nav="meals"><span>🥗</span><strong>Meal planner</strong><small>Breakfast, lunch & dinner</small></button><button class="quick-link" data-nav="lists"><span>📝</span><strong>My lists</strong><small>Shopping, packing & ideas</small></button></div></section></div>`;
  return html;
}
function eventCard(e){return `<button class="event-card" ${tintAttr(e.color)} data-edit-event="${escapeHTML(e.id)}" title="Edit ${escapeHTML(e.title)}"><div class="event-title">${escapeHTML(e.title)}</div><div class="event-time">${e.startTime?timeLabel(e.startTime)+(e.endTime?' – '+timeLabel(e.endTime):''):'All day'}</div></button>`;}
function eventsOn(day){return state.events.filter(e=>e.date===day).sort((a,b)=>(a.startTime||'').localeCompare(b.startTime||''));}
function calendarControls(){
  const from=mode==='week'?weekStart(focusDate):focusDate;
  const period=mode==='week'?`${fmtDate(from)} – ${fmtDate(plusDays(from,6))}`:fmtDate(from,{month:'long',year:'numeric'});
  return `<div class="toolbar"><div class="date-control"><button class="icon-btn" data-shift="-1" title="Previous period" aria-label="Previous period">‹</button><span class="period-label">${escapeHTML(period)}</span><button class="icon-btn" data-shift="1" title="Next period" aria-label="Next period">›</button></div><button class="btn btn-small" data-today>Today</button><div class="segmented"><button class="${mode==='week'?'active':''}" data-mode="week">Week</button><button class="${mode==='month'?'active':''}" data-mode="month">Month</button></div></div>`;
}
function renderWeek(){
  const start=weekStart(focusDate);let html='<div class="calendar-grid">';
  for(let i=0;i<7;i++){
    const d=plusDays(start,i),ev=eventsOn(d);
    html+=`<section class="day-panel ${d===today()?'today':''}"><div class="day-heading"><div class="day-label">${fmtDate(d,{weekday:'short'})}<span>${fmtDate(d,{day:'numeric'})}</span></div><div class="day-meta">${ev.length} event${ev.length===1?'':'s'} <button class="mini-add" data-add-day="${d}" title="Add event on ${fullDay(d)}" aria-label="Add event on ${fullDay(d)}">＋</button></div></div><div class="event-stack">${ev.length?ev.map(eventCard).join(''):`<button class="empty-day" data-add-day="${d}">＋ Add an event</button>`}</div></section>`;
  }
  return html+'</div>';
}
function renderMonth(){
  const base=asDate(focusDate),first=iso(new Date(base.getFullYear(),base.getMonth(),1)),start=weekStart(first);
  const last=iso(new Date(base.getFullYear(),base.getMonth()+1,0));
  const total=Math.ceil(((asDate(last)-asDate(start))/86400000+1)/7)*7;
  let html='<div class="month-scroll"><div class="month-grid">';
  for(const day of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])html+=`<div class="month-weekday">${day}</div>`;
  for(let i=0;i<total;i++){
    const d=plusDays(start,i),ev=eventsOn(d);
    html+=`<div class="month-day ${d.slice(0,7)!==focusDate.slice(0,7)?'outside':''} ${d===today()?'today':''}" data-jump-day="${d}"><div class="month-date">${fmtDate(d,{day:'numeric'})}<button data-add-day="${d}" title="Add event">+</button></div>${ev.slice(0,3).map(e=>`<div class="month-item" ${tintAttr(e.color)} title="${escapeHTML(e.title)}">${escapeHTML(e.title)}</div>`).join('')}${ev.length>3?`<div class="month-extra">+${ev.length-3} more</div>`:''}</div>`;
  }
  return html+'</div></div>';
}
function renderCalendar(){return header('My calendar','Make room for everything that matters.',calendarControls())+(mode==='week'?renderWeek():renderMonth());}
function renderTasks(){
  const rank={High:0,Medium:1,Low:2};
  const tasks=state.tasks.filter(t=>taskScope==='all'||(taskScope==='open'?!t.done:t.done)).slice().sort((a,b)=>Number(a.done)-Number(b.done)||a.due.localeCompare(b.due)||(rank[a.priority]??1)-(rank[b.priority]??1));
  let html=header('My tasks','A clear list for your priorities.',`<button class="btn btn-primary" data-add="task">＋ New task</button>`);
  html+=`<div class="filter-line">${[['all','All tasks'],['open','To do'],['done','Completed']].map(([key,label])=>`<button class="filter-pill ${taskScope===key?'active':''}" data-task-scope="${key}">${label}</button>`).join('')}</div>`;
  if(!tasks.length)return html+empty('☑️','No tasks here yet','Add your first task or select another filter.');
  return html+`<div class="card-surface"><div class="task-list">${tasks.map(t=>`<div class="task-item ${t.done?'task-done':''}"><input class="custom-check" type="checkbox" data-check-task="${escapeHTML(t.id)}" aria-label="Complete ${escapeHTML(t.title)}" ${t.done?'checked':''}/><div class="task-body"><div class="task-title">${escapeHTML(t.title)}</div><div class="task-meta">📅 ${fmtDate(t.due,{weekday:'short',month:'short',day:'numeric'})} ${!t.done&&t.due<today()?'<span class="overdue-label">· Overdue</span>':''} <span class="priority priority-${escapeHTML(t.priority.toLowerCase())}">${escapeHTML(t.priority)}</span>${t.notes?`<div class="task-note">${escapeHTML(t.notes)}</div>`:''}</div></div><div class="task-actions"><button class="bare-btn" data-edit-task="${escapeHTML(t.id)}" title="Edit task" aria-label="Edit task">✎</button><button class="bare-btn" data-delete-task="${escapeHTML(t.id)}" title="Delete task" aria-label="Delete task">✕</button></div></div>`).join('')}</div></div>`;
}
function renderGoals(){
  const filtered=state.goals.filter(g=>goalScope==='all'||(goalScope==='active'?!goalDone(g):goalDone(g)));
  const reached=state.goals.filter(goalDone).length;
  let html=header('Goals & progress','Turn big ambitions into small, trackable steps.',`<button class="btn btn-primary" data-add="goal">＋ New goal</button>`);
  if(state.goals.length){
    const avg=Math.round(state.goals.reduce((sum,g)=>sum+progress(g),0)/state.goals.length);
    html+=`<div class="goals-summary"><div><div class="stat-number">${reached}<span class="small-numerator"> / ${state.goals.length}</span></div><div class="stat-caption">Goals completed</div></div><div class="goals-summary-progress"><div class="goal-snapshot-top"><strong>Overall progress</strong><strong>${avg}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${avg}%"></div></div></div></div>`;
  }
  html+=`<div class="filter-line">${[['all','All goals'],['active','In progress'],['done','Completed']].map(([key,label])=>`<button class="filter-pill ${goalScope===key?'active':''}" data-goal-scope="${key}">${label}</button>`).join('')}</div>`;
  if(!filtered.length)return html+empty('🎯','No goals yet','Create a goal and track your progress with + and − buttons.');
  return html+`<div class="two-cols">${filtered.map(g=>{
    const pct=progress(g),c=COLORS[g.color]||COLORS.mint;
    return `<section class="card-surface goal-card" ${tintAttr(g.color)}><div class="goal-top"><span class="goal-icon">${goalDone(g)?'🏆':'🎯'}</span><div class="goal-badge">${goalDone(g)?'Completed':'In progress'}</div><div class="task-actions"><button class="bare-btn" data-edit-goal="${escapeHTML(g.id)}" title="Edit goal" aria-label="Edit goal">✎</button><button class="bare-btn" data-delete-goal="${escapeHTML(g.id)}" title="Delete goal" aria-label="Delete goal">✕</button></div></div><h2>${escapeHTML(g.title)}</h2>${g.notes?`<p class="goal-notes">${escapeHTML(g.notes)}</p>`:''}<div class="goal-snapshot-top"><span><strong>${g.current}</strong> / ${g.target} ${escapeHTML(g.unit)}</span><strong>${pct}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:${c.accent}"></div></div><div class="goal-bottom">${g.due?`<span class="goal-deadline">📅 Target: ${fmtDate(g.due)}</span>`:'<span class="goal-deadline">No deadline</span>'}<div class="goal-adjust"><button class="adjust-btn" data-adjust-goal="${escapeHTML(g.id)}" data-delta="-1" title="Decrease progress" aria-label="Decrease goal progress" ${g.current===0?'disabled':''}>−</button><button class="adjust-btn plus" data-adjust-goal="${escapeHTML(g.id)}" data-delta="1" title="Increase progress" aria-label="Increase goal progress" ${g.current>=g.target?'disabled':''}>＋</button></div></div></section>`;
  }).join('')}</div>`;
}
function renderLists(){
  let html=header('My lists','Checklists for all the little things.',`<button class="btn btn-primary" data-add="list">＋ New list</button>`);
  if(!state.lists.length)return html+empty('📝','Start your first list','Groceries, packing, ideas — whatever is on your mind.');
  return html+`<div class="two-cols">${state.lists.map(l=>`<section class="card-surface list-card"><div class="day-heading"><h2 class="card-title" style="margin:0">${escapeHTML(l.name)}</h2><div><button class="bare-btn" data-edit-list="${escapeHTML(l.id)}" title="Rename list" aria-label="Rename list">✎</button><button class="bare-btn" data-delete-list="${escapeHTML(l.id)}" title="Delete list" aria-label="Delete list">✕</button></div></div><p class="section-sub" style="margin:0 0 14px">${l.items.filter(i=>i.done).length} of ${l.items.length} completed</p><div class="list-items">${l.items.map(i=>`<div class="list-check-row ${i.done?'completed':''}"><input class="custom-check" type="checkbox" data-check-list="${escapeHTML(l.id)}" data-item-id="${escapeHTML(i.id)}" aria-label="Complete ${escapeHTML(i.text)}" ${i.done?'checked':''}/><span style="flex:1;overflow-wrap:anywhere">${escapeHTML(i.text)}</span><button class="bare-btn" data-remove-list-item="${escapeHTML(l.id)}" data-item-id="${escapeHTML(i.id)}" type="button" title="Remove item" aria-label="Remove item">✕</button></div>`).join('')}</div><form class="list-input-row" data-list-form="${escapeHTML(l.id)}"><input name="item" placeholder="Add an item..." aria-label="New list item" required maxlength="160"/><button class="btn btn-small" type="submit" aria-label="Add list item">＋</button></form></section>`).join('')}</div>`;
}
function getMeal(d,slot){return state.meals.find(m=>m.date===d&&m.slot===slot);}
function renderMeals(){
  const start=weekStart(focusDate),days=Array.from({length:7},(_,i)=>plusDays(start,i));
  const tools=`<div class="toolbar"><button class="icon-btn" data-shift="-1" title="Previous week">‹</button><span class="period-label">${fmtDate(start)} – ${fmtDate(plusDays(start,6))}</span><button class="icon-btn" data-shift="1" title="Next week">›</button><button class="btn btn-small" data-today>Today</button></div>`;
  return header('Meal planner','A simple plan for breakfast, lunch, and dinner.',tools)+`<div class="three-cols">${days.map(d=>`<section class="card-surface"><div class="meal-day-title"><span>${fmtDate(d,{weekday:'short',month:'short',day:'numeric'})}</span>${d===today()?'<span class="pill">Today</span>':''}</div>${MEAL_SLOTS.map(slot=>{const m=getMeal(d,slot);return `<button class="meal-slot" data-meal-date="${d}" data-meal-slot="${slot}"><span class="slot-label">${slot}</span><span class="slot-value">${m?escapeHTML(m.title):'<span style="color:#b0b8c5">＋ Add a meal</span>'}</span></button>`;}).join('')}</section>`).join('')}</div>`;
}
function renderSettings(){
  return header('Settings','Your planner, your data.')+`<div class="two-cols">
    <section class="card-surface settings-group"><h3>Other pages</h3><p class="hint">Quick links to your personal plans.</p><div class="setting-actions"><button class="btn" data-nav="meals">🥗 Meal planner</button><button class="btn" data-nav="lists">📝 My lists</button><button class="btn" data-nav="goals">🎯 Goals & progress</button></div></section>
    <section class="card-surface settings-group"><h3>Your data & backup</h3><p class="hint">Your tasks, calendar, goals, meals and lists are stored locally in this browser on this device. GitHub hosts the app, not your personal data. Different phones do not synchronize.</p><div class="setting-actions" style="margin-top:18px"><button class="btn btn-primary" data-export>↓ Export backup</button><button class="btn" data-import>↑ Import backup</button></div><p class="hint">Export a JSON backup before clearing site data, switching devices, or reinstalling. Older family-planner backups can be imported; family profiles, photos, and sleep logs are excluded.</p></section>
    <section class="card-surface settings-group danger-zone"><h3>Start fresh</h3><p class="hint">Delete the personal planner entries stored on this device. You cannot undo this without a backup.</p><button class="btn btn-danger" data-reset>Erase my planner data</button></section>
    <section class="card-surface settings-group"><h3>About DayBloom</h3><p class="hint">An offline-ready personal planner. No account or paid service required. Works as a home-screen app after installing from your GitHub Pages website.</p></section>
  </div>`;
}
function render(){
  renderNavigation();
  const renderers={dashboard:renderDashboard,calendar:renderCalendar,tasks:renderTasks,goals:renderGoals,meals:renderMeals,lists:renderLists,settings:renderSettings};
  $('#content').innerHTML=(renderers[view]||renderDashboard)();
}
function field(name,label,fieldHTML){return `<div class="form-field"><label for="field-${name}">${label}</label>${fieldHTML}</div>`;}
function input(name,type,value='',extra=''){return `<input id="field-${name}" name="${name}" type="${type}" value="${escapeHTML(value)}" ${extra}/>`;}
function textArea(name,value='',extra=''){return `<textarea id="field-${name}" name="${name}" ${extra}>${escapeHTML(value)}</textarea>`;}
function colorOptions(current){return `<select id="field-color" name="color">${Object.keys(COLORS).map(c=>`<option value="${c}" ${c===current?'selected':''}>${c[0].toUpperCase()+c.slice(1)}</option>`).join('')}</select>`;}
function modalButtons(type,isEdit){return `<div class="modal-actions">${isEdit?`<button type="button" class="btn btn-danger" data-modal-delete="${type}">Delete</button>`:''}<button type="button" class="btn" data-close-modal>Cancel</button><button type="submit" class="btn btn-primary">${isEdit?'Save changes':'Add to planner'}</button></div>`;}
function openEditor(type,id=null,preset={}){
  const collection={event:'events',task:'tasks',list:'lists',meal:'meals',goal:'goals'}[type];
  if(!collection)return;
  const item=id?state[collection].find(x=>x.id===id):null;
  const data={...preset,...item};let form='';
  $('#modalTitle').textContent=`${item?'Edit':'Add'} ${type}`;
  if(type==='event'){
    form+=field('title','Event title',input('title','text',data.title||'','required maxlength="150" placeholder="e.g. Dentist appointment" autofocus'));
    form+=field('date','Date',input('date','date',data.date||focusDate,'required'));
    form+=`<div class="form-row">${field('startTime','Start time (optional)',input('startTime','time',data.startTime||''))}${field('endTime','End time (optional)',input('endTime','time',data.endTime||''))}</div>`;
    form+=field('color','Event color',colorOptions(data.color||'lavender'));
    form+=field('notes','Notes (optional)',textArea('notes',data.notes||'','maxlength="1000" placeholder="Any extra details..."'));
  }else if(type==='task'){
    form+=field('title','Task title',input('title','text',data.title||'','required maxlength="150" placeholder="e.g. Complete Python lesson" autofocus'));
    form+=`<div class="form-row">${field('due','Due date',input('due','date',data.due||today(),'required'))}${field('priority','Priority',`<select id="field-priority" name="priority">${PRIORITIES.map(p=>`<option ${p===(data.priority||'Medium')?'selected':''}>${p}</option>`).join('')}</select>`)}</div>`;
    form+=field('notes','Notes (optional)',textArea('notes',data.notes||'','maxlength="500" placeholder="Optional details..."'));
  }else if(type==='goal'){
    form+=field('title','What is your goal?',input('title','text',data.title||'','required maxlength="120" placeholder="e.g. Practice Python 12 times" autofocus'));
    form+=`<div class="form-row">${field('target','Target',input('target','number',data.target??10,'required min="1" max="1000000" step="1"'))}${field('current','Progress so far',input('current','number',data.current??0,'required min="0" max="1000000" step="1"'))}</div>`;
    form+=`<div class="form-row">${field('unit','Unit',input('unit','text',data.unit||'times','required maxlength="30" placeholder="e.g. sessions"'))}${field('due','Target date (optional)',input('due','date',data.due||''))}</div>`;
    form+=field('color','Goal color',colorOptions(data.color||'mint'));
    form+=field('notes','Notes (optional)',textArea('notes',data.notes||'','maxlength="500" placeholder="Why does this goal matter to you?"'));
  }else if(type==='list'){
    form+=field('name','List name',input('name','text',data.name||'','required maxlength="80" placeholder="e.g. Groceries" autofocus'));
  }else if(type==='meal'){
    form+=field('title','What is on the menu?',input('title','text',data.title||'','required maxlength="120" placeholder="e.g. Pasta and salad" autofocus'));
    form+=`<div class="form-row">${field('date','Date',input('date','date',data.date||today(),'required'))}${field('slot','Meal',`<select name="slot" id="field-slot">${MEAL_SLOTS.map(s=>`<option ${s===(data.slot||'Dinner')?'selected':''}>${s}</option>`).join('')}</select>`)}</div>`;
  }
  $('#editorForm').innerHTML=form+modalButtons(type,!!item);
  currentEditor={type,id:item?.id||null};
  $('#editorDialog').showModal();
  setTimeout(()=>$('#editorForm [autofocus]')?.focus(),30);
}
function closeEditor(){$('#editorDialog').close();currentEditor=null;}
function submitEditor(e){
  e.preventDefault();if(!currentEditor)return;
  const {type,id}=currentEditor;
  const collection={event:'events',task:'tasks',list:'lists',meal:'meals',goal:'goals'}[type];
  const item=id?state[collection].find(x=>x.id===id):null;
  const obj=Object.fromEntries(new FormData(e.target).entries());
  Object.keys(obj).forEach(k=>obj[k]=String(obj[k]).trim());
  if(type==='event'){
    if(Boolean(obj.startTime)!==Boolean(obj.endTime)){showToast('Enter both event times, or leave both blank');return;}
    if(obj.startTime&&obj.endTime<=obj.startTime){showToast('End time must be later than start time');return;}
  }
  if(type==='goal'){
    obj.target=Number(obj.target);obj.current=Number(obj.current);
    if(!Number.isInteger(obj.target)||obj.target<1||obj.target>1000000||!Number.isInteger(obj.current)||obj.current<0||obj.current>1000000){showToast('Enter valid progress numbers');return;}
  }
  if(type==='meal'){
    const duplicate=state.meals.find(x=>x.date===obj.date&&x.slot===obj.slot&&x.id!==id);
    if(duplicate){if(!confirm('Replace the existing meal in this slot?'))return;state.meals=state.meals.filter(x=>x.id!==duplicate.id);}
  }
  if(item)Object.assign(item,obj);else state[collection].push({...obj,id:uid(),...(type==='task'?{done:false}:{}),...(type==='list'?{items:[]}:{} )});
  closeEditor();notify(item?'Changes saved':'Added to your planner');
}
function removeById(collection,id,label){if(!confirm(`Delete this ${label}?`))return;state[collection]=state[collection].filter(x=>x.id!==id);notify(`${label[0].toUpperCase()+label.slice(1)} deleted`);}
function changeView(next){view=next;render();window.scrollTo({top:0,behavior:'smooth'});}
function defaultAddType(){return ({tasks:'task',goals:'goal',meals:'meal',lists:'list'})[view]||'event';}
function handleClick(e){
  const button=e.target.closest('button,[data-jump-day]');if(!button)return;
  const d=button.dataset;
  if(d.closeModal!==undefined){closeEditor();return;}
  if(d.nav){changeView(d.nav);return;}
  if(d.addDay){openEditor('event',null,{date:d.addDay});return;}
  if(d.jumpDay){focusDate=d.jumpDay;mode='week';changeView('calendar');return;}
  if(d.mode){mode=d.mode;render();return;}
  if(d.shift){focusDate=mode==='month'&&view==='calendar'?monthShift(focusDate,Number(d.shift)):plusDays(focusDate,7*Number(d.shift));render();return;}
  if(d.today!==undefined){focusDate=today();render();return;}
  if(d.add){openEditor(d.add);return;}
  for(const [key,type] of [['editEvent','event'],['editTask','task'],['editList','list'],['editGoal','goal']])if(d[key]){openEditor(type,d[key]);return;}
  if(d.taskScope){taskScope=d.taskScope;render();return;}
  if(d.goalScope){goalScope=d.goalScope;render();return;}
  if(d.mealDate){const m=getMeal(d.mealDate,d.mealSlot);openEditor('meal',m?.id||null,{date:d.mealDate,slot:d.mealSlot});return;}
  if(d.adjustGoal){const g=state.goals.find(x=>x.id===d.adjustGoal);if(g){const old=g.current;g.current=Math.max(0,Math.min(g.target,g.current+Number(d.delta)));if(g.current!==old)notify(goalDone(g)?'Goal achieved! 🎉':'Progress updated');}return;}
  for(const [key,collection,label] of [['deleteTask','tasks','task'],['deleteList','lists','list'],['deleteGoal','goals','goal']])if(d[key]){removeById(collection,d[key],label);return;}
  if(d.removeListItem){const l=state.lists.find(x=>x.id===d.removeListItem);if(l){l.items=l.items.filter(i=>i.id!==d.itemId);notify('Item removed');}return;}
  if(d.modalDelete){const {type,id}=currentEditor||{};if(!id)return;const c={event:'events',task:'tasks',list:'lists',goal:'goals',meal:'meals'}[type];closeEditor();removeById(c,id,type);return;}
  if(d.export!==undefined){exportBackup();return;}
  if(d.import!==undefined){$('#importFile').click();return;}
  if(d.reset!==undefined){if(!confirm('Permanently erase your personal calendar, tasks, goals, meals and lists on this device? Export a backup first if needed.'))return;state=emptyState();notify('Planner cleared');return;}
}
function handleChange(e){
  const d=e.target.dataset;
  if(d.checkTask){const t=state.tasks.find(x=>x.id===d.checkTask);if(t){t.done=e.target.checked;notify(t.done?'Task completed! ✨':'Task reopened');}return;}
  if(d.checkList){const l=state.lists.find(x=>x.id===d.checkList),it=l?.items.find(x=>x.id===d.itemId);if(it){it.done=e.target.checked;notify('List updated');}}
}
function handleSubmit(e){
  if(e.target.id==='editorForm'){submitEditor(e);return;}
  const listId=e.target.dataset.listForm;
  if(listId){e.preventDefault();const l=state.lists.find(x=>x.id===listId),value=String(new FormData(e.target).get('item')||'').trim();if(l&&value){l.items.push({id:uid(),text:value,done:false});notify('Item added');}}
}
function exportBackup(){
  const file=new Blob([JSON.stringify({format:'daybloom-personal-v1',exportedAt:new Date().toISOString(),...state},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=`daybloom-personal-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);showToast('Backup downloaded');
}
async function importBackup(e){
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  try{
    const imported=cleanData(JSON.parse(await file.text()));
    if(!confirm('Replace your current planner with this backup? Export your existing planner first if needed.'))return;
    state=imported;notify('Backup imported');
  }catch(err){showToast('Could not import: '+err.message);}
}
function init(){
  clock();render();setInterval(clock,30000);
  document.addEventListener('click',handleClick);
  document.addEventListener('change',handleChange);
  document.addEventListener('submit',handleSubmit);
  $('#closeModal').addEventListener('click',closeEditor);
  $('#editorDialog').addEventListener('click',e=>{if(e.target===$('#editorDialog'))closeEditor();});
  $('#headerAdd').addEventListener('click',()=>openEditor(defaultAddType()));
  $('#fabAdd').addEventListener('click',()=>openEditor(defaultAddType()));
  $('#importFile').addEventListener('change',importBackup);
  if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Offline support unavailable',err));
}
init();
