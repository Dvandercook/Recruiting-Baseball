/* ==========================================================================
   Travel organizations.

   On rankings, plainly: there is no free, authoritative "every travel team,
   ranked" dataset. Perfect Game publishes team rankings by age group and those
   are their editorial product — we link out to them rather than copying them
   in. What this page is really for is YOUR tiers: which programs are worth a
   Saturday, which ones you trust when a coach vouches for a kid.

   Three ways orgs get here:
     1. A starter list of programs below — names only, deliberately not ranked.
     2. Built from your own board, off the travel team recorded on each event
        appearance. That is real data about who you actually see.
     3. Pasted in, including a ranked list if you have one from a subscription.
   ========================================================================== */
const ORGS_KEY = 'travel-orgs';
let travelOrgs = [];
let orgSort = { key:'name', dir:1 };

const ORG_TIERS = [
  { v:'A', label:'A — worth the trip' },
  { v:'B', label:'B — worth a look' },
  { v:'C', label:'C — rarely' },
  { v:'',  label:'— not set' },
];

// Names only. Not a ranking, not exhaustive, and deliberately not ordered —
// a starting point so the page isn't empty on day one.
const SEED_ORGS = [
  'Canes Baseball', 'East Cobb Baseball', 'Marucci Elite', 'Scorpions Baseball',
  '5 Star National', 'Team Elite', 'FTB (Florida Travel Ball)', 'Banditos Baseball',
  'Dallas Tigers', 'CBA Marucci', 'Ostingers Baseball Academy', 'Prime Baseball',
  'Show Baseball', 'Midland Redskins', 'Stars National', 'Trosky Baseball',
  'NorCal Baseball', 'Cangelosi Sparks', 'Hitters Baseball', 'Top Tier Baseball',
  'Texas Twelve', 'Ninth Inning Royals', 'Tri-State Arsenal', 'Mid Atlantic Red Sox',
  'Baseball Northwest', 'Colorado Cyclones', 'Utah Marshals', 'Ascent Athletics',
  'Team Extra Innings', 'Northeast Baseball', 'Zoned Sports Academy', 'Evoshield Canes',
];

async function loadOrgs(){
  try{
    const raw = await Store.get(ORGS_KEY);
    travelOrgs = raw ? JSON.parse(raw) : [];
  }catch(e){ travelOrgs = []; }
  if(!Array.isArray(travelOrgs)) travelOrgs = [];
}
async function saveOrgs(){ return Store.set(ORGS_KEY, JSON.stringify(travelOrgs)); }

