/* ==========================================================================
   High School Recruiting — Big Board / Grid
   ========================================================================== */
const VIEW_KEY = 'hs-view-prefs';
let hsMode = 'board';               // 'board' | 'grid'
let groupBy = 'pos';
const F = { class:new Set(), pos:new Set(), tier:new Set(), bats:new Set(), minHt:0, minWt:0 };

const GROUPS = [
  { id:'pos',    label:'Position',    of:p=> getPosPrimary(p) || 'Unlisted',
    order:['RHP','LHP','C','INF','OF'] },
  { id:'grad',   label:'Grad',        of:p=> String(getField(p,'gradClass') || 'No class') },
  { id:'state',  label:'State',       of:p=> getField(p,'state') || 'No state' },
  { id:'team',   label:'Summer team', of:p=> getField(p,'team') || 'No team' },
  { id:'school', label:'High school', of:p=> getField(p,'school') || 'No school' },
  { id:'commit', label:'Commit',      of:p=> getField(p,'commit') || 'Uncommitted' },
  { id:'coach',  label:'Coach',       of:p=> getField(p,'coach')  || 'Unassigned' },
];
const BATS_OF = p => String(getField(p,'bt') || '').trim().charAt(0).toUpperCase();
function htInches(p){
  const m = String(getField(p,'height') || '').match(/^(\d+)\s*-\s*(\d+)/);
  return m ? (+m[1]) * 12 + (+m[2]) : null;
}
function htLabel(n){ return n ? `${Math.floor(n/12)}-${n%12}` : ''; }
// "Rated" = a tier that means something: one you set yourself, or the Top Lion
// flag that came across from the sheet. The plain tier-2 default is "not looked
// at yet" and shows as —.
function isRated(p){
  const o = overrides[p.id];
  if(o && TIERS.includes(o.tier)) return true;
  return !!p.topLion;
}
function tierOrUnrated(p){ return isRated(p) ? getTier(p) : '—'; }

