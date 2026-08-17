// Set while a drawer is open so a cloud pull can refresh the call log in place
// instead of yanking the panel out from under whoever is typing in it.
let drawerRepaint = null;
function fact(k,v,full){
  return `<div class="fact ${full?'full':''}"><span class="k">${k}</span><span class="v">${v||'—'}</span></div>`;
}
function escAttr(v){
  return String(v==null?'':v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}
function factInput(p, key, label, full, placeholder){
  const value = getField(p, key);
  return `<div class="fact ${full?'full':''}">
    <label class="k" for="fi_${key}">${label}</label>
    <input class="v-input" id="fi_${key}" data-field="${key}" value="${escAttr(value)}" ${placeholder?`placeholder="${escAttr(placeholder)}"`:''}>
  </div>`;
}
// Text field paired with an Open button that follows whatever is currently typed.
function factLink(p, key, label, placeholder){
  const value = getField(p, key);
  const url = toWebUrl(value);
  return `<div class="fact full">
    <label class="k" for="fi_${key}">${label}</label>
    <div class="link-row">
      <input class="v-input" id="fi_${key}" data-field="${key}" value="${escAttr(value)}" placeholder="${escAttr(placeholder||'')}">
      <button class="open-link" data-open="${key}" ${url ? '' : 'data-mode="find"'}
        title="${url ? 'Open in a new tab'
                     : 'Open ' + (PLAYER_FINDERS[key]||{}).name + "'s player search with the name copied"}"
        >${url ? 'Open' : 'Find'}</button>
    </div>
  </div>`;
}
/* Finding a player's profile takes two routes, because neither alone is enough.
   A site-scoped web search is instant and lands straight on the profile — it
   found 10 of 12 in testing. But PBR profiles are not all indexed (Kline
   Cummings exists at /profiles/FL/Kline-Cummings-9805147632 yet no search
   surfaces him), so the second button opens PBR's own finder, which queries
   their database directly. Their form posts rather than taking query
   parameters, so the best we can do there is put the name on the clipboard.
   Profile slugs carry an unguessable 10-digit id, so we never fabricate one. */
const PLAYER_FINDERS = {
  pbrLink: { name:'PBR', site:'prepbaseballreport.com/profiles',
             url:'https://www.prepbaseballreport.com/profile-search-results' },
  pgLink:  { name:'Perfect Game', site:'perfectgame.org',
             url:'https://www.perfectgame.org/Players/advancedsearch.aspx' },
};
function playerSearchUrl(p, key){
  return (PLAYER_FINDERS[key] || PLAYER_FINDERS.pbrLink).url;
}
function renderDrawerSub(p){
  const t0 = getTier(p);
  const td0 = TIER_DEFS[t0];
  const school = getField(p,'school'), posDisplay = getField(p,'posDisplay');
  document.getElementById('dSub').innerHTML = `
    <span class="badge turf">${posDisplay || '—'}</span>
    <span class="badge ${td0.cls}">${t0==='1'?'★ ':''}${td0.label}</span>
    <span>${school || '—'}</span>
  `;
}
function openDrawer(id){
  const p = allPlayers().find(x=>x.id===id);
  if(!p) return;
  currentPlayerId = id;
  document.getElementById('dName').innerHTML = `${getField(p,'first')} ${getField(p,'last')}${marksHtml(p)}`;
  renderDrawerSub(p);
  const body = document.getElementById('drawerBody');
  body.innerHTML = `
    <div class="field-group">
      <div class="fg-label">Name</div>
      <div class="fact-grid">
        ${factInput(p,'first','First Name')}
        ${factInput(p,'last','Last Name')}
      </div>
    </div>
    <div class="field-group">
      <div class="fg-label">Tier</div>
      <div class="tier-picker" id="tierPicker">
        ${TIERS.map(t=>`
          <button class="tier-opt tier-${TIER_DEFS[t].cls} ${getTier(p)===t?'active':''}" data-tier="${t}">
            <span class="to-num">${TIER_DEFS[t].short}</span>
            <span class="to-label">${TIER_DEFS[t].label}</span>
          </button>`).join('')}
      </div>
    </div>
    <div class="field-group">
      <div class="fg-label">Position</div>
      <div class="fact-grid">
        ${factInput(p,'posDisplay','Position', true, 'e.g. RHP, SS/3B, C')}
      </div>
    </div>
    <div class="field-group">
      <div class="fg-label">Contact</div>
      <div class="fact-grid">
        ${factInput(p,'phone','Phone')}
        ${factInput(p,'xLink','X / Twitter', false, '@handle or https://x.com/handle')}
        ${factInput(p,'email','Email', true)}
        ${factInput(p,'commit','Committed to', true, 'college name, or leave blank')}
        ${factInput(p,'coach','Coach assigned', false, 'e.g. DV')}
      </div>
    </div>
    <div class="field-group">
      <div class="fg-label">Recruiting Profiles</div>
      <div class="fact-grid">
        ${factLink(p,'pgLink','Perfect Game','https://www.perfectgame.org/Players/…')}
        ${factLink(p,'pbrLink','PBR (Prep Baseball Report)','https://www.prepbaseballreport.com/players/…')}
      </div>
    </div>
    <div class="field-group">
      <div class="fg-label">Measurables</div>
      <div class="mx-grid">
        ${METRICS.map(m=>`<div class="mx">
          <label for="fi_${m.key}">${m.label} <span class="u">${m.unit}</span></label>
          <input id="fi_${m.key}" data-field="${m.key}" value="${escAttr(getField(p,m.key))}">
        </div>`).join('')}
      </div>
      <div class="save-hint show" style="margin-top:9px;color:var(--slate)">
        <span id="dMarkLine">${autoMarks(p).join(' ') || 'No auto marks yet'}${meetsAcademicBar(p)?' · A+ academics':''}</span>
      </div>
    </div>
    ${poolOf(p) === 'transfer' ? `
    <div class="field-group">
      <div class="fg-label">Transfer</div>
      <div class="fact-grid">
        ${factInput(p,'collegeFrom','Coming from', true, 'current college')}
        ${factInput(p,'elig','Eligibility left', false, 'e.g. 2 years')}
        ${factInput(p,'portalDate','Entered portal', false, 'e.g. 2026-06-12')}
      </div>
    </div>` : ''}
    <div class="field-group">
      <div class="fg-label">Profile</div>
      <div class="fact-grid">
        ${factInput(p,'school','School')}
        ${factInput(p,'gradClass','Grad Class')}
        ${factInput(p,'team','Team / Program', true)}
        ${factInput(p,'bt','B/T')}
        ${factInput(p,'height','Height')}
        ${factInput(p,'weight','Weight (lbs)')}
        ${factInput(p,'gpa','GPA')}
        ${factInput(p,'state','State')}
        ${factInput(p,'address','Address', true)}
        ${factInput(p,'city','City')}
        ${factInput(p,'zip','Zip')}
      </div>
    </div>
    <div class="field-group">
      <div class="fg-label">Origin</div>
      <textarea class="notes" id="originArea" data-field="originNotes" placeholder="How you found them">${getField(p,'originNotes')}</textarea>
    </div>
    <div class="field-group">
      <div class="fg-label">Events Attending</div>
      <div class="att-add">
        <input class="grow" id="attEvent" list="attEventList" placeholder="Type an event name…">
        <input id="attTeam" placeholder="Travel team" style="width:150px">
        <button class="btn-log" id="attAdd">Add</button>
      </div>
      <datalist id="attEventList"></datalist>
      <div id="attList"></div>
    </div>
    <div class="field-group">
      <div class="fg-label">Call Log</div>
      <div class="log-add">
        <textarea id="logInput" placeholder="What did you talk about? Added with today's date and time."></textarea>
        <div class="log-add-row">
          <button class="btn-log" id="logAdd" disabled>Add entry</button>
          <span class="hint">⌘/Ctrl + Enter</span>
          <span class="last-contact" id="lastContact"></span>
        </div>
      </div>
      <ul class="log-list" id="logList"></ul>
    </div>
    <div class="field-group">
      <div class="fg-label">Scouting Notes</div>
      <textarea class="notes" id="notesArea" placeholder="Scouting report — tools, mechanics, projection…">${getNotes(p)}</textarea>
      <div class="save-hint" id="saveHint"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="3"/></svg><span id="saveHintText"></span></div>
    </div>
    <div id="removeZone">
      <button class="remove-player" id="removePlayerBtn">Remove This Player</button>
    </div>
  `;
  // Two-step confirm rendered in the page. A browser confirm() dialog is blocked
  // in sandboxed viewers, which silently cancelled every removal.
  const removeZone = document.getElementById('removeZone');
  removeZone.addEventListener('click', async (e)=>{
    if(e.target.closest('#removePlayerBtn')){
      removeZone.innerHTML = `
        <div class="remove-confirm">
          <p>Remove <strong>${escAttr(getField(p,'first'))} ${escAttr(getField(p,'last'))}</strong> from the board?
             ${p.isCustom ? 'This player was added in the app and will be deleted.'
                          : 'They came with the original roster and can be brought back from the sidebar.'}</p>
          <div class="rc-row">
            <button class="rc-yes" id="rcYes">Remove</button>
            <button class="rc-no" id="rcNo">Cancel</button>
          </div>
        </div>`;
      return;
    }
    if(e.target.closest('#rcNo')){
      removeZone.innerHTML = `<button class="remove-player" id="removePlayerBtn">Remove This Player</button>`;
      return;
    }
    if(e.target.closest('#rcYes')){
      const ok = await removePlayer(p.id);
      closeDrawer();
      renderAll();
      if(!ok) alertBar('Removed on screen, but the change could not be saved — export before closing.');
      return;
    }
  });
  document.getElementById('tierPicker').querySelectorAll('.tier-opt').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const ok = await setTier(p.id, btn.dataset.tier);
      document.getElementById('tierPicker').querySelectorAll('.tier-opt').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderDrawerSub(p);
      (typeof renderHs === 'function' ? renderHs : renderAll)();
      flashSaved(ok);
    });
  });
  function paintAttendance(){
    document.getElementById('attEventList').innerHTML =
      events.slice()
        .sort((a,b)=> String(a.start).localeCompare(String(b.start)))
        .map(e=>`<option value="${escAttr(e.name + '  ·  ' + fmtRange(e))}"></option>`).join('');
    const mine = eventsForPlayer(p.id)
      .map(a=> ({ a, e: eventById(a.eventId) }))
      .filter(x=> x.e)
      .sort((x,y)=> String(x.e.start).localeCompare(String(y.e.start)));
    const box = document.getElementById('attList');
    if(!mine.length){
      box.innerHTML = `<div class="att-none">Not down for any events yet.</div>`;
      return;
    }
    box.innerHTML = mine.map(({a,e})=>`
      <div class="att-row">
        <div class="att-main">
          <div class="att-nm">${escAttr(e.name)}</div>
          <div class="att-meta">${escAttr(fmtRange(e))}${e.location?' · '+escAttr(e.location):''}</div>
        </div>
        <input class="att-team" data-attteam="${escAttr(a.id)}" value="${escAttr(a.team)}" placeholder="Travel team">
        <button class="att-x" data-attdel="${escAttr(a.id)}" title="Remove">✕</button>
      </div>`).join('');
    box.querySelectorAll('[data-attteam]').forEach(inp=>{
      inp.addEventListener('change', async ()=>{
        const ok = await setAttendanceTeam(inp.dataset.attteam, inp.value);
        flashSaved(ok);
      });
    });
    box.querySelectorAll('[data-attdel]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        if(btn.dataset.arm !== '1'){
          btn.dataset.arm='1'; btn.textContent='remove?'; btn.classList.add('arm');
          setTimeout(()=>{ if(btn.isConnected && btn.dataset.arm==='1'){ btn.dataset.arm='0'; btn.textContent='✕'; btn.classList.remove('arm'); } }, 4000);
          return;
        }
        const ok = await removeAttendance(btn.dataset.attdel);
        paintAttendance();
        if(typeof renderEvents === 'function') renderEvents();
        flashSaved(ok);
      });
    });
  }
  document.getElementById('attAdd').addEventListener('click', async ()=>{
    const typed = document.getElementById('attEvent').value.trim();
    if(!typed) return;
    const name = typed.split('  ·  ')[0].trim().toLowerCase();
    const ev = events.find(e=> String(e.name).toLowerCase() === name)
            || events.find(e=> String(e.name).toLowerCase().includes(name));
    if(!ev){ alertBar('No event matches that name — pick one from the list.'); return; }
    if(isAttending(p.id, ev.id)){ alertBar('Already down for that event.'); return; }
    const team = document.getElementById('attTeam').value.trim() || getField(p,'team');
    const ok = await addAttendance(p.id, ev.id, team);
    document.getElementById('attEvent').value = '';
    document.getElementById('attTeam').value = '';
    paintAttendance();
    if(typeof renderEvents === 'function') renderEvents();
    flashSaved(ok);
  });
  paintAttendance();
  drawerRepaint = paintLog;
  function paintLog(){
    const entries = getLog(p);
    const lc = lastContact(p);
    document.getElementById('lastContact').textContent = lc ? 'Last contact ' + fmtStamp(lc) : '';
    const ul = document.getElementById('logList');
    if(!entries.length){
      ul.innerHTML = `<li class="log-none">No entries yet. Add one after your next call.</li>`;
      return;
    }
    ul.innerHTML = entries.map(e=>`
      <li class="log-item">
        <div class="lt">
          ${e.ts ? `<time>${fmtStamp(e.ts)}</time>` : `<span class="imported">from spreadsheet</span>`}
          ${e.by ? `<span class="lby">${escAttr(e.by)}</span>` : ''}
          <button class="lx" data-del="${escAttr(e.id)}" title="Delete entry">✕</button>
        </div>
        <p>${escAttr(e.text)}</p>
      </li>`).join('');
    ul.querySelectorAll('[data-del]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        if(btn.dataset.arm !== '1'){
          btn.dataset.arm = '1'; btn.textContent = 'delete?'; btn.classList.add('arm');
          setTimeout(()=>{ if(btn.isConnected && btn.dataset.arm==='1'){ btn.dataset.arm='0'; btn.textContent='✕'; btn.classList.remove('arm'); } }, 4000);
          return;
        }
        const ok = await deleteLogEntry(p.id, btn.dataset.del);
        paintLog();
        (typeof renderHs === 'function' ? renderHs : renderAll)();
        flashSaved(ok);
      });
    });
  }
  const logInput = document.getElementById('logInput');
  const logBtn = document.getElementById('logAdd');
  logInput.addEventListener('input', ()=>{ logBtn.disabled = !logInput.value.trim(); });
  logInput.addEventListener('keydown', e=>{
    if((e.metaKey || e.ctrlKey) && e.key === 'Enter'){ e.preventDefault(); logBtn.click(); }
  });
  logBtn.addEventListener('click', async ()=>{
    const ok = await addLogEntry(p.id, logInput.value);
    logInput.value = ''; logBtn.disabled = true;
    paintLog();
    (typeof renderHs === 'function' ? renderHs : renderAll)();
    flashSaved(ok);
  });
  paintLog();
  body.querySelectorAll('[data-open]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const key = btn.dataset.open;
      const label = key === 'pgLink' ? 'Perfect Game profile' : 'PBR profile';
      const url = toWebUrl(document.getElementById('fi_'+key).value);
      if(url){ openExternal(url, label); return; }
      const nm = `${getField(p,'first')} ${getField(p,'last')}`.trim();
      if(!nm){ alertBar('Add a name first.'); return; }
      const finder = PLAYER_FINDERS[key] || PLAYER_FINDERS.pbrLink;
      copyText(nm).then(ok=>{
        alertBar(ok ? `"${nm}" copied — paste it into ${finder.name}'s search box.`
                    : `Search ${finder.name} for ${nm}.`, 'ok');
      });
      openExternal(finder.url, finder.name + ' player search');
    });
  });
  const fieldTimers = {};
  body.querySelectorAll('[data-field]').forEach(inp=>{
    const evt = inp.tagName === 'TEXTAREA' ? 'input' : 'input';
    inp.addEventListener(evt, ()=>{
      const key = inp.dataset.field;
      const openBtn = body.querySelector(`[data-open="${key}"]`);
      if(openBtn){
        const has = !!toWebUrl(inp.value);
        openBtn.textContent = has ? 'Open' : 'Find';
        openBtn.title = has ? 'Open in a new tab' : "Open the site's player search with the name copied";
        if(has) openBtn.removeAttribute('data-mode'); else openBtn.setAttribute('data-mode','find');
      }
      clearTimeout(fieldTimers[key]);
      fieldTimers[key] = setTimeout(async ()=>{
        const ok = await setField(p.id, key, inp.value.trim());
        document.getElementById('dName').innerHTML =
          `${getField(p,'first')} ${getField(p,'last')}${marksHtml(p)}`;
        const ml = document.getElementById('dMarkLine');
        if(ml) ml.textContent = (autoMarks(p).join(' ') || 'No auto marks yet')
                              + (meetsAcademicBar(p) ? ' · A+ academics' : '');
        renderDrawerSub(p);
        (typeof renderHs === 'function' ? renderHs : renderAll)();
        flashSaved(ok);
      }, 500);
    });
  });
  let notesTimer;
  document.getElementById('notesArea').addEventListener('input', (e)=>{
    clearTimeout(notesTimer);
    notesTimer = setTimeout(async ()=>{
      const ok = await setNotes(p.id, e.target.value);
      flashSaved(ok);
    }, 500);
  });
  document.getElementById('scrim').classList.add('show');
  document.getElementById('drawer').classList.add('show');
}
function flashSaved(ok){
  const hint = document.getElementById('saveHint');
  const txt = document.getElementById('saveHintText');
  if(!hint) return;
  clearTimeout(flashSaved._t);
  if(ok === false){
    // The write did not land anywhere durable — say so instead of lying.
    hint.classList.remove('show');
    hint.classList.add('warn');
    txt.textContent = 'Not saved — this change is lost if you reload. Use Export CSV.';
    return;                                  // stays put until the next edit
  }
  hint.classList.remove('warn');
  hint.classList.add('show');
  txt.textContent = 'Saved';
  flashSaved._t = setTimeout(()=>{ hint.classList.remove('show'); txt.textContent=''; }, 1400);
}
function showStorageState(){
  const el = document.getElementById('lastUpdated');
  if(!el) return;
  if(Store.mode === 'host'){
    el.textContent = 'Draft board · changes saved';
    el.classList.remove('warn');
  }else if(Store.mode === 'local'){
    el.textContent = 'Draft board · changes saved in this browser';
    el.classList.remove('warn');
  }else{
    el.textContent = 'Draft board · changes NOT saved — export before closing';
    el.classList.add('warn');
    el.title = 'This browser is blocking storage, so edits live only in this tab. '
             + 'Use Export CSV to keep your work.';
  }
}
function updateTotalCount(){
  const el = document.getElementById('totalCount');
  if(el) el.textContent = `${allPlayers().length} players`;
}
function renderRestoreControl(){
  const sb = document.getElementById('sidebar');
  const old = document.getElementById('restoreWrap');
  if(old) old.remove();
  if(!removedIds.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'restore-wrap';
  wrap.id = 'restoreWrap';
  wrap.innerHTML = `<button class="restore-btn" id="restoreBtn">↩ Restore ${removedIds.length} removed player${removedIds.length===1?'':'s'}</button>`;
  sb.appendChild(wrap);
  document.getElementById('restoreBtn').addEventListener('click', async ()=>{
    await restoreRemoved();
    renderAll();
  });
}
// Non-blocking notice (never window.alert — modals are blocked in sandboxed viewers).
function alertBar(msg, kind){
  const el = document.getElementById('lastUpdated');
  if(!el) return;
  el.textContent = msg;
  el.classList.toggle('warn', kind !== 'ok');
  clearTimeout(alertBar._t);
  alertBar._t = setTimeout(showStorageState, 6000);
}
/* ---- opening external links -------------------------------------------------
   Sandboxed viewers refuse window.open and top-level navigation, which made the
   X / PG / PBR icons look dead. Try the real thing first, then fall back to a
   panel that hands over the URL so it is always reachable.
------------------------------------------------------------------------------ */
async function copyText(text){
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(text);
      return true;
    }
  }catch(e){ /* fall through */ }
  try{
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }catch(e){ return false; }
}
function showLinkFallback(url, label){
  const isTel = /^tel:/i.test(url);
  const shown = isTel ? url.replace(/^tel:/i,'') : url;
  document.getElementById('linkTitle').textContent = label || 'Open Link';
  document.getElementById('linkSub').textContent = isTel
    ? 'This viewer will not hand the number to your phone app.'
    : 'This viewer blocks opening new tabs.';
  document.getElementById('linkNote').textContent = isTel
    ? 'Copy the number below, or open the board in its own browser tab to dial directly.'
    : 'Copy the address below and paste it into a new tab. Opening this file directly in a '
      + 'browser (instead of inside a preview pane) makes these links clickable.';
  const input = document.getElementById('linkUrl');
  input.value = shown;
  const anchor = document.getElementById('linkAnchor');
  anchor.href = url;
  anchor.style.display = isTel ? 'none' : 'inline-block';
  document.getElementById('linkCopied').textContent = '';
  document.getElementById('scrim').classList.add('show');
  document.getElementById('linkModal').classList.add('show');
  setTimeout(()=>{ input.focus(); input.select(); }, 60);
  copyText(shown).then(ok=>{
    if(ok) document.getElementById('linkCopied').textContent = 'Copied to clipboard';
  });
}
function openExternal(url, label){
  if(!url) return;
  let w = null;
  // NB: passing 'noopener' in the feature string makes window.open return null
  // even when it succeeds, which reads as "blocked". Open plainly, then detach
  // the opener reference ourselves.
  try{ w = window.open(url, '_blank'); }catch(e){ w = null; }
  if(w){
    try{ w.opener = null; }catch(e){ /* cross-origin: already isolated */ }
    return;
  }
  showLinkFallback(url, label);
}
// Row icons: keep native anchors (so cmd/middle-click still work) but take over
// the plain click so a blocked pop-up can fall back instead of doing nothing.
// Capture phase on purpose: the icons carry an inline stopPropagation() to keep
// the row from opening, which would otherwise swallow this listener.
document.addEventListener('click', (e)=>{
  const a = e.target.closest('a.icon-btn, a.lk-open');
  if(!a) return;
  if(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  const href = a.getAttribute('href');
  if(!href || href === '#') return;
  e.preventDefault();
  e.stopPropagation();
  const label = a.classList.contains('pg')  ? 'Perfect Game profile'
              : a.classList.contains('pbr') ? 'PBR profile'
              : /^tel:/i.test(href)         ? 'Phone number'
              : a.classList.contains('lk-open') ? 'Open Link'
              : 'X profile';
  openExternal(href, label);
}, true);
document.getElementById('linkClose').addEventListener('click', closeDrawer);
document.getElementById('linkDismiss').addEventListener('click', closeDrawer);
document.getElementById('linkCopy').addEventListener('click', async ()=>{
  const ok = await copyText(document.getElementById('linkUrl').value);
  document.getElementById('linkCopied').textContent = ok ? 'Copied to clipboard' : 'Press Ctrl/Cmd+C to copy';
  const input = document.getElementById('linkUrl');
  input.focus(); input.select();
});
function closeDrawer(){
  drawerRepaint = null;
  document.getElementById('scrim').classList.remove('show');
  document.getElementById('drawer').classList.remove('show');
  // Close every modal, rather than a hand-kept list of ids. The list only ever
  // named seven of the fifteen, so Sync, Staff, the book reader, the calendar
  // entry, game import, link paste, org paste and the whiteboard all stayed on
  // screen — their ✕ and Done buttons call this function, so the click landed
  // and nothing moved. A modal added later now closes without touching this.
  document.querySelectorAll('.modal.show').forEach(m=> m.classList.remove('show'));
  currentPlayerId = null;
}
document.getElementById('drawerClose').addEventListener('click', closeDrawer);
document.getElementById('scrim').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDrawer(); });
document.getElementById('searchInput').addEventListener('input', (e)=>{
  searchTerm = e.target.value.trim().toLowerCase();
  renderRoster();
});
/* ---- Add Player modal ---- */
const ADD_FIELD_IDS = ['first','last','pos','state','grad','school','team','bt','height','weight',
                        'gpa','phone','email','x','pg','pbr','commit','coach','address','city','zip','phonenotes','origin','notes'];
