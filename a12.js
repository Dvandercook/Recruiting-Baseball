/* ==========================================================================
   Staff: the coaches list, the to-do list, and the calendar as something you
   schedule against rather than just read.

   The NCAA period is the backdrop, not the content. What matters is what your
   staff is actually doing on a given day and whether the rules allow it — so
   the board view puts your visits and camps in columns beside the period, and
   flags anything booked into a dead period.
   ========================================================================== */
const TASKS_KEY = 'tasks';
const CAL_KEY   = 'cal-entries';
let tasks = [];
let calEntries = [];
let calView = 'board';          // board | week | day
let calFrom = '', calTo = '';
let calEditId = null;

const CAL_TYPES = [
  { v:'visit',    label:'Unofficial visit', cls:'turf',      campus:true },
  { v:'official', label:'Official visit',   cls:'gold',      campus:true },
  { v:'camp',     label:'Camp',             cls:'dirt',      campus:true },
  { v:'event',    label:'Event / travel',   cls:'slate',     campus:false },
  { v:'call',     label:'Call block',       cls:'violet',    campus:false },
  { v:'other',    label:'Other',            cls:'elsewhere', campus:false },
];
function calTypeDef(v){ return CAL_TYPES.find(t=> t.v === v) || CAL_TYPES[5]; }

async function loadTasks(){
  try{ const raw = await Store.get(TASKS_KEY); tasks = raw ? JSON.parse(raw) : []; }
  catch(e){ tasks = []; }
  if(!Array.isArray(tasks)) tasks = [];
}
async function saveTasks(){ return Store.set(TASKS_KEY, JSON.stringify(tasks)); }
async function loadCalEntries(){
  try{ const raw = await Store.get(CAL_KEY); calEntries = raw ? JSON.parse(raw) : []; }
  catch(e){ calEntries = []; }
  if(!Array.isArray(calEntries)) calEntries = [];
}
async function saveCalEntries(){ return Store.set(CAL_KEY, JSON.stringify(calEntries)); }

/* ==========================================================================
   Coaches
   ========================================================================== */
function renderCoaches(){
  const box = document.getElementById('cchList');
  if(!box) return;
  box.innerHTML = coaches.length ? coaches.map(c=>`
    <div class="cch-row">
      <input class="cch-in" data-cf="initials" data-id="${escAttr(c.id)}" value="${escAttr(c.initials)}"
             maxlength="4" placeholder="DV">
      <input class="cch-nm" data-cf="name" data-id="${escAttr(c.id)}" value="${escAttr(c.name)}"
             placeholder="Full name">
      <button class="og-x" data-cchdel="${escAttr(c.id)}" title="Remove">✕</button>
    </div>`).join('')
    : '<p class="imp-hint" style="margin:0">Nobody on staff yet. Add yourself first.</p>';
  box.querySelectorAll('[data-cf]').forEach(el=>{
    el.addEventListener('change', async ()=>{
      const c = coachById(el.dataset.id);
      if(!c) return;
      c[el.dataset.cf] = el.value.trim();
      flashSaved(await saveCoaches());
      renderTasks(); renderCalendar();
    });
  });
  box.querySelectorAll('[data-cchdel]').forEach(b=>{
    b.addEventListener('click', async ()=>{
      if(b.dataset.arm !== '1'){
        b.dataset.arm = '1'; b.textContent = 'remove?';
        setTimeout(()=>{ if(b.isConnected && b.dataset.arm==='1'){ b.dataset.arm='0'; b.textContent='✕'; } }, 4000);
        return;
      }
      coaches = coaches.filter(c=> c.id !== b.dataset.cchdel);
      flashSaved(await saveCoaches());
      renderCoaches(); renderTasks(); renderCalendar();
    });
  });
}
document.getElementById('cchAdd').addEventListener('click', async ()=>{
  const nm = document.getElementById('cchNew').value.trim();
  if(!nm) return;
  const initials = nm.split(/\s+/).map(w=> w[0]).join('').slice(0,3).toUpperCase();
  coaches.push({ id:'c-' + Date.now() + '-' + coaches.length, name:nm, initials:initials });
  document.getElementById('cchNew').value = '';
  flashSaved(await saveCoaches());
  renderCoaches(); renderTasks(); renderCalendar();
});
document.getElementById('cchNew').addEventListener('keydown', e=>{
  if(e.key === 'Enter') document.getElementById('cchAdd').click();
});
document.getElementById('staffBtn').addEventListener('click', ()=>{
  renderCoaches();
  document.getElementById('scrim').classList.add('show');
  document.getElementById('staffModal').classList.add('show');
});
document.getElementById('cchClose').addEventListener('click', closeDrawer);
document.getElementById('cchDone').addEventListener('click', closeDrawer);

