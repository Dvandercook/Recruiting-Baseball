/* ==========================================================================
   Event detail — the schedule, the rosters, and who of yours is in each game.

   Recruiting Coordinator ingests tournament schedules themselves; that is the
   product they sell. We can't crawl it, so the schedule is imported: paste a
   CSV or a block of "Team A vs Team B" lines and it becomes a real schedule.
   Once it is in, the number that matters is computed locally — how many of YOUR
   ranked players are in each game — which is the whole reason to look at a
   schedule in the first place.
   ========================================================================== */
const GAMES_KEY = 'event-games';
let eventGames = [];
let edEventId = null;
let edTab = 'schedule';
let edDay = '';

async function loadGames(){
  try{ const raw = await Store.get(GAMES_KEY); eventGames = raw ? JSON.parse(raw) : []; }
  catch(e){ eventGames = []; }
  if(!Array.isArray(eventGames)) eventGames = [];
}
async function saveGames(){ return Store.set(GAMES_KEY, JSON.stringify(eventGames)); }
function gamesOf(eventId){ return eventGames.filter(g=> g.eventId === eventId); }

/* Which of your players belong to a team name at this event. Attendance carries
   the club a kid is playing for per appearance, which is the reliable link; the
   player's own Team field is the fallback. */
function playersOnTeam(eventId, teamName){
  const k = orgKey(teamName);
  if(!k) return [];
  const ids = new Set();
  attendance.forEach(a=>{
    if(a.eventId === eventId && orgKey(a.team) === k) ids.add(a.playerId);
  });
  allPlayers().forEach(p=>{ if(orgKey(getField(p,'team')) === k) ids.add(p.id); });
  return [...ids].map(id=> playerById(id)).filter(Boolean);
}
function gamePlayers(g){
  const seen = new Set(), out = [];
  [g.home, g.away].forEach(t=> playersOnTeam(g.eventId, t).forEach(p=>{
    if(!seen.has(p.id)){ seen.add(p.id); out.push(p); }
  }));
  return out.sort((a,b)=> (TIER_SORT_INDEX[getTier(a)] ?? 9) - (TIER_SORT_INDEX[getTier(b)] ?? 9));
}
function rankedCount(g){ return gamePlayers(g).filter(isRated).length; }

/* ---- teams at an event, from the schedule and from your own rosters ---- */
function eventTeams(eventId){
  const map = new Map();
  gamesOf(eventId).forEach(g=>{
    [g.home, g.away].forEach(t=>{ if(t && !map.has(orgKey(t))) map.set(orgKey(t), t); });
  });
  attendance.filter(a=> a.eventId === eventId && a.team).forEach(a=>{
    if(!map.has(orgKey(a.team))) map.set(orgKey(a.team), a.team);
  });
  return [...map.values()].sort((a,b)=> a.localeCompare(b));
}

/* ==========================================================================
   Rendering
   ========================================================================== */
function goEventDetail(eventId){
  edEventId = eventId;
  edTab = 'schedule';
  edDay = '';
  document.querySelectorAll('.view').forEach(v=> v.classList.remove('active'));
  document.getElementById('view-edetail').classList.add('active');
  setRoute('event');
  renderEventDetail();
}
function renderEventDetail(){
  const ev = eventById(edEventId);
  if(!ev){ goTo('fall'); return; }
  const games = gamesOf(edEventId);
  const going = attendeesOf(edEventId);
  document.getElementById('edName').textContent = ev.name;
  document.getElementById('edSub').textContent =
    [fmtRange(ev), ev.location, ev.division,
     games.length ? `${games.length} game${games.length===1?'':'s'} · ${eventTeams(edEventId).length} teams` : 'no schedule imported',
     `${going.length} of yours going`].filter(Boolean).join('  ·  ');

  document.getElementById('edTabs').querySelectorAll('button')
    .forEach(b=> b.classList.toggle('active', b.dataset.edtab === edTab));
  if(edTab === 'schedule') renderEdSchedule(games);
  else if(edTab === 'rosters') renderEdRosters();
  else renderEdPlayers();
}

