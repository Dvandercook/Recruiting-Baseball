/* ==========================================================================
   Auto marks editor, duplicate merging, and the printable event book.
   ========================================================================== */
let mkDraft = [];
function renderMarkRules(){
  const box = document.getElementById('mkRules');
  box.innerHTML = mkDraft.map((r,i)=>{
    const hits = allPlayers().filter(p=>{
      const v = parseMetric(getField(p, r.key)); const t = parseFloat(r.val);
      if(v === null || isNaN(t)) return false;
      return r.op === 'lte' ? v <= t : v >= t;
    }).length;
    return `<div class="rule-row">
      <select data-mk="key" data-i="${i}">
        ${METRICS.map(m=>`<option value="${m.key}" ${m.key===r.key?'selected':''}>${m.label}</option>`).join('')}
      </select>
      <select data-mk="op" data-i="${i}">
        <option value="lte" ${r.op==='lte'?'selected':''}>≤</option>
        <option value="gte" ${r.op==='gte'?'selected':''}>≥</option>
      </select>
      <input class="val" data-mk="val" data-i="${i}" value="${escAttr(r.val)}">
      <input class="emo" data-mk="emoji" data-i="${i}" value="${escAttr(r.emoji)}" maxlength="4">
      <span class="rule-hits">${hits} player${hits===1?'':'s'}</span>
      <button class="rule-x" data-mkdel="${i}" title="Remove rule">✕</button>
    </div>`;
  }).join('') || '<p class="imp-hint" style="margin:0">No rules yet.</p>';
  box.querySelectorAll('[data-mk]').forEach(el=>{
    el.addEventListener('change', ()=>{
      mkDraft[+el.dataset.i][el.dataset.mk] = el.value;
      renderMarkRules();
    });
  });
  box.querySelectorAll('[data-mkdel]').forEach(b=>{
    b.addEventListener('click', ()=>{ mkDraft.splice(+b.dataset.mkdel,1); renderMarkRules(); });
  });
  const bar = parseFloat(document.getElementById('mkGpa').value);
  const n = isNaN(bar) ? 0 : allPlayers().filter(p=>{
    const g = parseFloat(getField(p,'gpa')); return !isNaN(g) && g >= bar; }).length;
  document.getElementById('mkGpaCount').textContent = isNaN(bar) ? '' : `${n} players earn it`;
}
function openMarks(){
  mkDraft = markRules.map(r=>Object.assign({}, r));
  document.getElementById('mkGpa').value = academicBar.gpa == null ? '' : academicBar.gpa;
  renderMarkRules();
  document.getElementById('scrim').classList.add('show');
  document.getElementById('marksModal').classList.add('show');
}
document.getElementById('marksBtn').addEventListener('click', openMarks);
document.getElementById('mkAdd').addEventListener('click', ()=>{
  mkDraft.push({ key:'mEV', op:'gte', val:'95', emoji:'⭐' }); renderMarkRules();
});
document.getElementById('mkGpa').addEventListener('input', renderMarkRules);
document.getElementById('mkReset').addEventListener('click', ()=>{
  mkDraft = DEFAULT_MARK_RULES.map(r=>Object.assign({}, r));
  document.getElementById('mkGpa').value = 4.0;
  renderMarkRules();
});
document.getElementById('mkSave').addEventListener('click', async ()=>{
  markRules = mkDraft.filter(r=>r.emoji && r.val !== '');
  academicBar = { gpa: document.getElementById('mkGpa').value.trim() };
  const ok = (await saveMarkRules()) && (await saveAcademicBar());
  closeDrawer();
  if(typeof renderHs === 'function') renderHs();
  alertBar(ok ? 'Marks updated.' : 'Could not save the rules.', ok ? 'ok' : undefined);
});
document.getElementById('mkClose').addEventListener('click', closeDrawer);
/* ---- duplicate finder ---- */
function findDuplicatePairs(){
  const list = allPlayers();
  const byKey = new Map();
  const pairs = new Map();
  const add = (a,b,why)=>{
    if(a.id === b.id) return;
    const k = [a.id,b.id].sort().join('|');
    if(!pairs.has(k)) pairs.set(k, { a, b, why:new Set() });
    pairs.get(k).why.add(why);
  };
  const push = (map,key,p)=>{ if(!key) return; if(!map.has(key)) map.set(key,[]); map.get(key).push(p); };
  const nameMap = new Map(), phoneMap = new Map(), xMap = new Map();
  list.forEach(p=>{
    push(nameMap, normName(getField(p,'first')+' '+getField(p,'last')), p);
    const d = String(getField(p,'phone')||'').replace(/\D/g,'');
    if(d.length >= 10) push(phoneMap, d.slice(-10), p);
    const m = String(getField(p,'xLink')||'').toLowerCase().match(/x\.com\/([a-z0-9_]+)/);
    if(m) push(xMap, m[1], p);
  });
  const scan = (map,why)=> map.forEach(arr=>{
    for(let i=0;i<arr.length;i++) for(let j=i+1;j<arr.length;j++) add(arr[i],arr[j],why);
  });
  scan(nameMap,'same name'); scan(phoneMap,'same phone'); scan(xMap,'same X handle');
  return [...pairs.values()];
}
let mgPairs = [], mgKeep = {};
function renderMerge(){
  const box = document.getElementById('mgBody');
  if(!mgPairs.length){
    box.innerHTML = `<div class="sec-empty"><h4>No duplicates found</h4>
      <p>Nothing on the board shares a name, phone number or X handle.</p></div>`;
    return;
  }
  box.innerHTML = mgPairs.map((pr,i)=>{
    const side = (p, which)=>{
      const filled = ['school','team','phone','email','xLink','pbrLink','pgLink','height','weight','gpa']
        .filter(k=>getField(p,k)).length;
      const notes = (getNotes(p)||'').length;
      const keep = (mgKeep[i] || 'a') === which;
      return `<div class="mg-opt ${keep?'keep':''}" data-mgk="${i}" data-which="${which}">
        ${keep?'<div class="tag">keep this one</div>':''}
        <div class="n">${escAttr(getField(p,'first'))} ${escAttr(getField(p,'last'))}</div>
        <div class="d">${escAttr([getField(p,'posDisplay'),getField(p,'state'),getField(p,'school')].filter(Boolean).join(' · ')||'—')}<br>
          tier ${escAttr(getTier(p))} · ${filled} fields filled · ${notes} chars of notes${p.isCustom?' · added in app':''}</div>
      </div>`;
    };
    return `<div class="mg-pair">
      <div class="mg-why">${[...pr.why].join(' + ')}</div>
      <div class="mg-side">${side(pr.a,'a')}${side(pr.b,'b')}</div>
      <div class="mg-act">
        <button class="btn primary" data-mgdo="${i}" style="padding:7px 13px;font-size:12px">Merge these two</button>
        <span class="imp-hint" style="margin:0">The other record is removed; its notes, links and blanks fill the keeper.</span>
      </div>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-mgk]').forEach(el=>{
    el.addEventListener('click', ()=>{ mgKeep[+el.dataset.mgk] = el.dataset.which; renderMerge(); });
  });
  box.querySelectorAll('[data-mgdo]').forEach(b=>{
    b.addEventListener('click', ()=> doMerge(+b.dataset.mgdo));
  });
}
async function doMerge(i){
  const pr = mgPairs[i];
  const keepWhich = mgKeep[i] || 'a';
  const keep = keepWhich === 'a' ? pr.a : pr.b;
  const drop = keepWhich === 'a' ? pr.b : pr.a;
  overrides[keep.id] = overrides[keep.id] || {};
  const K = overrides[keep.id], D = overrides[drop.id] || {};
  // fill only what the keeper is missing, so nothing you chose gets overwritten
  K.fields = K.fields || {};
  EDITABLE_FIELDS.forEach(f=>{
    if(!getField(keep,f) && getField(drop,f)) K.fields[f] = getField(drop,f);
  });
  const kn = getNotes(keep), dn = getNotes(drop);
  if(dn) K.notes = kn ? kn + '\n\n— merged from duplicate —\n' + dn : dn;
  if(K.tier === undefined && D.tier !== undefined) K.tier = D.tier;
  if(Array.isArray(D.callLog) && D.callLog.length){
    K.callLog = (K.callLog || []).concat(D.callLog).sort((a,b)=> String(b.ts||'').localeCompare(String(a.ts||'')));
  }
  attendance.forEach(a=>{ if(a.playerId === drop.id && !isAttending(keep.id, a.eventId)) a.playerId = keep.id; });
  attendance = attendance.filter(a=> a.playerId !== drop.id);
  await removePlayer(drop.id);
  const ok = (await saveOverrides()) && (await saveAttendance());
  mgPairs = findDuplicatePairs(); mgKeep = {};
  renderMerge();
  if(typeof renderHs === 'function') renderHs();
  alertBar(ok ? `Merged into ${getField(keep,'first')} ${getField(keep,'last')}.` : 'Merged on screen but could not save.', ok?'ok':undefined);
}
document.getElementById('mergeBtn').addEventListener('click', ()=>{
  mgPairs = findDuplicatePairs(); mgKeep = {};
  renderMerge();
  document.getElementById('scrim').classList.add('show');
  document.getElementById('mergeModal').classList.add('show');
});
document.getElementById('mgClose').addEventListener('click', closeDrawer);
document.getElementById('mgCancel').addEventListener('click', closeDrawer);
/* ---- printable event book ---- */
function buildEventBook(eventId, opts){
  opts = opts || {};
  const ev = eventById(eventId);
  if(!ev) return;
  const rows = attendeesOf(eventId).map(a=>({a,p:playerById(a.playerId)})).filter(x=>x.p)
    .sort((x,y)=> (TIER_SORT_INDEX[getTier(x.p)] ?? 9) - (TIER_SORT_INDEX[getTier(y.p)] ?? 9)
               || String(getField(x.p,'last')).localeCompare(String(getField(y.p,'last'))));
  const book = document.getElementById('printBook');
  book.innerHTML = `
    <div class="bk-head">
      <h1>${escAttr(ev.name)}</h1>
      <div class="bk-sub">${escAttr(fmtRange(ev))}${ev.location?' · '+escAttr(ev.location):''}${ev.division?' · '+escAttr(ev.division):''}
        &nbsp;|&nbsp; ${rows.length} player${rows.length===1?'':'s'} &nbsp;|&nbsp; printed ${escAttr(fmtStamp(new Date().toISOString()))}</div>
    </div>
    ${rows.map(({a,p})=>{
      const mx = METRICS.map(m=> getField(p,m.key) ? `${m.label} ${getField(p,m.key)}` : '').filter(Boolean).join('  ·  ');
      const contact = [getField(p,'phone'), getField(p,'email')].filter(Boolean).join('  ·  ');
      const notes = getNotes(p);
      return `<div class="bk-p">
        <div><span class="bk-t">${escAttr(TIER_DEFS[getTier(p)] ? TIER_DEFS[getTier(p)].short : '')}</span>
          <span class="bk-nm">${escAttr(getField(p,'first'))} ${escAttr(getField(p,'last'))}</span>
          ${autoMarks(p).join('')}${meetsAcademicBar(p)?' A+':''}</div>
        <div class="bk-meta">${escAttr([getField(p,'posDisplay'), getField(p,'bt'), getField(p,'height'),
            getField(p,'weight')?getField(p,'weight')+' lbs':'', getField(p,'state'), getField(p,'school'),
            a.team, getField(p,'gradClass')?"'"+String(getField(p,'gradClass')).slice(-2):''].filter(Boolean).join('  ·  '))}</div>
        ${mx ? `<div class="bk-mx">${escAttr(mx)}</div>` : ''}
        ${contact ? `<div class="bk-mx">${escAttr(contact)}</div>` : ''}
        ${opts.blank ? '<div class="bk-blank"></div>'
                     : (notes ? `<div class="bk-note">${escAttr(notes.slice(0,700))}</div>` : '<div class="bk-blank"></div>')}
      </div>`;
    }).join('') || '<p>Nobody on this roster yet.</p>'}`;
  book.classList.add('show');
  document.getElementById('bkBar').classList.add('show');
  document.getElementById('bkTitle').textContent =
    (opts.blank ? 'Blank note book — ' : 'Event book — ') + ev.name;
  tryPrint();
}
// Some previews refuse print(), so the book stays on screen either way and the
// bar says what to do instead of the button looking dead.
function tryPrint(){
  document.getElementById('bkHint').textContent =
    'No print dialog? This preview blocks it — download the file and open it in a browser tab.';
  try{ window.print(); }catch(e){ /* blocked; the book is still readable on screen */ }
}
function closeBook(){
  document.getElementById('printBook').classList.remove('show');
  document.getElementById('bkBar').classList.remove('show');
}
document.getElementById('bkPrint').addEventListener('click', tryPrint);
document.getElementById('bkClose').addEventListener('click', closeBook);
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape' && document.getElementById('printBook').classList.contains('show')) closeBook();
});