/* ==========================================================================
   Tasks
   ========================================================================== */
function taskOverdue(t){
  return !t.done && t.remindAt && t.remindAt <= new Date().toISOString();
}
function openTasks(){ return tasks.filter(t=> !t.done); }
function renderTasks(){
  const box = document.getElementById('tkList');
  if(!box) return;
  const showDone = document.getElementById('tkShowDone').checked;
  const mine = document.getElementById('tkMine').value;
  let list = tasks.filter(t=>{
    if(!showDone && t.done) return false;
    if(mine && t.coach !== mine) return false;
    return true;
  });
  list.sort((a,b)=>
    (a.done?1:0) - (b.done?1:0) ||
    (taskOverdue(b)?1:0) - (taskOverdue(a)?1:0) ||
    String(a.remindAt || '9999').localeCompare(String(b.remindAt || '9999')) ||
    String(b.createdAt||'').localeCompare(String(a.createdAt||''))
  );
  document.getElementById('tkCount').textContent =
    `${openTasks().length} open${tasks.length - openTasks().length ? ' · ' + (tasks.length - openTasks().length) + ' done' : ''}`;

  document.getElementById('tkCoach').innerHTML = coachOptions(
    document.getElementById('tkCoach').value, '— unassigned —');
  const mineSel = document.getElementById('tkMine');
  const keep = mineSel.value;
  mineSel.innerHTML = coachOptions(keep, 'Everyone');

  if(!list.length){
    box.innerHTML = `<div class="sec-empty"><h4>${tasks.length ? 'Nothing matches' : 'Nothing open'}</h4>
      <p>${tasks.length ? 'Change the filter above.' : 'Add the first one — it can hang off a player if it is about a kid.'}</p></div>`;
    return;
  }
  box.innerHTML = list.map(t=>{
    const p = t.playerId ? playerById(t.playerId) : null;
    return `<div class="tk-row ${t.done?'done':''} ${taskOverdue(t)?'late':''}">
      <label class="tk-check"><input type="checkbox" data-tkdone="${escAttr(t.id)}" ${t.done?'checked':''}></label>
      <div class="tk-main">
        <div class="tk-text">${escAttr(t.text)}</div>
        <div class="tk-meta">
          ${p ? `<button class="tk-player" data-tkplayer="${escAttr(p.id)}">${escAttr(getField(p,'first')+' '+getField(p,'last'))}</button>` : ''}
          ${t.coach ? `<span class="tk-coach">${escAttr(coachLabel(t.coach))}</span>` : ''}
          ${t.remindAt ? `<span class="tk-when ${taskOverdue(t)?'late':''}">${escAttr(fmtStamp(t.remindAt))}</span>` : ''}
          ${t.by ? `<span class="tk-by">${escAttr(t.by)}</span>` : ''}
        </div>
      </div>
      <button class="og-x" data-tkdel="${escAttr(t.id)}" title="Delete">✕</button>
    </div>`;
  }).join('');

  box.querySelectorAll('[data-tkdone]').forEach(cb=>{
    cb.addEventListener('change', async ()=>{
      const t = tasks.find(x=> x.id === cb.dataset.tkdone);
      if(!t) return;
      t.done = cb.checked;
      t.doneAt = cb.checked ? new Date().toISOString() : '';
      flashSaved(await saveTasks());
      renderTasks(); renderHome();
    });
  });
  box.querySelectorAll('[data-tkdel]').forEach(b=>{
    b.addEventListener('click', async ()=>{
      if(b.dataset.arm !== '1'){
        b.dataset.arm = '1'; b.textContent = 'delete?';
        setTimeout(()=>{ if(b.isConnected && b.dataset.arm==='1'){ b.dataset.arm='0'; b.textContent='✕'; } }, 4000);
        return;
      }
      tasks = tasks.filter(x=> x.id !== b.dataset.tkdel);
      flashSaved(await saveTasks());
      renderTasks(); renderHome();
    });
  });
  box.querySelectorAll('[data-tkplayer]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const pl = playerById(b.dataset.tkplayer);
      if(!pl) return;
      POOL = poolOf(pl);
      goTo(POOL === 'transfer' ? 'transfer' : 'hs');
      openDrawer(pl.id);
    });
  });
}
function refreshTaskPlayerList(){
  const dl = document.getElementById('tkPlayerList');
  if(!dl) return;
  dl.innerHTML = allPlayers().slice(0, 800).map(p=>
    `<option value="${escAttr(getField(p,'first')+' '+getField(p,'last'))}"></option>`).join('');
}
document.getElementById('tkAdd').addEventListener('click', async ()=>{
  const text = document.getElementById('tkText').value.trim();
  if(!text) return;
  const nm = document.getElementById('tkPlayer').value.trim().toLowerCase();
  const match = nm ? allPlayers().find(p=>
    (getField(p,'first')+' '+getField(p,'last')).toLowerCase() === nm) : null;
  if(nm && !match){ alertBar('No player by that name — leave it blank or pick from the list.'); return; }
  tasks.unshift({
    id: 'tk-' + Date.now() + '-' + tasks.length,
    text: text,
    playerId: match ? match.id : '',
    coach: document.getElementById('tkCoach').value,
    remindAt: document.getElementById('tkWhen').value ? new Date(document.getElementById('tkWhen').value).toISOString() : '',
    done: false,
    createdAt: new Date().toISOString(),
    by: (typeof Cloud !== 'undefined' && Cloud && Cloud.who) ? Cloud.who : '',
  });
  document.getElementById('tkText').value = '';
  document.getElementById('tkPlayer').value = '';
  document.getElementById('tkWhen').value = '';
  flashSaved(await saveTasks());
  renderTasks(); renderHome();
});
document.getElementById('tkText').addEventListener('keydown', e=>{
  if((e.metaKey||e.ctrlKey) && e.key === 'Enter') document.getElementById('tkAdd').click();
});
['tkShowDone','tkMine'].forEach(id=>
  document.getElementById(id).addEventListener('change', renderTasks));