function renderEdSchedule(games){
  const host = document.getElementById('edBody');
  if(!games.length){
    host.innerHTML = `<div class="sec-empty"><h4>No schedule yet</h4>
      <p>Paste the tournament schedule in and every game gets a count of how many of
         your guys are in it. Import schedule, top right.</p></div>`;
    return;
  }
  const days = [...new Set(games.map(g=> g.date).filter(Boolean))].sort();
  const onlyAttend = document.getElementById('edAttendOnly').checked;
  const onlyRanked = document.getElementById('edRankedOnly').checked;
  let list = games.filter(g=>{
    if(edDay && g.date !== edDay) return false;
    if(onlyAttend && !g.attend) return false;
    if(onlyRanked && !rankedCount(g)) return false;
    return true;
  });
  list.sort((a,b)=> String(a.date).localeCompare(String(b.date)) || timeMin(a.time) - timeMin(b.time));

  document.getElementById('edDays').innerHTML =
    `<button class="ed-day ${edDay?'':'on'}" data-edday="">All</button>` +
    days.map(d=> `<button class="ed-day ${edDay===d?'on':''}" data-edday="${d}">${dayName(d)} ${fmtDate(d)}</button>`).join('');
  document.getElementById('edDays').querySelectorAll('[data-edday]').forEach(b=>
    b.addEventListener('click', ()=>{ edDay = b.dataset.edday; renderEventDetail(); }));

  host.className = 'ed-games';
  host.innerHTML = list.map(g=>{
    const pl = gamePlayers(g);
    const ranked = pl.filter(isRated);
    return `<div class="ed-game ${g.attend?'going':''}">
      <div class="eg-top">
        <span class="eg-time">${escAttr([g.date ? dayName(g.date) : '', g.time].filter(Boolean).join(' · ') || '—')}</span>
        ${g.venue ? `<span class="eg-venue">${escAttr(g.venue)}</span>` : ''}
        ${g.division ? `<span class="eg-div">${escAttr(g.division)}</span>` : ''}
        ${ranked.length ? `<button class="eg-ranked" data-egwho="${escAttr(g.id)}">${ranked.length} ranked</button>` : ''}
      </div>
      <div class="eg-teams">
        <span class="eg-team">${escAttr(g.home || '—')}${teamCountChip(g.eventId, g.home)}</span>
        <span class="eg-vs">vs</span>
        <span class="eg-team">${escAttr(g.away || '—')}${teamCountChip(g.eventId, g.away)}</span>
      </div>
      ${pl.length ? `<div class="eg-players">${pl.slice(0,8).map(p=>
        `<span class="eg-p tier-${TIER_DEFS[getTier(p)].cls}">${escAttr(getField(p,'last'))}</span>`).join('')}
        ${pl.length > 8 ? `<span class="eg-more">+${pl.length-8}</span>` : ''}</div>` : ''}
      <div class="eg-act">
        <button class="eg-attend ${g.attend?'on':''}" data-egatt="${escAttr(g.id)}">
          ${g.attend ? '✓ Going' : 'Attend'}</button>
        <input class="eg-note" data-egnote="${escAttr(g.id)}" value="${escAttr(g.notes||'')}"
               placeholder="note on this game…">
        <button class="og-x" data-egdel="${escAttr(g.id)}" title="Remove game">✕</button>
      </div>
    </div>`;
  }).join('') || '<div class="sec-empty"><h4>Nothing matches</h4><p>Loosen the filters above.</p></div>';

  host.querySelectorAll('[data-egatt]').forEach(b=> b.addEventListener('click', async ()=>{
    const g = eventGames.find(x=> x.id === b.dataset.egatt);
    g.attend = !g.attend;
    flashSaved(await saveGames());
    renderEventDetail();
  }));
  host.querySelectorAll('[data-egnote]').forEach(inp=>{
    let t;
    inp.addEventListener('input', ()=>{
      clearTimeout(t);
      t = setTimeout(async ()=>{
        const g = eventGames.find(x=> x.id === inp.dataset.egnote);
        g.notes = inp.value;
        flashSaved(await saveGames());
      }, 500);
    });
  });
  host.querySelectorAll('[data-egdel]').forEach(b=> b.addEventListener('click', async ()=>{
    if(b.dataset.arm !== '1'){
      b.dataset.arm = '1'; b.textContent = 'remove?';
      setTimeout(()=>{ if(b.isConnected && b.dataset.arm==='1'){ b.dataset.arm='0'; b.textContent='✕'; } }, 4000);
      return;
    }
    eventGames = eventGames.filter(x=> x.id !== b.dataset.egdel);
    flashSaved(await saveGames());
    renderEventDetail();
  }));
  host.querySelectorAll('[data-egwho]').forEach(b=> b.addEventListener('click', ()=>{
    const g = eventGames.find(x=> x.id === b.dataset.egwho);
    const names = gamePlayers(g).map(p=>
      `${getField(p,'first')} ${getField(p,'last')} (${TIER_DEFS[getTier(p)].short})`).join(' · ');
    alertBar(names || 'Nobody from your board.', 'ok');
  }));
}
// "10:30 AM" and "8:00 AM" only sort correctly once they are numbers.
function timeMin(t){
  const m = String(t||'').match(/^\s*(\d{1,2}):(\d{2})\s*([AaPp])?/);
  if(!m) return 99999;
  let h = +m[1];
  const ap = (m[3] || '').toLowerCase();
  if(ap === 'p' && h !== 12) h += 12;
  if(ap === 'a' && h === 12) h = 0;
  return h * 60 + (+m[2]);
}
function teamCountChip(eventId, team){
  const n = playersOnTeam(eventId, team).length;
  return n ? `<span class="eg-tc">${n}</span>` : '';
}