function activeFilterCount(){
  return F.class.size + F.pos.size + F.tier.size + F.bats.size + (F.minHt?1:0) + (F.minWt?1:0);
}
function passesFilters(p){
  if(F.class.size && !F.class.has(String(getField(p,'gradClass')))) return false;
  if(F.pos.size   && !F.pos.has(getPosPrimary(p))) return false;
  if(F.tier.size  && !F.tier.has(tierOrUnrated(p))) return false;
  if(F.bats.size  && !F.bats.has(BATS_OF(p))) return false;
  if(F.minHt){ const h = htInches(p); if(h === null || h < F.minHt) return false; }
  if(F.minWt){ const w = parseFloat(getField(p,'weight')); if(!w || w < F.minWt) return false; }
  return true;
}
// Search covers name, school, summer team and commit — as labelled in the box.
function bbMatchesSearch(p){
  if(!searchTerm) return true;
  return [getField(p,'first'), getField(p,'last'), getField(p,'school'), getField(p,'team'),
          getField(p,'commit'), getField(p,'coach'), getField(p,'state'), getField(p,'posDisplay'),
          getLog(p).map(e=>e.text).join(' ')]
    .join(' ').toLowerCase().includes(searchTerm);
}
function boardPlayers(){
  return poolPlayers().filter(p=> passesFilters(p) && bbMatchesSearch(p));
}
async function saveViewPrefs(){
  return Store.set(VIEW_KEY, JSON.stringify({
    hsMode, groupBy,
    class:[...F.class], pos:[...F.pos], tier:[...F.tier], bats:[...F.bats],
    minHt:F.minHt, minWt:F.minWt,
  }));
}
async function loadViewPrefs(){
  try{
    const raw = await Store.get(VIEW_KEY);
    if(!raw) return;
    const v = JSON.parse(raw);
    hsMode = v.hsMode === 'grid' ? 'grid' : 'board';
    groupBy = GROUPS.some(g=>g.id===v.groupBy) ? v.groupBy : 'pos';
    ['class','pos','tier','bats'].forEach(k=> (v[k]||[]).forEach(x=> F[k].add(x)));
    F.minHt = +v.minHt || 0;
    F.minWt = +v.minWt || 0;
  }catch(e){ /* defaults are fine */ }
}
function chip(kind, value, label, on){
  return `<button class="fchip ${kind==='grp'?'grp':''} ${on?'on':''}" data-f="${kind}" data-v="${escAttr(value)}">${escAttr(label)}</button>`;
}
function renderFilterPanel(){
  const all = poolPlayers();
  const classes = [...new Set(all.map(p=>String(getField(p,'gradClass'))).filter(v=>v && v!=='undefined'))].sort();
  document.getElementById('flClass').innerHTML =
    classes.map(c=> chip('class', c, c, F.class.has(c))).join('') ||
    '<span class="bb-empty" style="padding:6px 0">no class data</span>';
  document.getElementById('flPos').innerHTML =
    ['LHP','RHP','C','INF','OF'].map(v=> chip('pos', v, v, F.pos.has(v))).join('');
  document.getElementById('flTier').innerHTML =
    TIERS.map(t=> chip('tier', t, t, F.tier.has(t))).join('') + chip('tier','—','—', F.tier.has('—'));
  document.getElementById('flBats').innerHTML =
    ['L','R','S'].map(v=> chip('bats', v, v, F.bats.has(v))).join('');
  document.getElementById('flGroup').innerHTML =
    GROUPS.map(g=> chip('grp', g.id, g.label, groupBy===g.id)).join('');
  document.getElementById('flHt').value = F.minHt;
  document.getElementById('flWt').value = F.minWt;
  document.getElementById('htLabel').textContent = F.minHt ? `Ht ${htLabel(F.minHt)}+` : 'Ht any';
  document.getElementById('wtLabel').textContent = F.minWt ? `Wt ${F.minWt}+` : 'Wt any';
  const n = activeFilterCount();
  const btn = document.getElementById('bbFiltersBtn');
  btn.textContent = `Filters (${n})`;
  btn.classList.toggle('on', n > 0);
}
function renderBoard(){
  const list = boardPlayers();
  const g = GROUPS.find(x=>x.id===groupBy) || GROUPS[0];
  const buckets = new Map();
  list.forEach(p=>{
    const k = g.of(p);
    if(!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(p);
  });
  let keys = [...buckets.keys()];
  if(g.order){
    keys.sort((a,b)=>{
      const ia = g.order.indexOf(a), ib = g.order.indexOf(b);
      return (ia<0?99:ia) - (ib<0?99:ib) || a.localeCompare(b);
    });
  }else{
    // biggest groups first, but keep the "none" bucket last
    keys.sort((a,b)=> (buckets.get(b).length - buckets.get(a).length) || a.localeCompare(b));
    keys = keys.filter(k=>!/^(No |Uncommitted|Unlisted)/.test(k)).concat(keys.filter(k=>/^(No |Uncommitted|Unlisted)/.test(k)));
  }
  const wrap = document.getElementById('bbWrap');
  if(!list.length){
    wrap.innerHTML = `<div class="bb-none">No players match these filters.<br>
      <button class="fl-reset" style="margin-top:14px" id="bbClear">Clear all filters</button></div>`;
    document.getElementById('bbClear').addEventListener('click', clearFilters);
    return;
  }
  const stack = keys.length > 8;   // too many groups for side-by-side columns
  wrap.className = 'bb-wrap active' + (stack ? ' bb-stack' : '');
  wrap.innerHTML = `<div class="bb-cols">` + keys.map(k=>{
    const players = buckets.get(k).slice().sort((a,b)=>{
      const ta = TIER_SORT_INDEX[getTier(a)] ?? 9, tb = TIER_SORT_INDEX[getTier(b)] ?? 9;
      return (isRated(b) - isRated(a)) || (ta - tb) ||
             String(getField(a,'last')).localeCompare(String(getField(b,'last')));
    });
    return `<div class="bb-col">
      <div class="bb-col-head"><h4>${escAttr(k)}</h4><span class="n">${players.length}</span></div>
      <div class="bb-list">${players.map(p=>{
        const t = getTier(p), td = TIER_DEFS[t] || TIER_DEFS['2'];
        const meta = [getField(p,'posDisplay'), getField(p,'state'), getField(p,'school')].filter(Boolean).join(' · ');
        const x = getField(p,'xLink');
        return `<div class="bb-card" data-open-id="${p.id}">
          <div class="bb-tier tier-${td.cls}" title="${escAttr(td.label)}">${isRated(p)?td.short:'—'}</div>
          <div class="bb-info">
            <div class="bb-nm">${escAttr(getField(p,'first'))} ${escAttr(getField(p,'last'))}${marksHtml(p)}</div>
            <div class="bb-meta">${escAttr(meta || '—')}</div>
          </div>
          ${x ? `<a class="icon-btn bb-x" href="${escAttr(x)}" target="_blank" rel="noopener"
                   onclick="event.stopPropagation()" title="X profile — ${escAttr(getField(p,'first'))} ${escAttr(getField(p,'last'))}"
                   ><svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.6 8.7L23.3 22h-6.7l-5.2-6.8L5.4 22H2.3l8.2-9.4L1 2h6.9l4.7 6.2zm-1.2 18h1.9L7.4 4H5.3z"/></svg></a>` : ''}
        </div>`;
      }).join('') || '<div class="bb-empty">none</div>'}</div>
    </div>`;
  }).join('') + `</div>`;
  wrap.querySelectorAll('[data-open-id]').forEach(c=>{
    c.addEventListener('click', ()=> openDrawer(c.dataset.openId));
  });
}
function renderHsStat(){
  const all = poolPlayers();
  const shown = boardPlayers().length;
  const rated = all.filter(isRated).length;
  document.getElementById('bbStat').textContent = `${shown}/${all.length} players · ${rated} rated`;
}
function renderHs(){
  renderFilterPanel();
  renderHsStat();
  document.getElementById('bbWrap').classList.toggle('active', hsMode === 'board');
  document.getElementById('hsGridLayout').style.display = hsMode === 'grid' ? 'flex' : 'none';
  document.getElementById('hsModeSeg').querySelectorAll('button')
    .forEach(b=> b.classList.toggle('active', b.dataset.mode === hsMode));
  if(hsMode === 'board') renderBoard();
  else renderAll();
}
function clearFilters(){
  ['class','pos','tier','bats'].forEach(k=> F[k].clear());
  F.minHt = 0; F.minWt = 0;
  saveViewPrefs(); renderHs();
}
document.getElementById('hsModeSeg').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return;
  hsMode = b.dataset.mode; saveViewPrefs(); renderHs();
});
document.getElementById('bbFiltersBtn').addEventListener('click', ()=>{
  document.getElementById('bbPanel').classList.toggle('open');
});
document.getElementById('bbPanel').addEventListener('click', e=>{
  const c = e.target.closest('.fchip'); if(!c) return;
  const kind = c.dataset.f, v = c.dataset.v;
  if(kind === 'grp'){ groupBy = v; }
  else { F[kind].has(v) ? F[kind].delete(v) : F[kind].add(v); }
  saveViewPrefs(); renderHs();
});
document.getElementById('flHt').addEventListener('input', e=>{ F.minHt = +e.target.value; renderHs(); });
document.getElementById('flWt').addEventListener('input', e=>{ F.minWt = +e.target.value; renderHs(); });
['flHt','flWt'].forEach(id=> document.getElementById(id).addEventListener('change', saveViewPrefs));
document.getElementById('flReset').addEventListener('click', clearFilters);
// the existing search box drives both views
document.getElementById('searchInput').addEventListener('input', ()=>{ if(hsMode==='board') renderHs(); });
document.getElementById('searchInput').placeholder = 'Search name / school / team / commit';
