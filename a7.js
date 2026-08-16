/* ==========================================================================
   Live event notes — stand at a field, work down the roster, and what you
   write lands on each player's Scouting Notes stamped with the event.
   ========================================================================== */
let ntEventId = null;
let ntOpenPlayer = null;

function ntPlayers(){
  return attendeesOf(ntEventId)
    .map(a => ({ a, p: playerById(a.playerId) }))
    .filter(x => x.p);
}
function goNotes(eventId){
  ntEventId = eventId || null;
  ntOpenPlayer = null;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-notes').classList.add('active');
  setRoute('notes');
  renderNotes();
}
// Newest note first, each headed with the date and event.
function noteStamp(ev){
  const d = new Date();
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${ev ? ev.name : 'Event'}`;
}
function metricLine(m){
  const bits = [];
  if(m.velo) bits.push('Velo ' + m.velo);
  if(m.pop)  bits.push('Pop ' + m.pop);
  if(m.sixty)bits.push('60 ' + m.sixty);
  if(m.ev)   bits.push('EV ' + m.ev);
  return bits.length ? '[' + bits.join(' · ') + ']' : '';
}
function renderNotes(){
  const ev = ntEventId ? eventById(ntEventId) : null;
  const pick = document.getElementById('ntPick');
  const wrap = document.getElementById('ntRosterWrap');
  document.getElementById('ntBack').style.display = ev ? 'inline-flex' : 'none';
  document.getElementById('ntPaste').style.display = ev ? 'inline-flex' : 'none';
  document.getElementById('ntExport').style.display = ev ? 'inline-flex' : 'none';
  if(!ev){
    // no event chosen yet — offer starred and upcoming ones
    document.getElementById('ntTitle').textContent = 'Event Notes';
    document.getElementById('ntSub').textContent = 'Pick the event you are at';
    wrap.style.display = 'none';
    pick.style.display = 'grid';
    const today = todayISO();
    const list = events.slice().sort((a,b)=>{
      const aUp = (a.end||a.start) >= today, bUp = (b.end||b.start) >= today;
      if(aUp !== bUp) return aUp ? -1 : 1;
      if(!!b.star !== !!a.star) return (b.star?1:0)-(a.star?1:0);
      return String(a.start).localeCompare(String(b.start));
    }).slice(0, 40);
    pick.innerHTML = list.map(e=>{
      const n = attendeesOf(e.id).length;
      return `<button data-ntev="${escAttr(e.id)}">
        <div class="n">${e.star?'★ ':''}${escAttr(e.name)}</div>
        <div class="d">${escAttr(fmtRange(e))}${e.location?' · '+escAttr(e.location):''}${n?' · '+n+' on roster':''}</div>
      </button>`;
    }).join('') || '<div class="nt-empty">No events yet. Add one on the events page first.</div>';
    pick.querySelectorAll('[data-ntev]').forEach(b=>{
      b.addEventListener('click', ()=> goNotes(b.dataset.ntev));
    });
    return;
  }
  document.getElementById('ntTitle').textContent = ev.name;
  document.getElementById('ntSub').textContent = [fmtRange(ev), ev.location].filter(Boolean).join('  ·  ');
  pick.style.display = 'none';
  wrap.style.display = 'block';
  document.getElementById('ntAddList').innerHTML = allPlayers()
    .map(p=>`<option value="${escAttr(getField(p,'first')+' '+getField(p,'last')+'  ·  '+(getField(p,'posDisplay')||'')+' '+(getField(p,'state')||''))}"></option>`)
    .join('');
  const q = document.getElementById('ntFilter').value.trim().toLowerCase();
  let rows = ntPlayers();
  if(q) rows = rows.filter(({p}) => `${getField(p,'first')} ${getField(p,'last')} ${getField(p,'posDisplay')} ${getField(p,'school')}`.toLowerCase().includes(q));
  rows.sort((x,y)=> (TIER_SORT_INDEX[getTier(x.p)] ?? 9) - (TIER_SORT_INDEX[getTier(y.p)] ?? 9)
                 || String(getField(x.p,'last')).localeCompare(String(getField(y.p,'last'))));
  const all = ntPlayers().length;
  const seen = ntPlayers().filter(({p}) => (getNotes(p)||'').includes(ev.name)).length;
  document.getElementById('ntCount').textContent = all ? `${rows.length} of ${all} · ${seen} with notes` : '';
  const box = document.getElementById('ntRoster');
  if(!all){
    box.innerHTML = `<div class="nt-empty">
      <h4 style="font-family:'Oswald',sans-serif;text-transform:uppercase;color:var(--chalk-dim);margin:0 0 8px">Nobody on this roster yet</h4>
      <p style="margin:0">Add players above, or <strong>Paste roster</strong> to drop in a whole team at once.</p></div>`;
    return;
  }
  box.innerHTML = rows.map(({a,p})=>{
    const t = getTier(p), td = TIER_DEFS[t] || TIER_DEFS['2'];
    const open = ntOpenPlayer === p.id;
    const prior = getNotes(p) || '';
    const hasEventNote = prior.includes(ev.name);
    return `<div class="nt-card ${open?'open':''}" data-ntp="${escAttr(p.id)}">
      <div class="nt-row">
        <div class="bb-tier tier-${td.cls}" title="${escAttr(td.label)}">${isRated(p)?td.short:'—'}</div>
        <div class="nt-main">
          <div class="nt-nm">${escAttr(getField(p,'first'))} ${escAttr(getField(p,'last'))}</div>
          <div class="nt-meta">${escAttr([getField(p,'posDisplay'), getField(p,'state'), getField(p,'school')].filter(Boolean).join(' · '))}</div>
        </div>
        ${a.team ? `<span class="nt-team">${escAttr(a.team)}</span>` : ''}
        ${hasEventNote ? '<span class="nt-seen">noted</span>' : ''}
      </div>
      ${open ? `<div class="nt-body">
        <textarea id="ntText" placeholder="What did you see? Saves to ${escAttr(getField(p,'first'))}'s scouting notes."></textarea>
        <div class="nt-metrics">
          <div class="nt-metric"><label>Velo</label><input id="ntVelo" inputmode="decimal"></div>
          <div class="nt-metric"><label>Pop</label><input id="ntPop" inputmode="decimal"></div>
          <div class="nt-metric"><label>60</label><input id="ntSixty" inputmode="decimal"></div>
          <div class="nt-metric"><label>EV</label><input id="ntEv" inputmode="decimal"></div>
        </div>
        <div class="nt-tierrow"><span class="lbl">Tier</span>
          ${TIERS.map(x=>`<button class="nt-tier ${getTier(p)===x?'on':''}" data-nttier="${x}">${TIER_DEFS[x].short}</button>`).join('')}
        </div>
        <div class="nt-save">
          <button class="btn-log" id="ntSave">Save to profile</button>
          <span class="hint" style="font-size:11px;color:var(--slate)">⌘/Ctrl + Enter</span>
          <span id="ntSaved" style="font-size:11.5px;color:var(--turf)"></span>
        </div>
        ${prior ? `<div class="nt-prev"><span class="k">Scouting notes so far</span>${escAttr(prior.slice(0,600))}${prior.length>600?'…':''}</div>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');
  box.querySelectorAll('.nt-row').forEach(row=>{
    row.addEventListener('click', ()=>{
      const id = row.closest('[data-ntp]').dataset.ntp;
      ntOpenPlayer = (ntOpenPlayer === id) ? null : id;
      renderNotes();
      if(ntOpenPlayer){
        const ta = document.getElementById('ntText');
        if(ta){ ta.focus(); ta.scrollIntoView({block:'center'}); }
      }
    });
  });
  if(ntOpenPlayer){
    const p = playerById(ntOpenPlayer);
    const saveNote = async ()=>{
      const text = document.getElementById('ntText').value.trim();
      const m = { velo:document.getElementById('ntVelo').value.trim(),
                  pop:document.getElementById('ntPop').value.trim(),
                  sixty:document.getElementById('ntSixty').value.trim(),
                  ev:document.getElementById('ntEv').value.trim() };
      const line = metricLine(m);
      if(!text && !line){ document.getElementById('ntSaved').textContent = 'Nothing to save'; return; }
      const entry = `${noteStamp(ev)}\n${[text, line].filter(Boolean).join(' ')}`;
      const prior = getNotes(p) || '';
      const ok = await setNotes(p.id, prior ? entry + '\n\n' + prior : entry);
      const map = { velo:'mFB', pop:'mPop', sixty:'m60', ev:'mEV' };
      for(const k in map){ if(m[k]) await setField(p.id, map[k], m[k]); }
      if(!isAttending(p.id, ntEventId)) await addAttendance(p.id, ntEventId, '');
      document.getElementById('ntSaved').textContent = ok ? 'Saved' : 'NOT SAVED — export before closing';
      setTimeout(()=>{ ntOpenPlayer = null; renderNotes(); }, 600);
    };
    const sv = document.getElementById('ntSave');
    if(sv) sv.addEventListener('click', saveNote);
    const ta = document.getElementById('ntText');
    if(ta) ta.addEventListener('keydown', e=>{
      if((e.metaKey||e.ctrlKey) && e.key === 'Enter'){ e.preventDefault(); saveNote(); }
    });
    document.querySelectorAll('[data-nttier]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        await setTier(p.id, btn.dataset.nttier);
        document.querySelectorAll('[data-nttier]').forEach(b=>b.classList.toggle('on', b===btn));
        if(typeof renderHs === 'function') renderHs();
      });
    });
  }
}
document.getElementById('ntBack').addEventListener('click', ()=> goNotes(null));
['ntFilter'].forEach(id=> document.getElementById(id).addEventListener('input', renderNotes));
document.getElementById('ntAddBtn').addEventListener('click', async ()=>{
  const typed = document.getElementById('ntAdd').value.trim();
  if(!typed || !ntEventId) return;
  const nm = typed.split('  ·  ')[0].trim().toLowerCase();
  const match = allPlayers().find(p=> (getField(p,'first')+' '+getField(p,'last')).toLowerCase() === nm)
             || allPlayers().find(p=> (getField(p,'first')+' '+getField(p,'last')).toLowerCase().includes(nm));
  if(!match){ alertBar('No recruit matches that name.'); return; }
  if(isAttending(match.id, ntEventId)){ alertBar('Already on this roster.'); return; }
  const team = document.getElementById('ntTeam').value.trim() || getField(match,'team');
  await addAttendance(match.id, ntEventId, team);
  document.getElementById('ntAdd').value = '';
  renderNotes();
  if(typeof renderEvents === 'function') renderEvents();
});
document.getElementById('ntBook').addEventListener('click', ()=> buildEventBook(ntEventId, {}));
document.getElementById('ntBookBlank').addEventListener('click', ()=> buildEventBook(ntEventId, {blank:true}));
// metrics typed on a note become the player's measurables too
document.getElementById('ntExport').addEventListener('click', ()=>{
  const ev = eventById(ntEventId);
  const cols = ['Player','Position','State','Travel Team','Tier','Scouting Notes'];
  const rows = [cols.map(csvCell).join(',')];
  ntPlayers().forEach(({a,p})=> rows.push([
    getField(p,'first')+' '+getField(p,'last'), getField(p,'posDisplay'), getField(p,'state'),
    a.team, getTier(p), getNotes(p)].map(csvCell).join(',')));
  downloadText(`${(ev?ev.name:'event').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-notes.csv`,
               rows.join('\r\n'), 'text/csv;charset=utf-8;');
});
/* ---- paste a roster ---- */
function normName(s){ return String(s||'').toLowerCase().replace(/[^a-z]/g,''); }
// Strips jersey numbers and anything after a comma or tab, so roster sheets paste straight in.
function parseRosterLines(text){
  return String(text||'').split('\n').map(raw=>{
    let line = raw.trim();
    if(!line) return null;
    const after = line.split(/[,\t]/);
    let name = after[0].trim();
    const team = after.slice(1).join(',').trim();
    name = name.replace(/^#?\d{1,2}\s+/, '').trim();          // leading jersey number
    name = name.replace(/\s+(RHP|LHP|C|SS|1B|2B|3B|OF|IF|UT|P)$/i, '').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    if(parts.length < 2) return null;
    return { raw: raw.trim(), name, team, key: normName(name) };
  }).filter(Boolean);
}
let pmMatched = [], pmNew = [];
function openPasteModal(){
  if(!ntEventId){ alertBar('Pick an event first.'); return; }
  document.getElementById('pmText').value = '';
  document.getElementById('pmResult').style.display = 'none';
  document.getElementById('pmError').textContent = '';
  document.getElementById('pmGo').textContent = 'Match names';
  pmMatched = []; pmNew = [];
  document.getElementById('scrim').classList.add('show');
  document.getElementById('pasteModal').classList.add('show');
  setTimeout(()=> document.getElementById('pmText').focus(), 60);
}
function renderPasteResult(){
  const box = document.getElementById('pmResult');
  box.style.display = 'block';
  box.innerHTML = `
    <div class="imp-summary">
      <div class="imp-stat good"><b>${pmMatched.length}</b>on your board</div>
      <div class="imp-stat warn"><b>${pmNew.length}</b>not found</div>
    </div>
    ${pmMatched.length ? `<div class="imp-preview">
      <div class="imp-row head"><span>Action</span><span>Player</span><span>Pos</span><span>St</span></div>
      ${pmMatched.map(m=>`<div class="imp-row">
        <span class="st ${m.already?'dup':'new'}">${m.already?'on roster':'add'}</span>
        <span>${escAttr(getField(m.p,'first')+' '+getField(m.p,'last'))}</span>
        <span class="why">${escAttr(getField(m.p,'posDisplay')||'')}</span>
        <span class="why">${escAttr(getField(m.p,'state')||'')}</span>
      </div>`).join('')}
    </div>` : ''}
    ${pmNew.length ? `<p class="imp-hint" style="margin:14px 0 6px">Not on your board — tick any you want created as new recruits:</p>
    <div class="imp-preview">${pmNew.map((n,i)=>`
      <div class="imp-row" style="grid-template-columns:34px 1fr">
        <span><input type="checkbox" data-pmnew="${i}" checked></span>
        <span>${escAttr(n.name)}${n.team?` <span class="why">· ${escAttr(n.team)}</span>`:''}</span>
      </div>`).join('')}</div>` : ''}`;
  const add = pmMatched.filter(m=>!m.already).length;
  document.getElementById('pmGo').textContent =
    (add || pmNew.length) ? `Add ${add + pmNew.length} to roster` : 'Nothing to add';
}
document.getElementById('pmGo').addEventListener('click', async ()=>{
  const btn = document.getElementById('pmGo');
  if(btn.textContent === 'Match names'){
    const lines = parseRosterLines(document.getElementById('pmText').value);
    if(!lines.length){ document.getElementById('pmError').textContent = 'No names found — one player per line.'; return; }
    const idx = new Map();
    allPlayers().forEach(p=> idx.set(normName(getField(p,'first')+' '+getField(p,'last')), p));
    pmMatched = []; pmNew = [];
    lines.forEach(l=>{
      const p = idx.get(l.key);
      if(p) pmMatched.push({ p, team:l.team, already:isAttending(p.id, ntEventId) });
      else pmNew.push(l);
    });
    document.getElementById('pmError').textContent = '';
    renderPasteResult();
    return;
  }
  // second press: commit
  let added = 0, created = 0, ok = true;
  for(const m of pmMatched){
    if(m.already) continue;
    ok = (await addAttendance(m.p.id, ntEventId, m.team || getField(m.p,'team'))) && ok;
    added++;
  }
  const checks = [...document.querySelectorAll('[data-pmnew]')].filter(c=>c.checked).map(c=>+c.dataset.pmnew);
  const stamp = Date.now();
  for(const i of checks){
    const n = pmNew[i];
    const parts = n.name.split(/\s+/);
    const first = parts.shift(), last = parts.join(' ');
    const id = `roster-${normName(n.name)}-${stamp}-${i}`;
    customPlayers.push({ id, first, last, posPrimary:'UNK', posDisplay:'', topLion:false,
      team:n.team||'', school:'', gradClass:'', bt:'', height:'', weight:'',
      address:'', city:'', state:'', zip:'', phone:'', phoneNotes:'', email:'',
      xLink:'', pgLink:'', pbrLink:'', commit:'', coach:'', gpa:'',
      originNotes: 'Added from a roster at ' + (eventById(ntEventId)||{}).name,
      isCustom:true, _defaultTier:'2' });
    overrides[id] = { tier:'2' };
    await addAttendance(id, ntEventId, n.team || '');
    created++;
  }
  if(created){ ok = (await saveCustomPlayers()) && (await saveOverrides()) && ok; }
  computeDefaults();
  closeDrawer();
  renderNotes();
  if(typeof renderEvents === 'function') renderEvents();
  if(typeof renderHs === 'function') renderHs();
  alertBar(`Roster updated — ${added} added, ${created} new recruit${created===1?'':'s'} created.` + (ok?'':' Could not save.'), ok?'ok':undefined);
});
document.getElementById('ntPaste').addEventListener('click', openPasteModal);
document.getElementById('pmClose').addEventListener('click', closeDrawer);
document.getElementById('pmCancel').addEventListener('click', closeDrawer);