function renderEdRosters(){
  const host = document.getElementById('edBody');
  document.getElementById('edDays').innerHTML = '';
  const teams = eventTeams(edEventId);
  host.className = 'ed-rosters';
  if(!teams.length){
    host.innerHTML = `<div class="sec-empty"><h4>No teams yet</h4>
      <p>Import a schedule, or add players to this event with the travel team they
         are playing for.</p></div>`;
    return;
  }
  host.innerHTML = teams.map(t=>{
    const pl = playersOnTeam(edEventId, t);
    return `<div class="ed-team">
      <div class="et-head">
        <span class="et-nm">${escAttr(t)}</span>
        <span class="et-n">${pl.length ? pl.length + ' of yours' : 'nobody yet'}</span>
        <button class="et-add" data-etadd="${escAttr(t)}">Paste roster</button>
      </div>
      ${pl.length ? `<div class="et-players">${pl.map(p=>
        `<button class="et-p tier-${TIER_DEFS[getTier(p)].cls}" data-etp="${escAttr(p.id)}">
          ${escAttr(getField(p,'first')+' '+getField(p,'last'))}
          <span class="et-pos">${escAttr(getField(p,'posDisplay'))}</span>
        </button>`).join('')}</div>` : ''}
    </div>`;
  }).join('');
  host.querySelectorAll('[data-etp]').forEach(b=>
    b.addEventListener('click', ()=> openDrawer(b.dataset.etp)));
  host.querySelectorAll('[data-etadd]').forEach(b=>
    b.addEventListener('click', ()=>{
      document.getElementById('ntTeam').value = b.dataset.etadd;
      goNotes(edEventId);
      document.getElementById('ntPaste').click();
    }));
}

function renderEdPlayers(){
  const host = document.getElementById('edBody');
  document.getElementById('edDays').innerHTML = '';
  const rows = attendeesOf(edEventId).map(a=> ({ a, p: playerById(a.playerId) })).filter(x=> x.p)
    .sort((x,y)=> (TIER_SORT_INDEX[getTier(x.p)] ?? 9) - (TIER_SORT_INDEX[getTier(y.p)] ?? 9)
               || String(getField(x.p,'last')).localeCompare(String(getField(y.p,'last'))));
  host.className = 'ed-players';
  if(!rows.length){
    host.innerHTML = `<div class="sec-empty"><h4>Nobody on this roster</h4>
      <p>Add players from their profile, or from Event Notes.</p></div>`;
    return;
  }
  host.innerHTML = rows.map(({a,p})=>{
    const games = gamesOf(edEventId).filter(g=>
      orgKey(g.home) === orgKey(a.team) || orgKey(g.away) === orgKey(a.team));
    return `<button class="ed-pl" data-edp="${escAttr(p.id)}">
      <span class="ep-tier tier-${TIER_DEFS[getTier(p)].cls}">${TIER_DEFS[getTier(p)].short}</span>
      <span class="ep-nm">${escAttr(getField(p,'first')+' '+getField(p,'last'))}${marksHtml(p)}</span>
      <span class="ep-meta">${escAttr([getField(p,'posDisplay'), getField(p,'state'), a.team].filter(Boolean).join(' · '))}</span>
      ${games.length ? `<span class="ep-g">${games.length} game${games.length===1?'':'s'}</span>` : ''}
    </button>`;
  }).join('');
  host.querySelectorAll('[data-edp]').forEach(b=>
    b.addEventListener('click', ()=> openDrawer(b.dataset.edp)));
}

/* ==========================================================================
   Importing a schedule
   ========================================================================== */