function orgKey(name){ return String(name||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
function orgByName(name){
  const k = orgKey(name);
  return travelOrgs.find(o=> orgKey(o.name) === k);
}
function addOrg(name, extra){
  name = String(name||'').trim();
  if(!name || orgByName(name)) return null;
  const o = Object.assign({ id:'org-' + orgKey(name) + '-' + travelOrgs.length,
                            name:name, region:'', tier:'', rank:'', notes:'' }, extra || {});
  travelOrgs.push(o);
  return o;
}

/* Who from your board plays for a program. Attendance carries the travel team
   per appearance, which is the honest source — a player's Team field on this
   board is his PBR Future Games state squad, not a club. */
function orgPlayerIds(name){
  const k = orgKey(name);
  const ids = new Set();
  attendance.forEach(a=>{ if(a.team && orgKey(a.team) === k) ids.add(a.playerId); });
  allPlayers().forEach(p=>{ if(orgKey(getField(p,'team')) === k) ids.add(p.id); });
  return [...ids].filter(id=> playerById(id));
}
function orgEventCount(name){
  const k = orgKey(name);
  return new Set(attendance.filter(a=> orgKey(a.team) === k).map(a=> a.eventId)).size;
}
// Tier tallies for the recruits at a program: how good are their guys, really.
function orgTierTally(ids){
  const out = {};
  ids.forEach(id=>{ const p = playerById(id); if(!p) return;
    const t = getTier(p); out[t] = (out[t]||0) + 1; });
  return TIERS.filter(t=> out[t]).map(t=>
    `<span class="og-t tier-${TIER_DEFS[t].cls}">${TIER_DEFS[t].short} ${out[t]}</span>`).join('');
}

function renderOrgs(){
  const q = document.getElementById('ogSearch').value.trim().toLowerCase();
  const onlySet = document.getElementById('ogOnlyTiered').checked;
  let list = travelOrgs.filter(o=>{
    if(onlySet && !o.tier) return false;
    if(q && !(o.name + ' ' + (o.region||'')).toLowerCase().includes(q)) return false;
    return true;
  });
  const rows = list.map(o=>{
    const ids = orgPlayerIds(o.name);
    return { o, n:ids.length, ids, ev:orgEventCount(o.name) };
  });
  const k = orgSort.key, dir = orgSort.dir;
  rows.sort((a,b)=>{
    let r;
    if(k === 'players')   r = a.n - b.n;
    else if(k === 'rank') r = (parseInt(a.o.rank,10) || 9999) - (parseInt(b.o.rank,10) || 9999);
    else if(k === 'tier') r = String(a.o.tier || 'ZZ').localeCompare(String(b.o.tier || 'ZZ'));
    else r = String(a.o.name).localeCompare(String(b.o.name));
    return r * dir || String(a.o.name).localeCompare(String(b.o.name));
  });

  document.getElementById('ogCount').textContent =
    `${rows.length} of ${travelOrgs.length} program${travelOrgs.length===1?'':'s'}`;

  const body = document.getElementById('ogBody');
  if(!travelOrgs.length){
    body.innerHTML = `<div class="sec-empty"><h4>No programs yet</h4>
      <p>Load the starter list, build the list from the travel teams already on your event
         rosters, or paste one in.</p></div>`;
    return;
  }
  body.innerHTML = rows.map(({o, n, ids, ev}, i)=>`
    <div class="og-row" data-org="${escAttr(o.id)}">
      <div class="og-nm">
        <input class="og-name" data-of="name" data-id="${escAttr(o.id)}" value="${escAttr(o.name)}">
        <input class="og-region" data-of="region" data-id="${escAttr(o.id)}"
               value="${escAttr(o.region)}" placeholder="region">
      </div>
      <select class="og-tier t${escAttr(o.tier||'none')}" data-of="tier" data-id="${escAttr(o.id)}">
        ${ORG_TIERS.map(t=>`<option value="${t.v}" ${t.v===(o.tier||'')?'selected':''}>${t.label}</option>`).join('')}
      </select>
      <input class="og-rank" data-of="rank" data-id="${escAttr(o.id)}" value="${escAttr(o.rank)}"
             placeholder="—" title="National rank, if you track one">
      <div class="og-players">
        ${n ? `<button class="og-n" data-ogshow="${escAttr(o.id)}">${n} recruit${n===1?'':'s'}</button>
               ${orgTierTally(ids)}` : '<span class="og-none">none yet</span>'}
        ${ev ? `<span class="og-ev">${ev} event${ev===1?'':'s'}</span>` : ''}
      </div>
      <input class="og-notes" data-of="notes" data-id="${escAttr(o.id)}"
             value="${escAttr(o.notes)}" placeholder="who to talk to, what you think…">
      <button class="og-x" data-ogdel="${escAttr(o.id)}" title="Remove">✕</button>
    </div>`).join('');

  body.querySelectorAll('[data-of]').forEach(el=>{
    el.addEventListener('change', async ()=>{
      const o = travelOrgs.find(x=> x.id === el.dataset.id);
      if(!o) return;
      o[el.dataset.of] = el.value.trim();
      const ok = await saveOrgs();
      if(el.dataset.of === 'tier' || el.dataset.of === 'rank') renderOrgs();
      flashSaved(ok);
    });
  });
  body.querySelectorAll('[data-ogdel]').forEach(b=>{
    b.addEventListener('click', async ()=>{
      if(b.dataset.arm !== '1'){
        b.dataset.arm = '1'; b.textContent = 'remove?';
        setTimeout(()=>{ if(b.isConnected && b.dataset.arm==='1'){ b.dataset.arm='0'; b.textContent='✕'; } }, 4000);
        return;
      }
      travelOrgs = travelOrgs.filter(x=> x.id !== b.dataset.ogdel);
      flashSaved(await saveOrgs());
      renderOrgs();
    });
  });
  body.querySelectorAll('[data-ogshow]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const o = travelOrgs.find(x=> x.id === b.dataset.ogshow);
      const ids = orgPlayerIds(o.name);
      goTo('hs');
      document.getElementById('searchInput').value = o.name;
      searchTerm = o.name.toLowerCase();
      if(typeof renderHs === 'function') renderHs();
      alertBar(`${ids.length} recruit${ids.length===1?'':'s'} tied to ${o.name}.`, 'ok');
    });
  });
}

/* ---- building the list ---- */
async function orgsFromBoard(){
  const found = new Map();
  attendance.forEach(a=>{ if(a.team && a.team.trim()) found.set(orgKey(a.team), a.team.trim()); });
  let added = 0;
  found.forEach(name=>{ if(addOrg(name)) added++; });
  const ok = await saveOrgs();
  renderOrgs();
  alertBar(added
    ? `${added} program${added===1?'':'s'} added from your event rosters.`
    : 'Nothing new — every travel team on your rosters is already listed.', ok ? 'ok' : undefined);
}
async function orgsSeed(){
  let added = 0;
  SEED_ORGS.forEach(n=>{ if(addOrg(n)) added++; });
  const ok = await saveOrgs();
  renderOrgs();
  alertBar(added ? `${added} program${added===1?'':'s'} added. Set your own tiers — these are names only, not a ranking.`
                 : 'They are all on the list already.', ok ? 'ok' : undefined);
}