function resetAddForm(){
  ADD_FIELD_IDS.forEach(k=> document.getElementById('f_'+k).value = '');
  document.getElementById('f_tier').value = '2';
  document.getElementById('formError').textContent = '';
  document.getElementById('f_screenshot').value = '';
  document.getElementById('shotPreview').style.display = 'none';
  document.getElementById('shotPreview').src = '';
  document.getElementById('extractBtn').disabled = true;
  setShotStatus('', '');
}
function setShotStatus(msg, kind){
  const el = document.getElementById('shotStatus');
  el.textContent = msg;
  el.className = 'shot-status' + (kind ? ' '+kind : '');
}
function fileToBase64(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(r.result.split(',')[1]);
    r.onerror = ()=> reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}
document.getElementById('f_screenshot').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  const preview = document.getElementById('shotPreview');
  const btn = document.getElementById('extractBtn');
  if(!file){ preview.style.display='none'; btn.disabled = true; return; }
  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';
  btn.disabled = false;
  setShotStatus('', '');
});
document.getElementById('extractBtn').addEventListener('click', async ()=>{
  const file = document.getElementById('f_screenshot').files[0];
  if(!file) return;
  const btn = document.getElementById('extractBtn');
  btn.disabled = true;
  setShotStatus('Reading screenshot…', '');
  try{
    const base64 = await fileToBase64(file);
    setShotStatus('Extracting info…', '');
    const raw = await AI.call({
      max_tokens: 1000,
      system: [
          'You extract baseball recruiting information from a screenshot, usually an X/Twitter profile.',
          'Respond with ONLY a raw JSON object — no markdown fences, no commentary.',
          'Use "" for anything not visible. Never guess or invent a value.',
          'Keys exactly: first, last, xHandle, position, state, city, school, team, gradClass, bt,',
          'height, weight, gpa, phone, email, commit, pbrUrl, pgUrl, metrics, originNotes.',
          'phone: the phone number exactly as shown, digits and separators only (e.g. 630-743-9824). Bios often put it on the same line as the email, separated by a pipe.',
          'email: the full email address exactly as shown.',
          'position: primary BASEBALL position only — RHP, LHP, C, SS, 3B, 2B, 1B, OF. A bio may also list a football position like WR/DB; ignore that here.',
          'gradClass: the four-digit class year, e.g. 2028.',
          'bt: bats/throws such as L/L or R/R.',
          'height: as shown, e.g. 5\'11" or 6-2.  weight: number of pounds only.',
          'gpa: the number only, without the word GPA.',
          'school: the high school. team: the travel/club program, e.g. Trosky Illinois 17U.',
          'city and state: from the location line, e.g. "Downers Grove, IL" -> city "Downers Grove", state "IL".',
          'commit: the college only if the bio clearly states a commitment; otherwise "".',
          'pbrUrl / pgUrl: only if the FULL address is readable. If a link is cut off with an ellipsis, return "".',
          'metrics: every performance number shown, verbatim and comma separated, e.g. "EV 100, 60: 6.92, OFVel 85, BtSp 79.4". Include any other sport or role noted, e.g. "also WR/DB".',
          'originNotes: under 12 words on where this came from, e.g. "X bio screenshot".'
      ].join(' '),
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: file.type || 'image/png', data: base64 } },
          { type: 'text', text: 'Extract this recruit\'s info as JSON.' }
        ]
      }],
    });
    const info = AI.json(raw);
    const set = (id, v) => { if(v){ document.getElementById('f_'+id).value = v; } };
    // 5'11" / 5’11” / 5 ft 11 -> 5-11
    const normHeight = v => {
      v = String(v||'').trim();
      const m = v.match(/(\d)\s*(?:'|’|ft|feet)\s*(\d{1,2})/);
      return m ? `${m[1]}-${m[2]}` : v.replace(/["”]/g,'').trim();
    };
    const digitsOnly = v => String(v||'').replace(/[^\d]/g,'');
    // keep the author's formatting when it looks like a real number, else 000-000-0000
    const normPhone = v => {
      const d = digitsOnly(v);
      if(d.length === 11 && d[0] === '1') return d.slice(1,4)+'-'+d.slice(4,7)+'-'+d.slice(7);
      if(d.length === 10) return d.slice(0,3)+'-'+d.slice(3,6)+'-'+d.slice(6);
      return String(v||'').trim();
    };
    const numOnly = v => { const m = String(v||'').match(/[\d.]+/); return m ? m[0] : ''; };
    set('first', info.first); set('last', info.last);
    set('pos', info.position); set('state', info.state);
    set('city', info.city);
    set('school', info.school); set('team', info.team);
    set('grad', info.gradClass); set('bt', info.bt);
    set('height', normHeight(info.height)); set('weight', numOnly(info.weight));
    set('gpa', numOnly(info.gpa)); set('x', info.xHandle);
    set('phone', normPhone(info.phone)); set('email', info.email);
    set('commit', info.commit);
    set('pbr', info.pbrUrl); set('pg', info.pgUrl);
    set('origin', info.originNotes);
    if(info.metrics) set('notes', info.metrics);
    // tell them plainly what did and did not come across
    const got = [['phone',info.phone],['email',info.email],['GPA',info.gpa],
                 ['height/weight', info.height||info.weight],['metrics',info.metrics]]
                .filter(x=>x[1]).map(x=>x[0]);
    const missed = [['phone',info.phone],['email',info.email]].filter(x=>!x[1]).map(x=>x[0]);
    setShotStatus(
      'Extracted' + (got.length ? ' — got ' + got.join(', ') : '') +
      (missed.length ? '. No ' + missed.join(' or ') + ' visible — add by hand.' : '.') +
      ' Check the fields before saving.',
      missed.length ? '' : 'ok');
  }catch(e){
    console.error(e);
    setShotStatus(AI.why(e), 'error');
  }finally{
    btn.disabled = false;
  }
});
function openAddModal(){
  resetAddForm();
  document.getElementById('scrim').classList.add('show');
  document.getElementById('addModal').classList.add('show');
  setTimeout(()=> document.getElementById('f_first').focus(), 50);
}
function toXUrl(v){
  v = (v||'').trim();
  if(!v) return '';
  if(v.startsWith('http')) return v.split('?')[0];
  return `https://x.com/${v.replace(/^@/,'')}`;
}
async function submitAddForm(){
  const val = k => document.getElementById('f_'+k).value.trim();
  const first = val('first'), last = val('last'), pos = val('pos');
  const err = document.getElementById('formError');
  if(!first || !last || !pos){
    err.textContent = 'First name, last name, and position are required.';
    return;
  }
  const tier = document.getElementById('f_tier').value;
  const id = `custom-${last.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${first.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${Date.now()}`;
  const player = {
    id, first, last,
    posPrimary: primaryPos(pos),
    posDisplay: pos,
    topLion: tier === '1',
    team: val('team'), school: val('school'),
    gradClass: val('grad'), bt: val('bt'), height: val('height'),
    weight: val('weight'), address: val('address'), city: val('city'),
    state: val('state'), zip: val('zip'), phone: val('phone'),
    phoneNotes: val('phonenotes'), email: val('email'),
    xLink: toXUrl(val('x')), pgLink: val('pg'), pbrLink: val('pbr'), commit: val('commit'), coach: val('coach'),
    gpa: val('gpa'), originNotes: val('origin'),
    isCustom: true,
    pool: POOL,
    _defaultTier: tier,
  };
  customPlayers.push(player);
  overrides[id] = { tier, notes: val('notes') };
  const okA = await saveCustomPlayers();
  const okB = await saveOverrides();
  closeDrawer();
  groupMode = 'pos';
  document.getElementById('groupToggle').querySelectorAll('.gt-btn').forEach(b=>b.classList.toggle('active', b.dataset.mode==='pos'));
  activePos = player.posPrimary;
  activeTier = null;
  document.getElementById('searchInput').value = '';
  searchTerm = '';
  renderAll();
  openDrawer(id);
  flashSaved(okA && okB);
}
document.getElementById('addPlayerBtn').addEventListener('click', openAddModal);
document.getElementById('modalClose').addEventListener('click', closeDrawer);
document.getElementById('cancelAdd').addEventListener('click', closeDrawer);
document.getElementById('submitAdd').addEventListener('click', submitAddForm);
/* ---- CSV export ---- */
function csvCell(v){
  v = (v===undefined || v===null) ? '' : String(v);
  if(/[",\n]/.test(v)){ v = '"' + v.replace(/"/g,'""') + '"'; }
  return v;
}
function exportCsv(){
  const cols = [
    ['First Name', p=>getField(p,'first')],
    ['Last Name', p=>getField(p,'last')],
    ['Position', p=>getField(p,'posDisplay')],
    ['Tier', p=>getTier(p)],
    ['Tier Label', p=>TIER_DEFS[getTier(p)].label],
    ['School', p=>getField(p,'school')],
    ['Team / Program', p=>getField(p,'team')],
    ['Grad Class', p=>getField(p,'gradClass')],
    ['B/T', p=>getField(p,'bt')],
    ['Height', p=>getField(p,'height')],
    ['Weight', p=>getField(p,'weight')],
    ['GPA', p=>getField(p,'gpa')],
    ['Address', p=>getField(p,'address')],
    ['City', p=>getField(p,'city')],
    ['State', p=>getField(p,'state')],
    ['Zip', p=>getField(p,'zip')],
    ['Phone', p=>getField(p,'phone')],
    ['Phone Notes', p=>getField(p,'phoneNotes')],
    ['Email', p=>getField(p,'email')],
    ['X / Twitter', p=>getField(p,'xLink')],
    ['Perfect Game', p=>getField(p,'pgLink')],
    ['PBR', p=>getField(p,'pbrLink')],
    ['Commit', p=>getField(p,'commit')],
    ['Coach Assigned', p=>getField(p,'coach')],
    ['60', p=>getField(p,'m60')],
    ['Exit Velo', p=>getField(p,'mEV')],
    ['FB Velo', p=>getField(p,'mFB')],
    ['Pop', p=>getField(p,'mPop')],
    ['C Velo', p=>getField(p,'mC')],
    ['OF Velo', p=>getField(p,'mOF')],
    ['INF Velo', p=>getField(p,'mINF')],
    ['Bat Speed', p=>getField(p,'mBat')],
    ['Origin Notes', p=>getField(p,'originNotes')],
    ['Events Attending', p=> eventsForPlayer(p.id).map(a=>{
        const e = eventById(a.eventId);
        return e ? e.name + (a.team ? ' (' + a.team + ')' : '') : '';
      }).filter(Boolean).join(' | ')],
    ['Last Contact', p=>{ const t = lastContact(p); return t ? fmtStamp(t) : ''; }],
    ['Call Log', p=>getLog(p).map(e=> (e.ts ? fmtStamp(e.ts) : 'from spreadsheet') + ': ' + e.text).join('\n')],
    ['Scouting Notes', p=>getNotes(p)],
    ['Added In App', p=>p.isCustom ? 'Yes' : 'No'],
  ];
  const rows = [cols.map(c=>csvCell(c[0])).join(',')];
  allPlayers().forEach(p=>{
    rows.push(cols.map(c=>csvCell(c[1](p))).join(','));
  });
  const csv = rows.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `2028-recruiting-board-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
/* ---- CSV import ---- */
let impItems = [];
function openImportModal(){
  impItems = [];
  document.getElementById('impFile').value = '';
  document.getElementById('impResult').style.display = 'none';
  document.getElementById('impError').textContent = '';
  document.getElementById('importConfirm').disabled = true;
  document.getElementById('importConfirm').textContent = 'Import';
  document.getElementById('scrim').classList.add('show');
  document.getElementById('importModal').classList.add('show');
}
function impCounts(){
  const skipDupes = document.getElementById('impSkipDupes').checked;
  const nNew = impItems.filter(i=>i.status==='new').length;
  const nDup = impItems.filter(i=>i.status==='dup').length;
  const nBad = impItems.filter(i=>i.status==='bad').length;
  return { nNew, nDup, nBad, willAdd: nNew + (skipDupes ? 0 : nDup) };
}
function renderImportPreview(){
  const { nNew, nDup, nBad, willAdd } = impCounts();
  document.getElementById('impSummary').innerHTML =
    `<div class="imp-stat good"><b>${nNew}</b>new</div>` +
    `<div class="imp-stat warn"><b>${nDup}</b>already on board</div>` +
    `<div class="imp-stat bad"><b>${nBad}</b>unusable</div>` +
    `<div class="imp-stat"><b>${willAdd}</b>will be added</div>`;
  const skipDupes = document.getElementById('impSkipDupes').checked;
  const rowsHtml = impItems.slice(0, 300).map(i=>{
    const skipped = i.status==='bad' || (i.status==='dup' && skipDupes);
    const label = i.status==='new' ? 'add' : i.status==='dup' ? (skipDupes?'skip':'add') : 'skip';
    return `<div class="imp-row" style="${skipped?'opacity:.55':''}">
      <span class="st ${i.status}">${label}</span>
      <span>${escAttr((i.rec.first||'?')+' '+(i.rec.last||''))}</span>
      <span class="why">${escAttr(i.rec.posDisplay||'—')}</span>
      <span class="why">${escAttr(i.rec.state||'')}</span>
    </div>${i.why?`<div class="imp-row" style="grid-template-columns:70px 1fr;padding-top:0;border-bottom:none">
      <span></span><span class="why">row ${i.row}: ${escAttr(i.why)}</span></div>`:''}`;
  }).join('');
  document.getElementById('impPreview').innerHTML =
    `<div class="imp-row head"><span>Action</span><span>Player</span><span>Pos</span><span>St</span></div>` + rowsHtml +
    (impItems.length>300?`<div class="imp-row"><span></span><span class="why">…and ${impItems.length-300} more rows</span><span></span><span></span></div>`:'');
  document.getElementById('importConfirm').disabled = willAdd === 0;
  document.getElementById('importConfirm').textContent = willAdd ? `Import ${willAdd} player${willAdd===1?'':'s'}` : 'Nothing to import';
}
document.getElementById('impFile').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  const err = document.getElementById('impError');
  err.textContent = '';
  if(!file) return;
  const fr = new FileReader();
  fr.onload = ()=>{
    try{
      const rows = parseCSV(String(fr.result));
      if(rows.length < 2){ err.textContent = 'That file has no data rows under the header.'; return; }
      const mapped = rows[0].map(h=>normHeader(h)).map(h=>CSV_HEADER_MAP[h]||null).filter(Boolean);
      if(!mapped.includes('first') && !mapped.includes('last') && !mapped.includes('fullname')){
        err.textContent = 'No name column found. The first row must be headers including a First/Last Name (or Name) column.';
        return;
      }
      impItems = mapCsvRows(rows);
      document.getElementById('impResult').style.display = 'block';
      renderImportPreview();
    }catch(ex){
      console.error(ex);
      err.textContent = 'Could not read that file as CSV.';
    }
  };
  fr.onerror = ()=>{ err.textContent = 'Could not read that file.'; };
  fr.readAsText(file);
});
document.getElementById('impSkipDupes').addEventListener('change', renderImportPreview);
async function runImport(){
  const skipDupes = document.getElementById('impSkipDupes').checked;
  const take = impItems.filter(i=> i.status==='new' || (i.status==='dup' && !skipDupes));
  let allOk = true;
  const stamp = Date.now();
  take.forEach((item, n)=>{
    const r = item.rec;
    const tier = TIERS.includes(String(r.tier)) ? String(r.tier) : '2';
    const id = `csv-${String(r.last).toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${String(r.first).toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${stamp}-${n}`;
    customPlayers.push({
      id, first: r.first, last: r.last,
      posPrimary: primaryPos(r.posDisplay), posDisplay: r.posDisplay,
      topLion: tier === '1',
      team: r.team||'', school: r.school||'', gradClass: r.gradClass||'',
      bt: r.bt||'', height: r.height||'', weight: r.weight||'',
      address: r.address||'', city: r.city||'', state: r.state||'', zip: r.zip||'',
      phone: r.phone||'', phoneNotes: r.phoneNotes||'', email: r.email||'',
      xLink: toXUrl(r.xLink||''), pgLink: r.pgLink||'', pbrLink: r.pbrLink||'', commit: r.commit||'', coach: r.coach||'',
      m60:r.m60||'', mEV:r.mEV||'', mFB:r.mFB||'', mPop:r.mPop||'',
      mC:r.mC||'', mOF:r.mOF||'', mINF:r.mINF||'', mBat:r.mBat||'',
      gpa: r.gpa||'', originNotes: r.originNotes||'',
      isCustom: true, _defaultTier: tier,
    });
    overrides[id] = { tier, notes: r.notes||'' };
  });
  allOk = (await saveCustomPlayers()) && (await saveOverrides());
  closeDrawer();
  computeDefaults();
  await migrateNotesToLog();
  renderAll();
  if(!allOk) alertBar(`Imported ${take.length} on screen, but they could not be saved — export before closing.`);
  else alertBar(`Imported ${take.length} player${take.length===1?'':'s'} from CSV.`, 'ok');
}
document.getElementById('importCsvBtn').addEventListener('click', openImportModal);
document.getElementById('importClose').addEventListener('click', closeDrawer);
document.getElementById('importCancel').addEventListener('click', closeDrawer);
document.getElementById('importConfirm').addEventListener('click', runImport);
const APP_READY = (async function init(){
  await Store.init();
  showStorageState();
  await loadCustomPlayers();
  await loadRemoved();
  await loadOverrides();
  computeDefaults();
  await migrateNotesToLog();
  renderAll();
})();
</script>
</body>
</html>