/* ==========================================================================
   Calendar — a scheduler over the NCAA backdrop
   ========================================================================== */
function periodOn(iso){ return CAL_PERIODS.find(p=> iso >= p.start && iso <= p.end) || null; }
function addDaysISO(iso, n){
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0,10);
}
function dayName(iso){
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(iso + 'T12:00:00').getDay()];
}
function calRange(){
  const from = calFrom || todayISO();
  const to   = calTo   || addDaysISO(from, 182);
  const days = [];
  for(let d = from; d <= to && days.length < 400; d = addDaysISO(d, 1)) days.push(d);
  return days;
}
function entriesOn(iso){ return calEntries.filter(e=> e.date === iso); }
// Anything on campus while the rules say dead is worth shouting about.
function entryConflict(e){
  const per = periodOn(e.date);
  if(!per) return '';
  const t = calTypeDef(e.type);
  if(/dead|shutdown/i.test(per.type) && t.campus) return per.type;
  return '';
}
function entryChip(e){
  const t = calTypeDef(e.type);
  const p = e.playerId ? playerById(e.playerId) : null;
  const bad = entryConflict(e);
  return `<button class="ce ${t.cls}${bad?' bad':''}" data-ceedit="${escAttr(e.id)}"
      title="${escAttr(t.label + (bad ? ' — booked inside a ' + bad : ''))}">
    ${bad ? '<span class="ce-warn">!</span>' : ''}
    <span class="ce-t">${escAttr(e.title || t.label)}</span>
    ${p ? `<span class="ce-p">${escAttr(getField(p,'last'))}</span>` : ''}
  </button>`;
}