const GAME_HEADERS = {
  date:'date', day:'date', gamedate:'date',
  time:'time', start:'time', starttime:'time', firstpitch:'time',
  venue:'venue', field:'venue', location:'venue', site:'venue', complex:'venue',
  division:'division', div:'division', age:'division', agegroup:'division',
  home:'home', hometeam:'home', team1:'home',
  away:'away', awayteam:'away', team2:'away', visitor:'away', visitingteam:'away',
};
// Two shapes: a delimited table with headers, or plain "A vs B" lines.
function parseSchedule(text, fallbackDate){
  const raw = String(text||'').replace(/\r/g,'').split('\n').map(l=> l.trim()).filter(Boolean);
  if(!raw.length) return [];
  const delim = raw[0].includes('\t') ? '\t' : (raw[0].split(',').length > 2 ? ',' : '');
  if(delim){
    const cells = l=> delim === ',' ? (parseCSV(l)[0] || []) : l.split('\t');
    const head = cells(raw[0]).map(h=> GAME_HEADERS[normHeader(h)] || null);
    if(head.filter(Boolean).length >= 2){
      return raw.slice(1).map(line=>{
        const c = cells(line), rec = {};
        head.forEach((k,i)=>{ if(k) rec[k] = String(c[i]||'').trim(); });
        return rec;
      }).filter(r=> r.home || r.away);
    }
  }
  // free-form lines
  return raw.map(line=>{
    const rec = { date:'', time:'', venue:'', division:'', home:'', away:'' };
    let s = line;
    const d = s.match(/\b(\d{4}-\d{2}-\d{2})\b/) || s.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
    if(d){ rec.date = normGameDate(d[1]); s = s.replace(d[0], ' '); }
    const t = s.match(/\b(\d{1,2}:\d{2}\s*(?:[AaPp][Mm])?)\b/);
    if(t){ rec.time = t[1].toUpperCase().replace(/\s+/,' '); s = s.replace(t[0], ' '); }
    const dv = s.match(/\b(\d{2}U)\b/i);
    if(dv){ rec.division = dv[1].toUpperCase(); s = s.replace(dv[0], ' '); }
    const vn = s.match(/\b((?:Field|Diamond|Fld|Court|Turf)\s*#?\s*(?:\d+|[A-Z]\b))/i);
    if(vn){ rec.venue = vn[1].replace(/\s*#?\s*/, ' ').trim(); s = s.replace(vn[0], ' '); }
    const parts = s.split(/\s+(?:vs\.?|v\.?|@|versus)\s+/i);
    if(parts.length >= 2){
      rec.home = cleanTeam(parts[0]);
      rec.away = cleanTeam(parts[1]);
    }else{
      rec.home = cleanTeam(s);
    }
    return rec;
  }).filter(r=> r.home);
}
function cleanTeam(s){
  return String(s||'').replace(/[|,;]+/g,' ').replace(/\s{2,}/g,' ')
    .replace(/^[-–—\s]+|[-–—\s]+$/g,'').trim();
}
function normGameDate(v){
  v = String(v||'').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(m){
    let y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  }
  return '';
}
let gimRows = [];
function renderGameImport(){
  const box = document.getElementById('gimPreview');
  if(!gimRows.length){ box.innerHTML = ''; document.getElementById('gimApply').disabled = true; return; }
  document.getElementById('gimApply').disabled = false;
  const withRanked = gimRows.filter(r=>
    playersOnTeam(edEventId, r.home).length + playersOnTeam(edEventId, r.away).length).length;
  box.innerHTML = `<p class="imp-hint" style="margin:0 0 10px">
      ${gimRows.length} game${gimRows.length===1?'':'s'} read${withRanked ? ` · ${withRanked} with someone from your board` : ''}.
    </p>` + gimRows.slice(0, 12).map(r=>
    `<div class="gim-row"><span>${escAttr([r.date, r.time, r.division].filter(Boolean).join(' · ') || '—')}</span>
      <span>${escAttr(r.home)} <em>vs</em> ${escAttr(r.away || '—')}</span>
      <span class="gim-v">${escAttr(r.venue || '')}</span></div>`).join('')
    + (gimRows.length > 12 ? `<p class="imp-hint">…and ${gimRows.length - 12} more.</p>` : '');
}
document.getElementById('edImport').addEventListener('click', ()=>{
  const ev = eventById(edEventId);
  gimRows = [];
  document.getElementById('gimText').value = '';
  document.getElementById('gimDate').value = ev ? ev.start : todayISO();
  renderGameImport();
  document.getElementById('scrim').classList.add('show');
  document.getElementById('gameImportModal').classList.add('show');
});
document.getElementById('gimRead').addEventListener('click', ()=>{
  gimRows = parseSchedule(document.getElementById('gimText').value,
                          document.getElementById('gimDate').value);
  const fb = document.getElementById('gimDate').value;
  gimRows.forEach(r=>{ if(!r.date) r.date = fb; r.date = normGameDate(r.date) || fb; });
  renderGameImport();
});
document.getElementById('gimApply').addEventListener('click', async ()=>{
  const base = Date.now();
  gimRows.forEach((r,i)=> eventGames.push({
    id: 'g-' + base + '-' + i, eventId: edEventId,
    date: r.date || '', time: r.time || '', venue: r.venue || '',
    division: r.division || '', home: r.home || '', away: r.away || '',
    attend: false, notes: '',
  }));
  const ok = await saveGames();
  const n = gimRows.length;
  gimRows = [];
  closeDrawer();
  renderEventDetail();
  alertBar(`${n} game${n===1?'':'s'} added to the schedule.`, ok ? 'ok' : undefined);
});
document.getElementById('gimClose').addEventListener('click', closeDrawer);
document.getElementById('gimCancel').addEventListener('click', closeDrawer);

/* ---- day sheet: the games you said you'd be at, and who to watch ---- */
function buildDaySheet(){
  const ev = eventById(edEventId);
  const list = gamesOf(edEventId).filter(g=> g.attend && (!edDay || g.date === edDay))
    .sort((a,b)=> String(a.date).localeCompare(String(b.date)) || timeMin(a.time) - timeMin(b.time));
  if(!list.length){ alertBar('Mark the games you are going to first.'); return; }
  const book = document.getElementById('printBook');
  book.innerHTML = `
    <div class="bk-head">
      <h1>${escAttr(ev.name)} — day sheet</h1>
      <div class="bk-sub">${escAttr(fmtRange(ev))}${ev.location?' · '+escAttr(ev.location):''}
        &nbsp;|&nbsp; ${list.length} game${list.length===1?'':'s'} &nbsp;|&nbsp; printed ${escAttr(fmtStamp(new Date().toISOString()))}</div>
    </div>
    ${list.map(g=>{
      const pl = gamePlayers(g);
      return `<div class="bk-p">
        <div><span class="bk-t">${escAttr([g.date?dayName(g.date):'', g.time].filter(Boolean).join(' '))}</span>
          <span class="bk-nm">${escAttr(g.home)} vs ${escAttr(g.away)}</span></div>
        <div class="bk-meta">${escAttr([g.venue, g.division].filter(Boolean).join('  ·  ') || '')}</div>
        ${pl.length ? `<div class="bk-mx">${escAttr(pl.map(p=>
          `${TIER_DEFS[getTier(p)].short} ${getField(p,'first')} ${getField(p,'last')}`
          + (getField(p,'posDisplay') ? ' (' + getField(p,'posDisplay') + ')' : '')).join('   ·   '))}</div>` : ''}
        ${g.notes ? `<div class="bk-note">${escAttr(g.notes)}</div>` : '<div class="bk-blank"></div>'}
      </div>`;
    }).join('')}`;
  book.classList.add('show');
  document.getElementById('bkBar').classList.add('show');
  document.getElementById('bkTitle').textContent = 'Day sheet — ' + ev.name;
  tryPrint();
}

/* ---- whiteboard: a shared scratch pad that lives on the event ---- */
function openWhiteboard(){
  const ev = eventById(edEventId);
  document.getElementById('wbTitle').textContent = 'Whiteboard — ' + ev.name;
  document.getElementById('wbText').value = ev.board || '';
  document.getElementById('scrim').classList.add('show');
  document.getElementById('whiteboardModal').classList.add('show');
}
let wbTimer;
document.getElementById('wbText').addEventListener('input', ()=>{
  clearTimeout(wbTimer);
  wbTimer = setTimeout(async ()=>{
    const ev = eventById(edEventId);
    if(!ev) return;
    ev.board = document.getElementById('wbText').value;
    const ok = await saveEvents();
    document.getElementById('wbSaved').textContent = ok ? 'Saved' : 'NOT SAVED';
  }, 600);
});
document.getElementById('wbClose').addEventListener('click', closeDrawer);
document.getElementById('wbDone').addEventListener('click', closeDrawer);

document.getElementById('edTabs').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return;
  edTab = b.dataset.edtab;
  renderEventDetail();
});
document.getElementById('edBack').addEventListener('click', ()=> goTo(
  (eventById(edEventId) || {}).season || 'fall'));
document.getElementById('edBook').addEventListener('click', ()=> buildEventBook(edEventId, {}));
document.getElementById('edDaySheet').addEventListener('click', buildDaySheet);
document.getElementById('edWhiteboard').addEventListener('click', openWhiteboard);
document.getElementById('edNotes').addEventListener('click', ()=> goNotes(edEventId));
['edAttendOnly','edRankedOnly'].forEach(id=>
  document.getElementById(id).addEventListener('change', renderEventDetail));