// Accepts "1. Canes National", "1 Canes", "Canes National — NC", or a bare list.
// A leading number is taken as the rank; otherwise position in the list is.
function parseOrgLines(text){
  return String(text||'').split('\n').map(l=> l.trim()).filter(Boolean).map((line, i)=>{
    let rank = '', name = line, region = '';
    const m = line.match(/^(\d{1,3})[.)\]]?\s+(.*)$/);
    if(m){ rank = m[1]; name = m[2]; }
    const r = name.match(/[—\-–|,]\s*([A-Za-z .]{2,20})$/);
    if(r && /^[A-Z]{2}$/.test(r[1].trim())){ region = r[1].trim(); name = name.slice(0, r.index).trim(); }
    return { rank, name: name.replace(/\s{2,}/g,' ').trim(), region, order: i + 1 };
  }).filter(x=> x.name);
}
async function applyOrgPaste(){
  const useOrder = document.getElementById('ogUseOrder').checked;
  const rows = parseOrgLines(document.getElementById('ogPasteText').value);
  let added = 0, ranked = 0;
  rows.forEach(r=>{
    const rank = r.rank || (useOrder ? String(r.order) : '');
    let o = orgByName(r.name);
    if(!o){ o = addOrg(r.name, { region:r.region, rank:rank }); if(o) added++; }
    else { if(rank){ o.rank = rank; } if(r.region && !o.region) o.region = r.region; }
    if(rank) ranked++;
  });
  const ok = await saveOrgs();
  closeDrawer();
  renderOrgs();
  alertBar(`${added} added, ${ranked} ranked from ${rows.length} line${rows.length===1?'':'s'}.`,
           ok ? 'ok' : undefined);
}

function exportOrgs(){
  const cols = ['Program','Region','Your Tier','Rank','Recruits','Events','Notes'];
  const out = [cols.map(csvCell).join(',')];
  travelOrgs.slice().sort((a,b)=> String(a.name).localeCompare(String(b.name))).forEach(o=>{
    out.push([o.name, o.region, o.tier, o.rank,
              orgPlayerIds(o.name).length, orgEventCount(o.name), o.notes].map(csvCell).join(','));
  });
  downloadText('travel-organizations.csv', out.join('\r\n'), 'text/csv;charset=utf-8;');
}

/* ---- wiring ---- */
document.getElementById('ogSearch').addEventListener('input', renderOrgs);
document.getElementById('ogOnlyTiered').addEventListener('change', renderOrgs);
document.getElementById('ogSeed').addEventListener('click', orgsSeed);
document.getElementById('ogFromBoard').addEventListener('click', orgsFromBoard);
document.getElementById('ogExport').addEventListener('click', exportOrgs);
document.getElementById('ogAdd').addEventListener('click', async ()=>{
  const inp = document.getElementById('ogNew');
  const name = inp.value.trim();
  if(!name) return;
  if(!addOrg(name)){ alertBar('That program is already on the list.'); return; }
  inp.value = '';
  flashSaved(await saveOrgs());
  renderOrgs();
});
document.getElementById('ogNew').addEventListener('keydown', e=>{
  if(e.key === 'Enter') document.getElementById('ogAdd').click();
});
document.getElementById('ogPasteBtn').addEventListener('click', ()=>{
  document.getElementById('ogPasteText').value = '';
  document.getElementById('scrim').classList.add('show');
  document.getElementById('ogPasteModal').classList.add('show');
});
document.getElementById('ogPasteApply').addEventListener('click', applyOrgPaste);
document.getElementById('ogPasteClose').addEventListener('click', closeDrawer);
document.getElementById('ogPasteCancel').addEventListener('click', closeDrawer);
document.querySelectorAll('#ogHeads [data-ogsort]').forEach(h=>{
  h.addEventListener('click', ()=>{
    const k = h.dataset.ogsort;
    orgSort = { key:k, dir: orgSort.key === k ? -orgSort.dir : 1 };
    document.querySelectorAll('#ogHeads [data-ogsort]').forEach(x=>{
      x.classList.toggle('sorted', x === h);
      x.dataset.dir = x === h ? (orgSort.dir > 0 ? 'up' : 'down') : '';
    });
    renderOrgs();
  });
});