function renderCalendar(){
  const host = document.getElementById('calBody');
  if(!host) return;
  const seg = document.getElementById('calViewSeg');
  if(seg) seg.querySelectorAll('button').forEach(b=> b.classList.toggle('active', b.dataset.calview === calView));
  document.getElementById('calFrom').value = calFrom || todayISO();
  document.getElementById('calTo').value   = calTo   || addDaysISO(calFrom || todayISO(), 182);

  const t = todayISO();
  const now = currentCalPeriod();
  const nextP = CAL_PERIODS.find(p=> p.start > t);
  const officials = calEntries.filter(e=> e.type === 'official').length;
  document.getElementById('calBanner').innerHTML = now ? `
    <div class="cal-banner">
      <div class="cb-label">Today — ${longDate(t)}</div>
      <div class="cb-now" style="color:var(--${now.cls==='contact'?'turf':now.cls==='quiet'?'gold':'danger'})">${now.type}</div>
      <div class="cb-sub">${CAL_MEANING[now.type]}
        Runs through ${longDate(now.end)}.
        ${nextP ? `Next: ${nextP.type} from ${longDate(nextP.start)}.` : ''}
        ${officials ? `&nbsp;|&nbsp; <strong>${officials}</strong> official visit${officials===1?'':'s'} on the calendar.` : ''}</div>
    </div>` : '';

  if(calView === 'board') return renderCalBoard(host);
  return renderCalList(host, calView === 'day' ? 1 : 7);
}

function renderCalBoard(host){
  const days = calRange();
  const cols = coaches.slice();
  host.className = 'cal-board-wrap';
  host.innerHTML = `
    <div class="cal-grid" style="--coaches:${cols.length}">
      <div class="cg-head">
        <span class="cg-day"></span>
        <span class="cg-ncaa">NCAA</span>
        <span class="cg-campus">On Campus</span>
        ${cols.map(c=> `<span class="cg-coach">${escAttr(c.initials || c.name)}</span>`).join('')}
        ${cols.length ? '' : '<span class="cg-coach dim">add staff →</span>'}
      </div>
      ${days.map(d=>{
        const per = periodOn(d);
        const ents = entriesOn(d);
        const campus = ents.filter(e=> calTypeDef(e.type).campus);
        const isToday = d === todayISO();
        const wk = /Sat|Sun/.test(dayName(d));
        return `<div class="cg-row ${isToday?'today':''} ${wk?'wknd':''}" data-calday="${d}">
          <span class="cg-day">${dayName(d)}, ${fmtDate(d)}</span>
          <span class="cg-ncaa ${per ? per.cls : ''}">${per ? per.type.replace(' Period','') : ''}</span>
          <span class="cg-campus">${campus.map(entryChip).join('')}</span>
          ${cols.map(c=> `<span class="cg-coach">${
            ents.filter(e=> e.coach === c.id && !calTypeDef(e.type).campus).map(entryChip).join('')
          }</span>`).join('')}
          ${cols.length ? '' : '<span class="cg-coach"></span>'}
        </div>`;
      }).join('')}
    </div>`;
  wireCalendarClicks(host);
}

