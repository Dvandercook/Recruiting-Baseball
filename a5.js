/* ==========================================================================
   Hub: routing between the home page and each section.
   ========================================================================== */
const EVENTS_KEY = 'events-store';
const TEAM_KEY   = 'team-roster';
let events = [];        // all events, all seasons
let teamRoster = [];
let evSeason = 'fall';
let evSort = { key:'start', dir:1 };
let tmSort = { key:'last', dir:1 };

const SECTIONS = [
  { id:'hs',       title:'High School Recruiting', accent:'',      view:'view-hs',
    desc:'The 2028 board — tiers, profiles, notes and CSV import.',
    count:()=> `${allPlayers().length} players · ${allPlayers().filter(p=>getTier(p)==='1').length} top lions`,
    icon:'<path d="M12 3 2 8l10 5 10-5zM4 11v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5"/>' },
  { id:'transfer', title:'Transfer Recruiting', accent:'slate',   view:'view-hs', pool:'transfer',
    desc:'The portal and JUCO — same board, same tools, separate pool.',
    count:()=> { const n = allPlayers().filter(p=> poolOf(p)==='transfer').length;
                 return n ? `${n} in the pool` : 'nobody added yet'; },
    emptyIf:()=> !allPlayers().some(p=> poolOf(p)==='transfer'),
    icon:'<path d="M4 8h13l-3-3M20 16H7l3 3"/>' },
  { id:'calendar', title:'Recruiting Calendar', accent:'gold',    view:'view-calendar',
    desc:'NCAA Division I contact, quiet and dead periods.',
    count:()=> { const s = currentCalPeriod(); return s ? 'now: ' + s.type : 'NCAA D-I 2026-27'; },
    icon:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>' },
  { id:'team',     title:'Team Management', accent:'dirt',        view:'view-team',
    desc:'Your own roster — class, position, contact.',
    count:()=> teamRoster.length ? `${teamRoster.length} on roster` : 'no players yet', emptyIf:()=>!teamRoster.length,
    icon:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/>' },
  { id:'tasks',    title:'Tasks', accent:'gold',                 view:'view-tasks',
    desc:'The staff to-do list — assign it, link a kid, set a reminder.',
    count:()=> { const n = openTasks().length;
                 const late = tasks.filter(taskOverdue).length;
                 return n ? `${n} open${late ? ' · ' + late + ' overdue' : ''}` : 'nothing open'; },
    emptyIf:()=> !openTasks().length,
    icon:'<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>' },
  { id:'orgs',     title:'Travel Organizations', accent:'slate',  view:'view-orgs',
    desc:'The programs you see, tiered your way.',
    count:()=> travelOrgs.length ? `${travelOrgs.length} programs · ${travelOrgs.filter(o=>o.tier).length} tiered`
                                 : 'nothing listed yet',
    emptyIf:()=> !travelOrgs.length,
    icon:'<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>' },
  { id:'notes',    title:'Event Notes', accent:'gold',            view:'view-notes',
    desc:'Work a roster at the field. Notes land on each profile.',
    count:()=> { const n = attendance.length; return n ? n + ' on rosters' : 'pick an event'; },
    emptyIf:()=> !attendance.length,
    icon:'<path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5M8 13h8M8 17h5"/>' },
  { id:'fall',     title:'Fall Events', accent:'',                view:'view-events', season:'fall',
    desc:'Tournaments and showcases, September through November.',
    count:()=> seasonCount('fall'), emptyIf:()=>!seasonEvents('fall').length,
    icon:'<path d="M12 3v18M5 8c3 0 5 2 7 4M19 8c-3 0-5 2-7 4"/>' },
  { id:'summer',   title:'Summer Events', accent:'gold',          view:'view-events', season:'summer',
    desc:'June through August schedule.',
    count:()=> seasonCount('summer'), emptyIf:()=>!seasonEvents('summer').length,
    icon:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>' },
  { id:'spring',   title:'Spring Events', accent:'dirt',          view:'view-events', season:'spring',
    desc:'March through May schedule.',
    count:()=> seasonCount('spring'), emptyIf:()=>!seasonEvents('spring').length,
    icon:'<path d="M12 21c0-6 3-9 8-10-1 6-4 9-8 10zM12 21c0-5-2-8-6-9 1 5 3 8 6 9zM12 21V11"/>' },
];
function seasonEvents(s){ return events.filter(e=>e.season===s); }
function seasonCount(s){
  const list = seasonEvents(s);
  if(!list.length) return 'none yet';
  const n = list.filter(e=>e.star).length;
  return `${list.length} event${list.length===1?'':'s'}` + (n ? ` · ★ ${n}` : '');
}
/* ---- routing ---------------------------------------------------------------
   Remember the open section without navigating: assigning location.hash counts
   as a navigation and is refused inside sandboxed preview panes. replaceState
   is silent, and if even that is blocked we just keep the route in memory.
--------------------------------------------------------------------------- */
let memRoute = '';
function setRoute(id){
  memRoute = id;
  try{
    if(window.history && history.replaceState){
      history.replaceState(null, '', id ? '#' + id : location.pathname + location.search);
    }
  }catch(e){ /* preview pane blocks it — memory is enough */ }
}
function getRoute(){
  try{ return (location.hash || '').replace('#',''); }catch(e){ return memRoute; }
}
function goTo(id){
  const sec = SECTIONS.find(s=>s.id===id);
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  if(id === 'home'){
    document.getElementById('view-home').classList.add('active');
    renderHome();
    setRoute('');
    return;
  }
  // High school and transfer are the same screen pointed at a different pool.
  if(sec.view === 'view-hs'){
    const want = sec.pool || 'hs';
    if(POOL !== want){ POOL = want; activePos = null; activeTier = null; }
    document.getElementById('poolTitle').textContent =
      want === 'transfer' ? 'Transfer Board' : '2028 Recruiting Board';
    document.body.classList.toggle('pool-transfer', want === 'transfer');
  }
  document.getElementById(sec.view).classList.add('active');
  setRoute(id);
  if(sec.season){ evSeason = sec.season; renderEvents(); }
  if(id === 'calendar') renderCalendar();
  if(id === 'notes') renderNotes();
  if(id === 'team') renderTeam();
  if(id === 'orgs') renderOrgs();
  if(id === 'tasks'){ refreshTaskPlayerList(); renderTasks(); }
  if(id === 'hs' || id === 'transfer') renderHs();
}
function renderHome(){
  document.getElementById('homeGrid').innerHTML = SECTIONS.map(s=>{
    const isEmpty = s.empty || (s.emptyIf && s.emptyIf());
    return `<button class="tile ${s.accent}" data-goto="${s.id}">
      <div class="tile-top">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>
        <h3>${s.title}</h3>
      </div>
      <p>${s.desc}</p>
      <div class="tile-count ${isEmpty?'empty':''}">${s.count()}</div>
    </button>`;
  }).join('');
}
document.addEventListener('click', (e)=>{
  const t = e.target.closest('[data-goto]');
  if(!t) return;
  goTo(t.dataset.goto);
});
/* ---- events ---- */
async function loadEvents(){
  try{
    const raw = await Store.get(EVENTS_KEY);
    events = raw ? JSON.parse(raw) : SEED_EVENTS.slice();
  }catch(e){ events = SEED_EVENTS.slice(); }
  if(!Array.isArray(events) || !events.length) events = SEED_EVENTS.slice();
}
async function saveEvents(){ return Store.set(EVENTS_KEY, JSON.stringify(events)); }
/* Perfect Game and PBR event links, matched by name and applied once. Only fills
   blanks, so a link you saved or cleared yourself is never touched, and the flag
   means a link you delete does not come back on the next load. */
/* New events added to the seed after a coach already has events saved. Matched
   on name + start so a hand-edited copy is never duplicated. */
const SEED_ADD_KEY = 'seed-events-added';
async function addNewSeedEvents(){
  if(await Store.get(SEED_ADD_KEY) === 'v1') return 0;
  const have = new Set(events.map(e=>
    String(e.name||'').toLowerCase().replace(/[^a-z0-9]/g,'') + '|' + e.start));
  let n = 0;
  SEED_EVENTS.forEach(se=>{
    const k = String(se.name||'').toLowerCase().replace(/[^a-z0-9]/g,'') + '|' + se.start;
    if(have.has(k)) return;
    events.push(Object.assign({}, se));
    have.add(k); n++;
  });
  await Store.set(SEED_ADD_KEY, 'v1');
  if(n) await saveEvents();
  return n;
}
const LINK_FILL_KEY = 'event-links-filled';
async function backfillEventLinks(){
  if(typeof LINK_BACKFILL === 'undefined') return 0;
  if(await Store.get(LINK_FILL_KEY) === 'v3') return 0;
  let n = 0;
  events.forEach(e=>{
    const row = LINK_BACKFILL[String(e.name||'').toLowerCase().replace(/[^a-z0-9]/g,'')];
    if(!row) return;
    EV_SITES.forEach(s2=>{ if(!e[s2.field] && row[s2.field]){ e[s2.field] = row[s2.field]; n++; } });
  });
  await Store.set(LINK_FILL_KEY, 'v3');
  if(n) await saveEvents();
  return n;
}
function fmtDate(iso){
  if(!iso) return '';
  const [y,m,d] = iso.split('-').map(Number);
  if(!y) return iso;
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MON[m-1]} ${d}`;
}
function fmtRange(e){
  if(!e.end || e.end === e.start) return fmtDate(e.start);
  const sameMonth = e.start.slice(0,7) === e.end.slice(0,7);
  return sameMonth ? `${fmtDate(e.start)}–${Number(e.end.split('-')[2])}` : `${fmtDate(e.start)} – ${fmtDate(e.end)}`;
}
function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function visibleEvents(){
  const q = document.getElementById('evSearch').value.trim().toLowerCase();
  const div = document.getElementById('evDivision').value;
  const st  = document.getElementById('evState').value;
  const up  = document.getElementById('evUpcoming').checked;
  const st8 = document.getElementById('evStarred').checked;
  const from = document.getElementById('evFrom').value;
  const to   = document.getElementById('evTo').value;
  const today = todayISO();
  let list = seasonEvents(evSeason).filter(e=>{
    if(div && e.division !== div) return false;
    if(st && e.state !== st) return false;
    if(up && (e.end || e.start) < today) return false;
    if(st8 && !e.star) return false;
    // overlap test: keep anything that runs during the window, not just starts in it
    if(from && (e.end || e.start) < from) return false;
    if(to   && e.start > to) return false;
    if(q && !`${e.name} ${e.location} ${e.division}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const k = evSort.key, dir = evSort.dir;
  const byDate = (a,b)=> String(a.start).localeCompare(String(b.start))
                      || String(a.end||'').localeCompare(String(b.end||''));
  list.sort((a,b)=>{
    if(k === 'star'){
      const d = ((b.star?1:0) - (a.star?1:0)) * dir;
      return d || byDate(a,b);
    }
    if(k === 'start'){
      return byDate(a,b) * dir || String(a.name).localeCompare(String(b.name));
    }
    const A = String(a[k]||''), B = String(b[k]||'');
    // blanks last regardless of direction
    if(!A && B) return 1;
    if(A && !B) return -1;
    return A.localeCompare(B, undefined, {numeric:true, sensitivity:'base'}) * dir || byDate(a,b);
  });
  return list;
}
function renderEvents(){
  const label = evSeason.charAt(0).toUpperCase()+evSeason.slice(1);
  document.getElementById('evTitle').textContent = label + ' Events';
  document.getElementById('evSeasonSeg').querySelectorAll('button')
    .forEach(b=> b.classList.toggle('active', b.dataset.season === evSeason));
  // filter option lists reflect the season in view
  const all = seasonEvents(evSeason);
  const fill = (sel, vals, keepLabel)=>{
    const cur = sel.value;
    sel.innerHTML = `<option value="">${keepLabel}</option>` +
      [...new Set(vals.filter(Boolean))].sort().map(v=>`<option ${v===cur?'selected':''}>${escAttr(v)}</option>`).join('');
  };
  fill(document.getElementById('evDivision'), all.map(e=>e.division), 'All divisions');
  fill(document.getElementById('evState'), all.map(e=>e.state), 'All states');
  const list = visibleEvents();
  const hasRange = document.getElementById('evFrom').value || document.getElementById('evTo').value;
  document.getElementById('evRangeClear').style.display = hasRange ? 'inline-block' : 'none';
  const nStar = all.filter(e=>e.star).length;
  document.getElementById('evCount').textContent =
    `${list.length} of ${all.length}` + (nStar ? ` · ★ ${nStar}` : '');
  const body = document.getElementById('evBody');
  if(!all.length){
    body.innerHTML = `<div class="sec-empty">
      <h4>No ${label.toLowerCase()} events yet</h4>
      <p>Import a schedule with <strong>Import CSV</strong> — columns <code>Start</code>, <code>End</code>,
      <code>Event</code>, <code>Division</code>, <code>Location</code>. Rows land in the season their start date falls in,
      so one file can fill all three tabs at once.</p></div>`;
    return;
  }
  if(!list.length){ body.innerHTML = `<div class="sec-empty"><h4>Nothing matches</h4><p>Try clearing the filters.</p></div>`; return; }
  const arrow = k => evSort.key===k ? `<span class="arrow">${evSort.dir>0?'▲':'▼'}</span>` : '';
  const today = todayISO();
  body.innerHTML = `<table class="dt">
    <thead><tr>
      <th class="sortable ${evSort.key==='star'?'sorted':''}" data-sort="star" title="Sort starred first">★ ${arrow('star')}</th>
      <th class="sortable ${evSort.key==='start'?'sorted':''}" data-sort="start">Dates ${arrow('start')}</th>
      <th class="sortable ${evSort.key==='name'?'sorted':''}" data-sort="name">Event ${arrow('name')}</th>
      <th class="sortable ${evSort.key==='division'?'sorted':''}" data-sort="division">Division ${arrow('division')}</th>
      <th class="sortable ${evSort.key==='location'?'sorted':''}" data-sort="location">Location ${arrow('location')}</th>
      <th style="cursor:default">Going</th>
      <th style="text-align:right;cursor:default">Links</th>
    </tr></thead><tbody>${
    list.map(e=>`<tr class="${e.star?'starred':''}">
      <td class="star-cell"><button class="ev-star ${e.star?'on':''}" data-star="${escAttr(e.id)}"
          title="${e.star?'Remove star':'Star this event'}" aria-pressed="${e.star?'true':'false'}">${e.star?'★':'☆'}</button></td>
      <td class="date">${fmtRange(e)}${(e.end||e.start) < today ? ' <span class="dim">·past</span>' : ''}</td>
      <td class="nm">${escAttr(e.name)}${e.source?`<span class="pill-div" style="margin-left:7px;font-size:9.5px;opacity:.8">${escAttr(e.source)}</span>`:''}</td>
      <td><span class="pill-div">${escAttr(e.division||'—')}</span></td>
      <td class="dim">${escAttr(e.location||'—')}</td>
      <td>${(()=>{ const n = attendeesOf(e.id).length;
        return `<span class="att-count ${n?'':'zero'}">${n}</span>`; })()}</td>
      <td><div class="ev-links">${EV_SITES.map(site=>{
        const L = eventLink(e, site);
        return `<a class="ev-lnk icon-btn ${L.saved?'saved':''}" href="${escAttr(L.url)}" target="_blank" rel="noopener"
                   title="${L.saved ? 'Saved '+site.name+' page' : 'Search '+site.name+' for this event'}">${site.short}</a>`;
      }).join('')}<button class="ev-edit" data-edgo="${escAttr(e.id)}" title="Open this event — schedule, rosters, players">▦</button><button class="ev-edit" data-ntgo="${escAttr(e.id)}" title="Take notes at this event">✎̶</button><button class="ev-edit" data-evedit="${escAttr(e.id)}" title="Edit event">✎</button></div></td>
    </tr>`).join('')}</tbody></table>` + `
    <div class="ev-hubs">Full schedules:
      ${EV_SITES.map(s2=>`<a href="${s2.hub}" target="_blank" rel="noopener">${s2.name}</a>`).join(' · ')}
      <span style="margin-left:auto">Green = a link you saved. Grey = opens that site's event finder for these dates.</span>
    </div>`;
  body.querySelectorAll('th[data-sort]').forEach(th=>{
    th.addEventListener('click', ()=>{
      const k = th.dataset.sort;
      evSort = { key:k, dir: evSort.key===k ? -evSort.dir : 1 };
      renderEvents();
    });
  });
  body.querySelectorAll('[data-star]').forEach(btn=>{
    btn.addEventListener('click', async (ev)=>{
      ev.stopPropagation();
      const e = events.find(x=>x.id === btn.dataset.star);
      if(!e) return;
      e.star = !e.star;
      const ok = await saveEvents();
      renderEvents();
      renderHome();
      if(!ok) alertBar('Starred on screen, but could not be saved.');
    });
  });
  body.querySelectorAll('[data-evedit]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEventEditor(btn.dataset.evedit));
  });
  body.querySelectorAll('[data-ntgo]').forEach(btn=>{
    btn.addEventListener('click', ()=> goNotes(btn.dataset.ntgo));
  });
  body.querySelectorAll('[data-edgo]').forEach(btn=>{
    btn.addEventListener('click', ()=> goEventDetail(btn.dataset.edgo));
  });
}
/* ---- add / edit an event ---- */
let evmId = null;                    // null while adding
const EV_SOURCE_URL_FIELD = { 'Perfect Game':'pgUrl', 'PBR':'pbrUrl', 'Five Tool':'ftUrl',
                              'Prospect Select':'psUrl' };
function evmSet(id, v){ document.getElementById(id).value = v || ''; }
function evmGet(id){ return document.getElementById(id).value.trim(); }
function openEventEditor(id){
  evmId = id || null;
  const e = id ? events.find(x=>x.id===id) : null;
  document.getElementById('evmTitle').textContent = e ? 'Edit Event' : 'Add Event';
  document.getElementById('evmDates').textContent = e ? [fmtRange(e), e.season].filter(Boolean).join('  ·  ') : '';
  evmSet('evmName',  e && e.name);
  evmSet('evmStart', e && e.start);
  evmSet('evmEnd',   e && e.end);
  evmSet('evmDiv',   e && e.division);
  evmSet('evmState', e && e.state);
  evmSet('evmLoc',   e && e.location);
  evmSet('evmPg',    e && e.pgUrl);
  evmSet('evmPbr',   e && e.pbrUrl);
  evmSet('evmFt',    e && e.ftUrl);
  evmSet('evmPs',    e && e.psUrl);
  evmSet('evmOther', e && e.otherUrl);
  document.getElementById('evmSource').value = (e && e.source) || '';
  document.getElementById('evmOtherWrap').style.display =
    ((e && e.source) === 'Other') ? 'block' : 'none';
  document.getElementById('evmError').textContent = '';
  paintEventAttendance();
  const del = document.getElementById('evmDelete');
  del.style.display = e ? 'inline-block' : 'none';
  del.textContent = 'Delete event';
  del.dataset.arm = '0';
  document.getElementById('scrim').classList.add('show');
  document.getElementById('eventModal').classList.add('show');
  setTimeout(()=> document.getElementById('evmName').focus(), 60);
}
function paintEventAttendance(){
  const wrap = document.getElementById('evmAttList');
  const dl = document.getElementById('evmPlayerList');
  const countEl = document.getElementById('evmAttCount');
  if(!evmId){
    countEl.textContent = '';
    wrap.innerHTML = `<div class="att-none">Save the event first, then add who's going.</div>`;
    document.getElementById('evmAttPlayer').disabled = true;
    document.getElementById('evmAttTeam').disabled = true;
    document.getElementById('evmAttAdd').disabled = true;
    return;
  }
  document.getElementById('evmAttPlayer').disabled = false;
  document.getElementById('evmAttTeam').disabled = false;
  document.getElementById('evmAttAdd').disabled = false;
  dl.innerHTML = allPlayers()
    .map(p=>`<option value="${escAttr(getField(p,'first') + ' ' + getField(p,'last') + '  ·  ' + (getField(p,'posDisplay')||'') + ' ' + (getField(p,'state')||''))}"></option>`)
    .join('');
  const rows = attendeesOf(evmId)
    .map(a=> ({ a, p: playerById(a.playerId) }))
    .filter(x=> x.p)
    .sort((x,y)=> (TIER_SORT_INDEX[getTier(x.p)] ?? 9) - (TIER_SORT_INDEX[getTier(y.p)] ?? 9)
               || String(getField(x.p,'last')).localeCompare(String(getField(y.p,'last'))));
  countEl.textContent = rows.length ? `· ${rows.length}` : '';
  if(!rows.length){
    wrap.innerHTML = `<div class="att-none">Nobody added yet.</div>`;
    return;
  }
  wrap.innerHTML = rows.map(({a,p})=>{
    const td = TIER_DEFS[getTier(p)] || TIER_DEFS['2'];
    return `<div class="att-row">
      <div class="bb-tier tier-${td.cls}" title="${escAttr(td.label)}">${isRated(p)?td.short:'—'}</div>
      <div class="att-main">
        <div class="att-nm">${escAttr(getField(p,'first'))} ${escAttr(getField(p,'last'))}</div>
        <div class="att-meta">${escAttr([getField(p,'posDisplay'), getField(p,'state'), getField(p,'school')].filter(Boolean).join(' · '))}</div>
      </div>
      <input class="att-team" data-eatteam="${escAttr(a.id)}" value="${escAttr(a.team)}" placeholder="Travel team">
      <button class="att-x" data-eatdel="${escAttr(a.id)}" title="Remove">✕</button>
    </div>`;
  }).join('');
  wrap.querySelectorAll('[data-eatteam]').forEach(inp=>{
    inp.addEventListener('change', ()=> setAttendanceTeam(inp.dataset.eatteam, inp.value));
  });
  wrap.querySelectorAll('[data-eatdel]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(btn.dataset.arm !== '1'){
        btn.dataset.arm='1'; btn.textContent='remove?'; btn.classList.add('arm');
        setTimeout(()=>{ if(btn.isConnected && btn.dataset.arm==='1'){ btn.dataset.arm='0'; btn.textContent='✕'; btn.classList.remove('arm'); } }, 4000);
        return;
      }
      await removeAttendance(btn.dataset.eatdel);
      paintEventAttendance();
      renderEvents();
    });
  });
}
document.getElementById('evmAttAdd').addEventListener('click', async ()=>{
  if(!evmId) return;
  const typed = document.getElementById('evmAttPlayer').value.trim();
  if(!typed) return;
  const nm = typed.split('  ·  ')[0].trim().toLowerCase();
  const match = allPlayers().find(p=> (getField(p,'first')+' '+getField(p,'last')).toLowerCase() === nm)
             || allPlayers().find(p=> (getField(p,'first')+' '+getField(p,'last')).toLowerCase().includes(nm));
  if(!match){ document.getElementById('evmError').textContent = 'No recruit matches that name.'; return; }
  if(isAttending(match.id, evmId)){ document.getElementById('evmError').textContent = 'Already on this event.'; return; }
  const team = document.getElementById('evmAttTeam').value.trim() || getField(match,'team');
  await addAttendance(match.id, evmId, team);
  document.getElementById('evmAttPlayer').value = '';
  document.getElementById('evmError').textContent = '';
  paintEventAttendance();
  renderEvents();
});
document.getElementById('evmSource').addEventListener('change', e=>{
  document.getElementById('evmOtherWrap').style.display = e.target.value === 'Other' ? 'block' : 'none';
});
// "Find" runs that site's search using whatever is typed in the form right now
document.getElementById('eventModal').addEventListener('click', e=>{
  const f = e.target.closest('[data-find]');
  if(!f) return;
  const site = EV_SITES.find(s2=>s2.id===f.dataset.find);
  const draft = { name: evmGet('evmName'), start: evmGet('evmStart'), end: evmGet('evmEnd'),
                  division: evmGet('evmDiv'), season: seasonOf(evmGet('evmStart')) };
  if(!draft.name && !draft.start){
    document.getElementById('evmError').textContent = 'Add a name or a start date first.';
    return;
  }
  openExternal(eventLink(draft, site).url, site.name + ' search');
});
document.getElementById('evmSave').addEventListener('click', async ()=>{
  const name = evmGet('evmName'), start = evmGet('evmStart');
  const err = document.getElementById('evmError');
  if(!name || !start){ err.textContent = 'Event name and start date are required.'; return; }
  const loc = evmGet('evmLoc');
  const source = document.getElementById('evmSource').value;
  const patch = {
    name, start,
    end: evmGet('evmEnd') || start,
    division: evmGet('evmDiv'),
    location: loc,
    state: evmGet('evmState') || (loc.includes(',') ? loc.split(',').pop().trim() : ''),
    season: seasonOf(start),
    source,
    pgUrl: evmGet('evmPg'), pbrUrl: evmGet('evmPbr'), ftUrl: evmGet('evmFt'),
    psUrl: evmGet('evmPs'),
    otherUrl: source === 'Other' ? evmGet('evmOther') : '',
  };
  // if they named a source but only pasted one URL, file it under that site
  const f = EV_SOURCE_URL_FIELD[source];
  if(f && !patch[f]){
    const only = ['pgUrl','pbrUrl','ftUrl','psUrl'].filter(k=>patch[k]);
    if(only.length === 1) { patch[f] = patch[only[0]]; }
  }
  let ev;
  if(evmId){
    ev = events.find(x=>x.id===evmId);
    Object.assign(ev, patch);
  }else{
    ev = Object.assign({ id: 'ev-' + start + '-' + Math.random().toString(36).slice(2,7) }, patch);
    events.push(ev);
  }
  const ok = await saveEvents();
  const jumped = ev.season !== evSeason;
  if(jumped) evSeason = ev.season;
  closeDrawer();
  renderEvents();
  renderHome();
  alertBar(
    (evmId ? 'Event updated.' : 'Event added.') +
    (jumped ? ` Filed under ${ev.season} events.` : '') +
    (ok ? '' : ' Could not save — export before closing.'),
    ok ? 'ok' : undefined);
});
document.getElementById('evmDelete').addEventListener('click', async (e)=>{
  const btn = e.currentTarget;
  if(btn.dataset.arm !== '1'){
    btn.dataset.arm = '1'; btn.textContent = 'Confirm delete';
    setTimeout(()=>{ if(btn.isConnected && btn.dataset.arm==='1'){ btn.dataset.arm='0'; btn.textContent='Delete event'; } }, 4000);
    return;
  }
  const goneId = evmId;
  events = events.filter(x=>x.id !== goneId);
  attendance = attendance.filter(a=> a.eventId !== goneId);
  await saveAttendance();
  const ok = await saveEvents();
  closeDrawer();
  renderEvents();
  renderHome();
  alertBar(ok ? 'Event deleted.' : 'Deleted on screen, but could not be saved.', ok ? 'ok' : undefined);
});
document.getElementById('evAdd').addEventListener('click', ()=> openEventEditor(null));
document.getElementById('evmClose').addEventListener('click', closeDrawer);
document.getElementById('evmCancel').addEventListener('click', closeDrawer);
['evFrom','evTo'].forEach(id=>{
  document.getElementById(id).addEventListener('change', renderEvents);
});
document.getElementById('evRangeClear').addEventListener('click', ()=>{
  document.getElementById('evFrom').value = '';
  document.getElementById('evTo').value = '';
  renderEvents();
});
['evSearch','evDivision','evState','evUpcoming','evStarred'].forEach(id=>{
  document.getElementById(id).addEventListener(id==='evSearch'?'input':'change', renderEvents);
});
document.getElementById('evSeasonSeg').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return;
  evSeason = b.dataset.season; renderEvents();
});
/* ---- per-event tournament links -------------------------------------------
   Perfect Game exposes a real search endpoint that takes a date window and a
   division, so a PG link can be built from each event's own dates. PBR and
   Five Tool publish no documented search parameters, so those fall back to a
   site-scoped web search. Any link you paste in yourself wins over both.
--------------------------------------------------------------------------- */
const EV_SITES = [
  { id:'pg',  short:'PG',  name:'Perfect Game', field:'pgUrl',  hub:'https://www.perfectgame.org/Schedule/' },
  { id:'pbr', short:'PBR', name:'PBR',          field:'pbrUrl', hub:'https://tournaments.prepbaseballreport.com/' },
  { id:'ft',  short:'5T',  name:'Five Tool',    field:'ftUrl',  hub:'https://fivetool.org/events' },
  { id:'ps',  short:'PS',  name:'Prospect Select', field:'psUrl', hub:'https://play.ps-baseball.com/' },
];
// "16U, 17U" -> 16U ; "14U-18U" -> 14U ; "15U/16U, 17U/18U" -> 15U
function firstDivision(div){
  const m = String(div || '').match(/(\d{1,2}U)/);
  return m ? m[1] : '';
}
function pgSearchUrl(e){
  const p = new URLSearchParams();
  p.set('sportType', 'All Sports');
  if(e.start) p.set('startDate', e.start);
  if(e.end || e.start) p.set('endDate', e.end || e.start);
  const d = firstDivision(e.division);
  if(d) p.set('division', d);
  return 'https://search.perfectgame.org/?' + p.toString();
}
// Five Tool runs the same finder as PBR, with the season in the path.
function ftSearchUrl(e){
  const name = String(e.name || '')
    .replace(/^\s*(19|20)\d{2}\s+/, '')
    .replace(/^PG\s+/i, '')
    .trim();
  const p = new URLSearchParams();
  p.set('region', '');
  p.set('name', name);
  p.set('event_label_id', '');
  p.set('division', firstDivision(e.division));
  p.set('state', '');
  p.set('sport_id', '');
  p.set('venue_id', '');
  const year = String(e.start || '').slice(0, 4);
  const seasonPath = (year && ['fall','summer','spring'].includes(e.season))
    ? `season/${year}-${e.season}` : '';
  return 'https://events.fivetool.org/' + seasonPath + '?' + p.toString();
}
// PBR's tournament finder takes name / division / state directly.
// Leading year and a "PG" prefix are dropped — PBR won't list it under those.
function pbrSearchUrl(e){
  const name = String(e.name || '')
    .replace(/^\s*(19|20)\d{2}\s+/, '')
    .replace(/^PG\s+/i, '')
    .trim();
  const p = new URLSearchParams();
  p.set('region', '');
  p.set('name', name);
  p.set('event_label_id', '');
  p.set('division', firstDivision(e.division));
  p.set('state', '');
  return 'https://tournaments.prepbaseballreport.com/?' + p.toString();
}
// Prospect Select runs the same Playbook365 finder as PBR, so the query shape
// is identical — only the host changes.
function psSearchUrl(e){
  const name = String(e.name || '')
    .replace(/^20\d\d[\s-]*/, '').replace(/\bPS\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  const p = new URLSearchParams();
  p.set('region', '');
  p.set('name', name);
  p.set('event_label_id', '');
  p.set('division', firstDivision(e.division));
  p.set('state', '');
  return 'https://play.ps-baseball.com/?' + p.toString();
}
function eventLink(e, site){
  const saved = String(e[site.field] || '').trim();
  if(saved) return { url: saved, saved: true };
  if(site.id === 'pg')  return { url: pgSearchUrl(e), saved: false };
  if(site.id === 'pbr') return { url: pbrSearchUrl(e), saved: false };
  if(site.id === 'ps')  return { url: psSearchUrl(e), saved: false };
  return { url: ftSearchUrl(e), saved: false };
}
/* ---- events CSV ---- */
const EV_HEADER_MAP = {
  start:'start', startdate:'start', begin:'start', from:'start', date:'start',
  end:'end', enddate:'end', to:'end', finish:'end',
  event:'name', eventname:'name', name:'name', tournament:'name',
  division:'division', divisions:'division', age:'division', agegroup:'division',
  location:'location', city:'location', venue:'location',
  state:'state', st:'state',
  pgurl:'pgUrl', pg:'pgUrl', perfectgame:'pgUrl', perfectgameurl:'pgUrl',
  pbrurl:'pbrUrl', pbr:'pbrUrl', prepbaseballreport:'pbrUrl',
  psurl:'psUrl', ps:'psUrl', prospectselect:'psUrl',
  fivetoolurl:'ftUrl', fivetool:'ftUrl', ft:'ftUrl', fivetoolsurl:'ftUrl', fivetools:'ftUrl',
  source:'source', site:'source', website:'source', from:'source', otherurl:'otherUrl',
  starred:'star', star:'star', priority:'star', top:'star',
};
function parseLooseDate(v){
  v = String(v||'').trim();
  if(!v) return '';
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m) return `${m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`;
  m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if(m){
    let y = +m[3]; if(y < 100) y += 2000;
    return `${y}-${String(+m[1]).padStart(2,'0')}-${String(+m[2]).padStart(2,'0')}`;
  }
  return '';
}
function seasonOf(iso){
  const m = +String(iso).split('-')[1];
  if(m>=3 && m<=5) return 'spring';
  if(m>=6 && m<=8) return 'summer';
  if(m>=9 && m<=11) return 'fall';
  return 'winter';
}
function eventsToCsv(list){
  const cols = ['Start','End','Event','Division','Location','Season','Source',
                'PG URL','PBR URL','Five Tool URL','Prospect Select URL','Other URL',
                'Starred','Going','Attendees'];
  const rows = [cols.map(csvCell).join(',')];
  list.forEach(e=>{
    const att = attendeesOf(e.id).map(a=>{
      const p = playerById(a.playerId);
      return p ? getField(p,'first')+' '+getField(p,'last') + (a.team ? ' ('+a.team+')' : '') : '';
    }).filter(Boolean);
    rows.push([e.start,e.end,e.name,e.division,e.location,e.season,e.source||'',
               e.pgUrl||'',e.pbrUrl||'',e.ftUrl||'',e.psUrl||'',e.otherUrl||'',
               e.star?'Yes':'', att.length, att.join(' | ')].map(csvCell).join(','));
  });
  return rows.join('\r\n');
}
function downloadText(name, text, type){
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
document.getElementById('evExport').addEventListener('click', ()=>{
  downloadText(`${evSeason}-events.csv`, eventsToCsv(seasonEvents(evSeason)), 'text/csv;charset=utf-8;');
});
/* Generic hidden file picker reused by the event and roster importers. */
function pickFile(accept, onText){
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept;
  inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.addEventListener('change', ()=>{
    const f = inp.files[0];
    if(!f){ inp.remove(); return; }
    const fr = new FileReader();
    fr.onload = ()=>{ onText(String(fr.result)); inp.remove(); };
    fr.onerror = ()=>{ alertBar('Could not read that file.'); inp.remove(); };
    fr.readAsText(f);
  });
  inp.click();
}
document.getElementById('evImport').addEventListener('click', ()=>{
  pickFile('.csv,text/csv', async (text)=>{
    let rows;
    try{ rows = parseCSV(text); }catch(e){ alertBar('Could not read that file as CSV.'); return; }
    if(rows.length < 2){ alertBar('That file has no rows under the header.'); return; }
    const headers = rows[0].map(normHeader).map(h=> EV_HEADER_MAP[h] || null);
    if(!headers.includes('start') || !headers.includes('name')){
      alertBar('Need at least a Start date column and an Event name column.');
      return;
    }
    let added = 0, skipped = 0;
    const seen = new Set(events.map(e=>`${e.start}|${String(e.name).toLowerCase()}`));
    for(let r = 1; r < rows.length; r++){
      const rec = {};
      rows[r].forEach((cell, c)=>{ const k = headers[c]; if(k) rec[k] = String(cell||'').trim(); });
      const start = parseLooseDate(rec.start);
      if(!start || !rec.name){ skipped++; continue; }
      const key = `${start}|${rec.name.toLowerCase()}`;
      if(seen.has(key)){ skipped++; continue; }
      seen.add(key);
      const loc = rec.location || '';
      events.push({
        id: 'ev-' + start + '-' + (events.length + added),
        start, end: parseLooseDate(rec.end) || start,
        name: rec.name, division: rec.division || '',
        location: loc,
        state: rec.state || (loc.includes(',') ? loc.split(',').pop().trim() : ''),
        season: seasonOf(start),
        pgUrl: rec.pgUrl || '', pbrUrl: rec.pbrUrl || '', ftUrl: rec.ftUrl || '',
        otherUrl: rec.otherUrl || '', source: rec.source || '',
        star: /^(y|yes|true|1|★|x)$/i.test(String(rec.star || '').trim()),
      });
      added++;
    }
    const ok = await saveEvents();
    renderEvents();
    const bySeason = {};
    events.forEach(e=> bySeason[e.season] = (bySeason[e.season]||0)+1);
    alertBar(`Imported ${added} event${added===1?'':'s'}${skipped?`, skipped ${skipped}`:''}.` +
             (ok ? '' : ' Could not save — export before closing.'), ok ? 'ok' : undefined);
  });
});
/* ---- team roster ---- */
const TM_HEADER_MAP = Object.assign({}, CSV_HEADER_MAP, { number:'number', jersey:'number', no:'number', '':'' });
async function loadTeam(){
  try{ const raw = await Store.get(TEAM_KEY); teamRoster = raw ? JSON.parse(raw) : []; }
  catch(e){ teamRoster = []; }
}
async function saveTeam(){ return Store.set(TEAM_KEY, JSON.stringify(teamRoster)); }
function renderTeam(){
  const q = document.getElementById('tmSearch').value.trim().toLowerCase();
  const cls = document.getElementById('tmClass').value;
  const sel = document.getElementById('tmClass'); const cur = sel.value;
  sel.innerHTML = '<option value="">All classes</option>' +
    [...new Set(teamRoster.map(p=>p.gradClass).filter(Boolean))].sort()
      .map(v=>`<option ${String(v)===cur?'selected':''}>${escAttr(v)}</option>`).join('');
  let list = teamRoster.filter(p=>{
    if(cls && String(p.gradClass) !== cls) return false;
    if(q && !`${p.first} ${p.last} ${p.posDisplay} ${p.gradClass} ${p.school}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const k = tmSort.key, dir = tmSort.dir;
  list.sort((a,b)=> String(a[k]||'').localeCompare(String(b[k]||''), undefined, {numeric:true}) * dir);
  document.getElementById('tmCount').textContent = teamRoster.length ? `${list.length} of ${teamRoster.length}` : '';
  const body = document.getElementById('tmBody');
  if(!teamRoster.length){
    body.innerHTML = `<div class="sec-empty">
      <h4>Roster is empty</h4>
      <p>Add players one at a time with <strong>Add Player</strong>, or bring in a whole roster with
      <strong>Import CSV</strong> — it reads the same column names as the recruiting board
      (<code>First Name</code>, <code>Last Name</code>, <code>Position</code>, <code>Grad Class</code>,
      <code>Phone</code>, <code>Email</code>…) plus <code>Number</code>.</p></div>`;
    return;
  }
  const arrow = key => tmSort.key===key ? `<span class="arrow">${tmSort.dir>0?'▲':'▼'}</span>` : '';
  body.innerHTML = `<table class="dt">
    <thead><tr>
      <th data-sort="number">#${arrow('number')}</th>
      <th data-sort="last">Player ${arrow('last')}</th>
      <th data-sort="posDisplay">Pos ${arrow('posDisplay')}</th>
      <th data-sort="gradClass">Class ${arrow('gradClass')}</th>
      <th data-sort="bt">B/T</th><th>Ht / Wt</th>
      <th data-sort="phone">Phone</th><th>Email</th><th></th>
    </tr></thead><tbody>${
    list.map(p=>`<tr data-id="${p.id}">
      <td class="date" contenteditable data-tf="number" data-id="${p.id}">${escAttr(p.number||'')}</td>
      <td class="nm"><span contenteditable data-tf="first" data-id="${p.id}">${escAttr(p.first)}</span>
          <span contenteditable data-tf="last" data-id="${p.id}">${escAttr(p.last)}</span>
          <div class="dim" style="font-weight:400;font-size:11.5px" contenteditable data-tf="school" data-id="${p.id}" data-ph="school">${escAttr(p.school||'')}</div></td>
      <td contenteditable data-tf="posDisplay" data-id="${p.id}">${escAttr(p.posDisplay||'')}</td>
      <td class="dim" contenteditable data-tf="gradClass" data-id="${p.id}">${escAttr(p.gradClass||'')}</td>
      <td class="dim" contenteditable data-tf="bt" data-id="${p.id}">${escAttr(p.bt||'')}</td>
      <td class="dim"><span contenteditable data-tf="height" data-id="${p.id}">${escAttr(p.height||'')}</span> /
          <span contenteditable data-tf="weight" data-id="${p.id}">${escAttr(p.weight||'')}</span></td>
      <td class="dim" contenteditable data-tf="phone" data-id="${p.id}">${escAttr(p.phone||'')}</td>
      <td class="dim" contenteditable data-tf="email" data-id="${p.id}">${escAttr(p.email||'')}</td>
      <td><button class="rc-no" style="padding:4px 9px;font-size:11px" data-tmdel="${p.id}">Remove</button></td>
    </tr>`).join('')}</tbody></table>`;
  body.querySelectorAll('th[data-sort]').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.dataset.sort;
      tmSort = { key, dir: tmSort.key===key ? -tmSort.dir : 1 };
      renderTeam();
    });
  });
  // edit in place: commit on blur or Enter
  body.querySelectorAll('[data-tf]').forEach(cell=>{
    cell.addEventListener('keydown', ev=>{
      if(ev.key === 'Enter'){ ev.preventDefault(); cell.blur(); }
      if(ev.key === 'Escape'){ renderTeam(); }
    });
    cell.addEventListener('blur', async ()=>{
      const p = teamRoster.find(x=>x.id === cell.dataset.id);
      if(!p) return;
      const val = cell.textContent.trim();
      if(String(p[cell.dataset.tf]||'') === val) return;
      p[cell.dataset.tf] = val;
      const ok = await saveTeam();
      document.getElementById('tmCount').textContent =
        teamRoster.length ? `${teamRoster.length} on roster${ok?'':' · NOT SAVED'}` : '';
      if(!ok) alertBar('Edit not saved — storage is blocked here.');
    });
  });
  body.querySelectorAll('[data-tmdel]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(btn.dataset.armed !== '1'){
        btn.dataset.armed = '1'; btn.textContent = 'Confirm?';
        btn.style.color = 'var(--danger)'; btn.style.borderColor = 'rgba(193,84,59,0.5)';
        setTimeout(()=>{ if(btn.isConnected && btn.dataset.armed==='1'){ btn.dataset.armed='0'; btn.textContent='Remove'; btn.style.color=''; btn.style.borderColor=''; } }, 4000);
        return;
      }
      teamRoster = teamRoster.filter(p=>p.id !== btn.dataset.tmdel);
      const ok = await saveTeam();
      renderTeam();
      if(!ok) alertBar('Removed on screen, but could not be saved.');
    });
  });
}
['tmSearch','tmClass'].forEach(id=>{
  document.getElementById(id).addEventListener(id==='tmSearch'?'input':'change', renderTeam);
});
document.getElementById('tmExport').addEventListener('click', ()=>{
  const cols = ['Number','First Name','Last Name','Position','Grad Class','B/T','Height','Weight','School','Phone','Email','GPA'];
  const rows = [cols.map(csvCell).join(',')];
  teamRoster.forEach(p=> rows.push([p.number,p.first,p.last,p.posDisplay,p.gradClass,p.bt,p.height,p.weight,p.school,p.phone,p.email,p.gpa].map(csvCell).join(',')));
  downloadText('team-roster.csv', rows.join('\r\n'), 'text/csv;charset=utf-8;');
});
document.getElementById('tmImport').addEventListener('click', ()=>{
  pickFile('.csv,text/csv', async (text)=>{
    let rows;
    try{ rows = parseCSV(text); }catch(e){ alertBar('Could not read that file as CSV.'); return; }
    if(rows.length < 2){ alertBar('That file has no rows under the header.'); return; }
    const headers = rows[0].map(normHeader).map(h=> TM_HEADER_MAP[h] || null);
    let added = 0, skipped = 0;
    for(let r = 1; r < rows.length; r++){
      const rec = {};
      rows[r].forEach((cell, c)=>{ const k = headers[c]; if(k) rec[k] = String(cell||'').trim(); });
      if(!rec.first || !rec.last){ skipped++; continue; }
      teamRoster.push(Object.assign({ id:'tm-'+Date.now()+'-'+(added), number:'', posDisplay:'', gradClass:'',
        bt:'', height:'', weight:'', school:'', phone:'', email:'', gpa:'' }, rec));
      added++;
    }
    const ok = await saveTeam();
    renderTeam();
    alertBar(`Added ${added} to the roster${skipped?`, skipped ${skipped}`:''}.` + (ok?'':' Could not save.'), ok?'ok':undefined);
  });
});
document.getElementById('tmAdd').addEventListener('click', ()=>{
  const p = { id:'tm-'+Date.now(), number:'', first:'New', last:'Player', posDisplay:'', gradClass:'',
              bt:'', height:'', weight:'', school:'', phone:'', email:'', gpa:'' };
  teamRoster.push(p);
  saveTeam().then(()=>{
    renderTeam();
    alertBar('Blank row added — click any cell to type into it.', 'ok');
    const first = document.querySelector(`[data-tf="first"][data-id="${p.id}"]`);
    if(first){ first.focus(); document.execCommand && document.execCommand('selectAll', false, null); }
  });
});
/* ---- NCAA recruiting calendar (Division I baseball, 2026-27) --------------
   Source: NCAA 2026-27 Division I Baseball Recruiting Calendar (updated 7/30/2026).
   Overlapping entries in the published grid are flattened here so every date
   resolves to exactly one status.
--------------------------------------------------------------------------- */
const CAL_PERIODS = [
  { start:'2026-08-01', end:'2026-08-16', type:'Contact Period',      cls:'contact' },
  { start:'2026-08-17', end:'2026-09-10', type:'Quiet Period',        cls:'quiet' },
  { start:'2026-09-11', end:'2026-10-11', type:'Contact Period',      cls:'contact' },
  { start:'2026-10-12', end:'2026-11-08', type:'Dead Period',         cls:'dead' },
  { start:'2026-11-09', end:'2026-11-12', type:'Quiet Period',        cls:'quiet',    note:'Window inside the long dead period.' },
  { start:'2026-11-13', end:'2026-11-23', type:'Dead Period',         cls:'dead' },
  { start:'2026-11-24', end:'2026-11-29', type:'Recruiting Shutdown', cls:'shutdown', note:'Thanksgiving. No recruiting activity at all.' },
  { start:'2026-11-30', end:'2026-12-21', type:'Dead Period',         cls:'dead' },
  { start:'2026-12-22', end:'2026-12-27', type:'Recruiting Shutdown', cls:'shutdown', note:'Winter holidays. No recruiting activity at all.' },
  { start:'2026-12-28', end:'2027-01-06', type:'Dead Period',         cls:'dead' },
  { start:'2027-01-07', end:'2027-01-10', type:'Quiet Period',        cls:'quiet',    note:'Window inside the long dead period.' },
  { start:'2027-01-11', end:'2027-02-28', type:'Dead Period',         cls:'dead' },
  { start:'2027-03-01', end:'2027-05-30', type:'Contact Period',      cls:'contact' },
  { start:'2027-05-31', end:'2027-06-07', type:'Dead Period',         cls:'dead' },
  { start:'2027-06-08', end:'2027-06-18', type:'Contact Period',      cls:'contact' },
  { start:'2027-06-19', end:'2027-06-21', type:'Dead Period',         cls:'dead' },
  { start:'2027-06-22', end:'2027-07-02', type:'Contact Period',      cls:'contact' },
  { start:'2027-07-03', end:'2027-07-05', type:'Dead Period',         cls:'dead' },
  { start:'2027-07-06', end:'2027-07-31', type:'Contact Period',      cls:'contact' },
];
const CAL_MEANING = {
  'Contact Period':      'Off-campus contact and evaluation are both allowed.',
  'Quiet Period':        'In-person contact only on your own campus. No off-campus evaluation.',
  'Dead Period':         'No in-person contact at all, on or off campus. Calls and written contact still allowed.',
  'Recruiting Shutdown': 'No recruiting activity of any kind, including calls and messages.',
};
function currentCalPeriod(){
  const t = todayISO();
  return CAL_PERIODS.find(p=> t >= p.start && t <= p.end) || null;
}
function longDate(iso){
  const [y,m,d] = iso.split('-').map(Number);
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MON[m-1]} ${d}, ${y}`;
}
function daysBetween(a, b){
  return Math.round((Date.parse(b+'T00:00:00') - Date.parse(a+'T00:00:00')) / 86400000);
}
function renderCalendar(){
  const t = todayISO();
  const now = currentCalPeriod();
  const next = CAL_PERIODS.find(p=> p.start > t);
  let html = '';
  if(now){
    const left = daysBetween(t, now.end);
    html += `<div class="cal-banner">
      <div class="cb-label">Today — ${longDate(t)}</div>
      <div class="cb-now" style="color:var(--${now.cls==='contact'?'turf':now.cls==='quiet'?'gold':'danger'})">${now.type}</div>
      <div class="cb-sub">${CAL_MEANING[now.type]}
        Runs through ${longDate(now.end)} — ${left === 0 ? 'ends today' : left + ' day' + (left===1?'':'s') + ' left'}.
        ${next ? `Next: ${next.type} from ${longDate(next.start)}.` : ''}</div>
    </div>`;
  }
  html += `<div class="cal-legend">
    <span><i class="cal-key k-contact"></i>Contact</span>
    <span><i class="cal-key k-quiet"></i>Quiet</span>
    <span><i class="cal-key k-dead"></i>Dead</span>
    <span><i class="cal-key k-shutdown"></i>Shutdown</span>
  </div>`;
  html += CAL_PERIODS.map(p=>{
    const isNow = t >= p.start && t <= p.end;
    const past = p.end < t;
    return `<div class="cal-row ${p.cls}${isNow?' now':''}" style="${past?'opacity:.5':''}">
      <div class="cal-dates">${longDate(p.start)} – ${longDate(p.end)}</div>
      <div class="cal-type">${p.type}${isNow?'<span class="now-badge">now</span>':''}</div>
      <div class="cal-note">${p.note ? p.note + ' ' : ''}${CAL_MEANING[p.type]}</div>
    </div>`;
  }).join('');
  html += `<p class="src-note">Division I baseball, 2026-27, from the
    <a href="https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2026-27/2026-27D1Rec_MBARecruitingCalendar.pdf"
       target="_blank" rel="noopener">NCAA published calendar</a> (updated July 30, 2026).
    Overlapping windows in the official grid are flattened so each date shows one status.
    Always confirm against the NCAA document before acting — and tell me if you need a different division.</p>`;
  document.getElementById('calBody').innerHTML = html;
}
/* ---- boot ------------------------------------------------------------------
   Waits for DOMContentLoaded before touching anything from another file. In the
   single-file build every function exists by the time this runs; split across
   separate <script> tags it does not, and the hub would boot before the later
   modules had loaded. DOMContentLoaded fires only after every classic script in
   the body has executed, which is exactly the guarantee needed — and unlike
   'load' it does not wait on fonts or images.
--------------------------------------------------------------------------- */
(async function bootHub(){
  if(document.readyState === 'loading'){
    await new Promise(r=> document.addEventListener('DOMContentLoaded', r, { once:true }));
  }
  await APP_READY;          // board data + storage mode must settle first
  await loadEvents();
  await addNewSeedEvents();
  await backfillEventLinks();
  await loadAttendance();
  await loadMarkRules();
  await loadTeam();
  await loadOrgs();
  await loadCoaches();
  await loadTasks();
  await loadCalEntries();
  await loadGames();
  await loadViewPrefs();
  renderHome();
  const hash = getRoute();
  if(hash && SECTIONS.some(s=>s.id===hash)) goTo(hash);
})();