function renderCalList(host, span){
  const days = calRange();
  host.className = 'cal-list-wrap';
  const chunks = [];
  for(let i = 0; i < days.length; i += span) chunks.push(days.slice(i, i + span));
  host.innerHTML = chunks.slice(0, 40).map(chunk=>{
    const any = chunk.some(d=> entriesOn(d).length);
    const head = span === 1 ? `${dayName(chunk[0])}, ${longDate(chunk[0])}`
                            : `${longDate(chunk[0])} – ${longDate(chunk[chunk.length-1])}`;
    return `<div class="cl-block ${any?'':'quiet'}">
      <div class="cl-head">${head}</div>
      ${chunk.map(d=>{
        const ents = entriesOn(d);
        const per = periodOn(d);
        if(!ents.length && span > 1) return '';
        return `<div class="cl-day ${d===todayISO()?'today':''}" data-calday="${d}">
          <div class="cl-date">${dayName(d)} ${fmtDate(d)}
            <span class="cl-per ${per?per.cls:''}">${per ? per.type.replace(' Period','') : ''}</span>
          </div>
          <div class="cl-ents">${ents.length ? ents.map(entryChip).join('')
            : '<span class="cl-none">nothing booked</span>'}</div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
  wireCalendarClicks(host);
}

function wireCalendarClicks(host){
  host.querySelectorAll('[data-ceedit]').forEach(b=>{
    b.addEventListener('click', e=>{ e.stopPropagation(); openCalEntry(b.dataset.ceedit); });
  });
  host.querySelectorAll('[data-calday]').forEach(row=>{
    row.addEventListener('click', ()=> openCalEntry(null, row.dataset.calday));
  });
}

function openCalEntry(id, date){
  calEditId = id || null;
  const e = id ? calEntries.find(x=> x.id === id) : null;
  document.getElementById('ceTitle').textContent = e ? 'Edit Entry' : 'New Entry';
  document.getElementById('ceDate').value  = e ? e.date : (date || todayISO());
  document.getElementById('ceType').innerHTML =
    CAL_TYPES.map(t=> `<option value="${t.v}" ${e && e.type===t.v ? 'selected':''}>${t.label}</option>`).join('');
  document.getElementById('ceWhat').value  = e ? (e.title || '') : '';
  document.getElementById('cePlayer').value = e && e.playerId
    ? (playerById(e.playerId) ? getField(playerById(e.playerId),'first') + ' ' + getField(playerById(e.playerId),'last') : '')
    : '';
  document.getElementById('ceCoach').innerHTML = coachOptions(e ? e.coach : '', '— whole staff —');
  document.getElementById('ceNotes').value = e ? (e.notes || '') : '';
  document.getElementById('ceDelete').style.display = e ? 'inline-flex' : 'none';
  refreshTaskPlayerList();
  document.getElementById('ceWarn').textContent = '';
  document.getElementById('scrim').classList.add('show');
  document.getElementById('calEntryModal').classList.add('show');
}
document.getElementById('ceSave').addEventListener('click', async ()=>{
  const date = document.getElementById('ceDate').value;
  if(!date){ document.getElementById('ceWarn').textContent = 'Pick a date.'; return; }
  const nm = document.getElementById('cePlayer').value.trim().toLowerCase();
  const match = nm ? allPlayers().find(p=>
    (getField(p,'first')+' '+getField(p,'last')).toLowerCase() === nm) : null;
  if(nm && !match){ document.getElementById('ceWarn').textContent = 'No player by that name.'; return; }
  const rec = {
    date: date,
    type: document.getElementById('ceType').value,
    title: document.getElementById('ceWhat').value.trim(),
    playerId: match ? match.id : '',
    coach: document.getElementById('ceCoach').value,
    notes: document.getElementById('ceNotes').value.trim(),
  };
  if(calEditId){
    Object.assign(calEntries.find(x=> x.id === calEditId), rec);
  }else{
    calEntries.push(Object.assign({ id:'ce-' + Date.now() + '-' + calEntries.length }, rec));
  }
  const ok = await saveCalEntries();
  const bad = entryConflict(rec);
  closeDrawer();
  renderCalendar();
  alertBar(bad ? `Saved — but that is inside a ${bad}. Check the rules before it happens.`
               : 'Saved to the calendar.', bad ? undefined : (ok ? 'ok' : undefined));
});
document.getElementById('ceDelete').addEventListener('click', async ()=>{
  const b = document.getElementById('ceDelete');
  if(b.dataset.arm !== '1'){
    b.dataset.arm = '1'; b.textContent = 'Sure?';
    setTimeout(()=>{ if(b.isConnected && b.dataset.arm==='1'){ b.dataset.arm='0'; b.textContent='Delete'; } }, 4000);
    return;
  }
  b.dataset.arm = '0'; b.textContent = 'Delete';
  calEntries = calEntries.filter(x=> x.id !== calEditId);
  flashSaved(await saveCalEntries());
  closeDrawer();
  renderCalendar();
});
document.getElementById('ceClose').addEventListener('click', closeDrawer);
document.getElementById('ceCancel').addEventListener('click', closeDrawer);
document.getElementById('calViewSeg').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return;
  calView = b.dataset.calview;
  renderCalendar();
});
document.getElementById('calAdd').addEventListener('click', ()=> openCalEntry(null, todayISO()));
['calFrom','calTo'].forEach(id=> document.getElementById(id).addEventListener('change', ()=>{
  calFrom = document.getElementById('calFrom').value;
  calTo   = document.getElementById('calTo').value;
  renderCalendar();
}));
document.getElementById('calOfficials').addEventListener('click', ()=>{
  const list = calEntries.filter(e=> e.type === 'official')
    .sort((a,b)=> a.date.localeCompare(b.date));
  if(!list.length){ alertBar('No official visits booked yet.'); return; }
  alertBar(`${list.length} official visit${list.length===1?'':'s'}: ` + list.map(e=>{
    const p = e.playerId ? playerById(e.playerId) : null;
    return (p ? getField(p,'last') : (e.title || 'unnamed')) + ' ' + fmtDate(e.date);
  }).join(' · '), 'ok');
});
