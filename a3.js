const POS_ORDER = ["RHP","LHP","C","INF","OF","UNK"];
const POS_LABELS = {RHP:"RHP",LHP:"LHP",C:"Catcher",INF:"Infield",OF:"Outfield",UNK:"Unlisted"};
let overrides = {}; // {id: {tier, notes}}
let customPlayers = []; // player-added-in-app records
let groupMode = 'pos'; // 'pos' or 'tier'
let activePos = null;
let activeTier = null;
let searchTerm = "";
let currentPlayerId = null;
const STORAGE_KEY = "player-overrides";
const CUSTOM_KEY = "custom-players";
const TIER_SCALE_KEY = "tier-scale-version";
const REMOVED_KEY = "removed-players";
const CALLLOG_KEY = "calllog-migrated";
const ATTEND_KEY = "event-attendance";
const MARKS_KEY  = "auto-mark-rules";
const ACAD_KEY   = "academic-bar";
const TIERS = ["C","1","2","3","4","XX","X","E"];
const TIER_DEFS = {
  "C":  { short:"C",  label:"Committed",                     cls:"commit"   },
  "1":  { short:"1",  label:"Top Lion",                       cls:"gold"     },
  "2":  { short:"2",  label:"Guy To See",                     cls:"turf"     },
  "3":  { short:"3",  label:"Need To See More",               cls:"dirt"     },
  "4":  { short:"4",  label:"Recommended To Us / Emailed",    cls:"slate"    },
  "XX": { short:"XX", label:"Not A Guy",                      cls:"danger"   },
  "X":  { short:"X",  label:"Not Interested",                 cls:"violet"   },
  "E":  { short:"E",  label:"Committed Elsewhere",            cls:"elsewhere"},
};
const TIER_SORT_INDEX = { "C":0, "1":1, "2":2, "3":3, "4":4, "XX":5, "X":6, "E":7 };
// Duplicate records folded into a single player. Any tier/notes previously saved
// against the absorbed id is re-pointed at the surviving record on load.
const MERGED_IDS = {
  "bailey-brock-14":    "bailey-brock-13",
  "ehrenkrenz-owen-66": "ehrenkranz-owen-65",
  "shaffer-michael-249":"schaffer-michael-246",
};
function remapMergedIds(store){
  let changed = false;
  Object.keys(MERGED_IDS).forEach(oldId=>{
    if(!(oldId in store)) return;
    const newId = MERGED_IDS[oldId];
    const from = store[oldId] || {};
    const to   = store[newId] || {};
    // survivor's own values win; only fill what it doesn't already have
    if(to.tier === undefined && from.tier !== undefined) to.tier = from.tier;
    if(from.notes){
      to.notes = to.notes ? (to.notes.trim() + "\n" + from.notes.trim()) : from.notes;
    }
    if(from.fields){
      to.fields = Object.assign({}, from.fields, to.fields || {});
    }
    store[newId] = to;
    delete store[oldId];
    changed = true;
  });
  return changed;
}
/* Two separate pools of players share one board and one set of tools. A record
   with no pool is a high-school recruit, so nothing already saved has to move. */
let POOL = 'hs';                       // 'hs' | 'transfer'
const POOL_LABEL = { hs:'High School Recruiting', transfer:'Transfer Recruiting' };
function poolOf(p){ return (p && p.pool) || 'hs'; }
function poolPlayers(){ return allPlayers().filter(p=> poolOf(p) === POOL); }

const COACH_KEY = 'coaches';
let coaches = [];                      // [{id, initials, name}]
async function loadCoaches(){
  try{
    const raw = await Store.get(COACH_KEY);
    coaches = raw ? JSON.parse(raw) : [];
  }catch(e){ coaches = []; }
  if(!Array.isArray(coaches)) coaches = [];
}
async function saveCoaches(){ return Store.set(COACH_KEY, JSON.stringify(coaches)); }
function coachById(id){ return coaches.find(c=> c.id === id); }
function coachLabel(id){
  const c = coachById(id);
  return c ? (c.initials || c.name) : '';
}
// A <select> of the staff, used by tasks, the calendar and event coverage.
function coachOptions(selected, blankLabel){
  return `<option value="">${escAttr(blankLabel || '— unassigned —')}</option>` +
    coaches.map(c=> `<option value="${escAttr(c.id)}" ${c.id===selected?'selected':''}>`
      + `${escAttr(c.name || c.initials)}</option>`).join('');
}
let removedIds = [];   // ids hidden from the board (base records can be restored)
function allPlayers(){
  const gone = new Set(removedIds);
  return PLAYERS.concat(customPlayers).filter(p=> !gone.has(p.id));
}
async function loadRemoved(){
  try{
    const raw = await Store.get(REMOVED_KEY);
    removedIds = raw ? JSON.parse(raw) : [];
  }catch(e){ removedIds = []; }
}
async function saveRemoved(){ return Store.set(REMOVED_KEY, JSON.stringify(removedIds)); }
/* Removes a player. Records added in-app are deleted outright; original roster
   records are hidden and can be brought back from the sidebar. */
async function removePlayer(id){
  const wasCustom = customPlayers.some(p=>p.id===id);
  let ok;
  if(wasCustom){
    customPlayers = customPlayers.filter(p=>p.id!==id);
    delete overrides[id];
    ok = (await saveCustomPlayers()) && (await saveOverrides());
  }else{
    if(!removedIds.includes(id)) removedIds.push(id);
    ok = await saveRemoved();
  }
  return ok;
}
async function restoreRemoved(){
  removedIds = [];
  return saveRemoved();
}
/* ---- CSV ----------------------------------------------------------------- */
// Splits CSV text into rows, honouring quoted fields, escaped quotes and
// newlines inside quotes.
function parseCSV(text){
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = []; let field = ''; let inQuotes = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i++; }
        else inQuotes = false;
      }else field += c;
    }else{
      if(c === '"') inQuotes = true;
      else if(c === ','){ row.push(field); field = ''; }
      else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
      else if(c === '\r'){ /* ignore */ }
      else field += c;
    }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  return rows.filter(r=> r.some(v=> String(v).trim() !== ''));
}
const CSV_HEADER_MAP = {
  firstname:'first', first:'first', fname:'first', givenname:'first',
  lastname:'last', last:'last', lname:'last', surname:'last',
  name:'fullname', playername:'fullname', fullname:'fullname',
  position:'posDisplay', pos:'posDisplay', positions:'posDisplay',
  tier:'tier', rank:'tier', priority:'tier',
  school:'school', highschool:'school', hs:'school',
  team:'team', teamprogram:'team', program:'team', club:'team',
  gradclass:'gradClass', grad:'gradClass', class:'gradClass', gradyear:'gradClass', year:'gradClass',
  bt:'bt', batsthrows:'bt', bats:'bt',
  height:'height', ht:'height',
  weight:'weight', wt:'weight',
  gpa:'gpa',
  address:'address', street:'address',
  city:'city',
  state:'state', st:'state',
  zip:'zip', zipcode:'zip', postalcode:'zip',
  phone:'phone', phonenumber:'phone', cell:'phone', mobile:'phone',
  phonenotes:'phoneNotes',
  email:'email', emailaddress:'email',
  xtwitter:'xLink', x:'xLink', twitter:'xLink', handle:'xLink', xhandle:'xLink', twitterhandle:'xLink', video:'xLink',
  perfectgame:'pgLink', pg:'pgLink', pgprofile:'pgLink', perfectgameprofile:'pgLink', pglink:'pgLink',
  pbr:'pbrLink', pbrprofile:'pbrLink', prepbaseballreport:'pbrLink', prepbaseballreportprofile:'pbrLink', pbrlink:'pbrLink',
  commit:'commit', commitment:'commit', committedto:'commit', college:'commit', school2:'commit',
  coach:'coach', coachassigned:'coach', assignedcoach:'coach', recruiter:'coach', assignedto:'coach',
  '60':'m60', sixty:'m60', sixtytime:'m60', sixtyyard:'m60', run60:'m60',
  ev:'mEV', exitvelo:'mEV', exitvelocity:'mEV', exit:'mEV',
  fb:'mFB', fbvelo:'mFB', fbmax:'mFB', fastball:'mFB', pitchvelo:'mFB', velo:'mFB',
  pop:'mPop', poptime:'mPop',
  cvelo:'mC', catchervelo:'mC',
  ofvelo:'mOF', outfieldvelo:'mOF',
  infvelo:'mINF', infieldvelo:'mINF',
  batspeed:'mBat', btsp:'mBat', barrelspeed:'mBat',
  originnotes:'originNotes', origin:'originNotes', source:'originNotes',
  scoutingnotes:'notes', notes:'notes', note:'notes', comments:'notes',
};
function normHeader(h){ return String(h||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
// Signature used to spot a row that is already on the board.
function dupeKeys(rec){
  const keys = [];
  const h = String(rec.xLink||'').toLowerCase().match(/x\.com\/([a-z0-9_]+)/);
  if(h) keys.push('x:'+h[1]);
  const d = String(rec.phone||'').replace(/\D/g,'');
  if(d.length >= 10) keys.push('p:'+d.slice(-10));
  const n = (String(rec.first||'')+String(rec.last||'')).toLowerCase().replace(/[^a-z]/g,'');
  if(n) keys.push('n:'+n);
  return keys;
}
function buildDupeIndex(){
  const idx = new Map();
  allPlayers().forEach(p=>{
    dupeKeys({ xLink:getField(p,'xLink'), phone:getField(p,'phone'),
               first:getField(p,'first'), last:getField(p,'last') })
      .forEach(k=> { if(!idx.has(k)) idx.set(k, p); });
  });
  return idx;
}
// Turns parsed CSV rows into candidate records, flagging blanks and duplicates.
function mapCsvRows(rows, opts){
  opts = opts || {};
  const headers = rows[0].map(normHeader).map(h=> CSV_HEADER_MAP[h] || null);
  const idx = buildDupeIndex();
  const seenInFile = new Map();
  const out = [];
  for(let r = 1; r < rows.length; r++){
    const rec = {};
    rows[r].forEach((cell, c)=>{
      const key = headers[c];
      if(!key) return;
      const v = String(cell == null ? '' : cell).trim();
      if(v !== '') rec[key] = v;
    });
    if(rec.fullname && !rec.first && !rec.last){
      const parts = rec.fullname.split(/\s+/);
      rec.first = parts.shift() || '';
      rec.last  = parts.join(' ');
    }
    delete rec.fullname;
    const item = { row: r + 1, rec, status: 'new', why: '' };
    if(!rec.first || !rec.last){
      item.status = 'bad'; item.why = 'missing name';
    }else if(!rec.posDisplay){
      item.status = 'bad'; item.why = 'missing position';
    }else{
      const keys = dupeKeys(rec);
      const hitKey = keys.find(k=> idx.has(k));
      const fileKey = keys.find(k=> seenInFile.has(k));
      if(hitKey){
        const p = idx.get(hitKey);
        item.status = 'dup';
        item.why = 'matches ' + getField(p,'first') + ' ' + getField(p,'last') +
                   ' (' + (hitKey.startsWith('x:') ? 'same X handle' : hitKey.startsWith('p:') ? 'same phone' : 'same name') + ')';
      }else if(fileKey){
        item.status = 'dup';
        item.why = 'repeated at row ' + seenInFile.get(fileKey);
      }else{
        keys.forEach(k=> seenInFile.set(k, r + 1));
      }
    }
    out.push(item);
  }
  return out;
}
function primaryPos(pos){
  if(!pos) return 'UNK';
  const p = pos.split(/[\/,]/)[0].trim().toUpperCase();
  if(['SS','3B','2B','1B','IF'].includes(p)) return 'INF';
  return p || 'UNK';
}
/* ---- storage -------------------------------------------------------------
   Tries the host storage API first, then this browser's localStorage, then
   falls back to memory-only. Every write reports whether it actually landed,
   so the UI can tell the truth instead of always claiming "Saved".
--------------------------------------------------------------------------- */
const Store = {
  mode: 'memory',          // 'host' | 'local' | 'memory'
  mem: {},
  async init(){
    const probe = '__rb_probe__';
    if(typeof window !== 'undefined' && window.storage && typeof window.storage.set === 'function'){
      try{
        await window.storage.set(probe, '1', false);
        await window.storage.get(probe, false);
        this.mode = 'host';
        return this.mode;
      }catch(e){ /* fall through */ }
    }
    try{
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      this.mode = 'local';
      return this.mode;
    }catch(e){ /* fall through */ }
    this.mode = 'memory';
    return this.mode;
  },
  async get(key){
    try{
      if(this.mode === 'host'){
        const res = await window.storage.get(key, false);
        return (res && res.value != null) ? res.value : null;
      }
      if(this.mode === 'local') return localStorage.getItem(key);
    }catch(e){ console.warn('storage read failed, using memory copy', e); }
    return this.mem[key] != null ? this.mem[key] : null;
  },
  // Keys that belong to the whole staff. View preferences and one-time
  // migration flags are deliberately not in here — those stay per device.
  synced: ["player-overrides","custom-players","removed-players","event-attendance",
           "auto-mark-rules","academic-bar","events-store","team-roster","travel-orgs","coaches","tasks","cal-entries","event-games"],
  async set(key, value){
    this.mem[key] = value;              // memory copy always stays current
    if(this.synced.indexOf(key) >= 0 && typeof Cloud !== 'undefined' && Cloud) Cloud.schedulePush();
    try{
      if(this.mode === 'host'){ await window.storage.set(key, value, false); return true; }
      if(this.mode === 'local'){ localStorage.setItem(key, value); return true; }
    }catch(e){ console.error('storage write failed', e); return false; }
    return false;                       // memory-only: not durable
  },
  get persists(){ return this.mode !== 'memory'; }
};
async function loadCustomPlayers(){
  try{
    const raw = await Store.get(CUSTOM_KEY);
    if(raw){ customPlayers = JSON.parse(raw); }
  }catch(e){ customPlayers = []; }
}
async function saveCustomPlayers(){
  return Store.set(CUSTOM_KEY, JSON.stringify(customPlayers));
}
async function loadOverrides(){
  try{
    const raw = await Store.get(STORAGE_KEY);
    if(raw){ overrides = JSON.parse(raw); }
  }catch(e){ overrides = {}; }
  // fold rankings saved against now-merged duplicate records into the survivor
  let migrated = remapMergedIds(overrides);
  // Tier 3 used to mean "Recommended To Us / Emailed"; that meaning moved to the
  // new tier 4 and 3 now means "Need To See More". Move anything already sitting
  // on 3 across so it keeps the meaning it was given. Runs once.
  const scaleFlag = await Store.get(TIER_SCALE_KEY);
  if(!scaleFlag){
    Object.keys(overrides).forEach(id=>{
      if(overrides[id] && overrides[id].tier === "3"){
        overrides[id].tier = "4";
        migrated = true;
      }
    });
    await Store.set(TIER_SCALE_KEY, 'v2');
  }
  if(migrated) await saveOverrides();
}
async function saveOverrides(){
  return Store.set(STORAGE_KEY, JSON.stringify(overrides));
}
function getTier(p){
  const o = overrides[p.id];
  if(o && TIERS.includes(o.tier)) return o.tier;
  return p._defaultTier;
}
/* ---- call log --------------------------------------------------------------
   Every entry is stamped when it is written. The old free-text Phone Notes from
   the spreadsheet become the first, undated entry so nothing is lost.
--------------------------------------------------------------------------- */
function getLog(p){
  const o = overrides[p.id];
  return (o && Array.isArray(o.callLog)) ? o.callLog : [];
}
async function addLogEntry(id, text){
  text = String(text || '').trim();
  if(!text) return false;
  overrides[id] = overrides[id] || {};
  if(!Array.isArray(overrides[id].callLog)) overrides[id].callLog = [];
  overrides[id].callLog.unshift({
    id: 'L' + Date.now() + Math.floor(Math.random() * 1000),
    ts: new Date().toISOString(),
    by: (typeof Cloud !== 'undefined' && Cloud.who) ? Cloud.who : '',
    text,
  });
  return saveOverrides();
}
async function deleteLogEntry(id, entryId){
  const o = overrides[id];
  if(!o || !Array.isArray(o.callLog)) return false;
  o.callLog = o.callLog.filter(e => e.id !== entryId);
  // Remember the deletion, or the next sync from another device brings it back.
  o.logDeleted = (o.logDeleted || []).concat([entryId]);
  return saveOverrides();
}
function lastContact(p){
  const dated = getLog(p).filter(e => e.ts);
  if(!dated.length) return null;
  return dated.reduce((a, b) => (a.ts > b.ts ? a : b)).ts;
}
function fmtStamp(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d)) return iso;
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${h}:${String(d.getMinutes()).padStart(2,'0')} ${ap}`;
}
// Seed the log from whatever was already sitting in Phone Notes. Once only.
async function migrateNotesToLog(){
  const done = await Store.get(CALLLOG_KEY);
  if(done) return;
  let n = 0;
  allPlayers().forEach(p=>{
    const existing = String(getField(p,'phoneNotes') || '').trim();
    const o = overrides[p.id];
    if(!existing || (o && Array.isArray(o.callLog) && o.callLog.length)) return;
    overrides[p.id] = overrides[p.id] || {};
    overrides[p.id].callLog = [{ id:'L-import-'+p.id, ts:null, text:existing, imported:true }];
    n++;
  });
  await Store.set(CALLLOG_KEY, 'done');
  if(n) await saveOverrides();
  return n;
}
/* ---- who is going to what ---------------------------------------------------
   One flat list of {playerId, eventId, team}. Travel team is stored per
   appearance, since a kid can play for different programs across a season.
--------------------------------------------------------------------------- */
let attendance = [];
async function loadAttendance(){
  try{
    const raw = await Store.get(ATTEND_KEY);
    attendance = raw ? JSON.parse(raw) : [];
  }catch(e){ attendance = []; }
  if(!Array.isArray(attendance)) attendance = [];
}
async function saveAttendance(){ return Store.set(ATTEND_KEY, JSON.stringify(attendance)); }
function attendeesOf(eventId){ return attendance.filter(a=> a.eventId === eventId); }
function eventsForPlayer(playerId){ return attendance.filter(a=> a.playerId === playerId); }
function isAttending(playerId, eventId){
  return attendance.some(a=> a.playerId === playerId && a.eventId === eventId);
}
async function addAttendance(playerId, eventId, team){
  if(!playerId || !eventId || isAttending(playerId, eventId)) return false;
  attendance.push({ id:'A'+Date.now()+Math.floor(Math.random()*1000), playerId, eventId, team: String(team||'').trim() });
  return saveAttendance();
}
async function setAttendanceTeam(recId, team){
  const a = attendance.find(x=>x.id === recId);
  if(!a) return false;
  a.team = String(team || '').trim();
  return saveAttendance();
}
async function removeAttendance(recId){
  attendance = attendance.filter(a=> a.id !== recId);
  return saveAttendance();
}
function playerById(id){ return allPlayers().find(p=>p.id === id); }
function eventById(id){ return events.find(e=>e.id === id); }
function getNotes(p){
  const o = overrides[p.id];
  return (o && o.notes) ? o.notes : "";
}
async function setTier(id, tier){
  if(!TIERS.includes(tier)) return false;
  overrides[id] = overrides[id] || {};
  overrides[id].tier = tier;
  return saveOverrides();
}
async function setNotes(id, notes){
  overrides[id] = overrides[id] || {};
  overrides[id].notes = notes;
  return saveOverrides();
}
/* ---- measurables ------------------------------------------------------------
   Real fields rather than numbers buried in note text, so they can be filtered,
   shown on cards and fed to the auto-mark rules.
--------------------------------------------------------------------------- */
const METRICS = [
  { key:'m60',  label:'60',        unit:'sec', dir:'low'  },
  { key:'mEV',  label:'Exit Velo', unit:'mph', dir:'high' },
  { key:'mFB',  label:'FB Velo',   unit:'mph', dir:'high' },
  { key:'mPop', label:'Pop',       unit:'sec', dir:'low'  },
  { key:'mC',   label:'C Velo',    unit:'mph', dir:'high' },
  { key:'mOF',  label:'OF Velo',   unit:'mph', dir:'high' },
  { key:'mINF', label:'INF Velo',  unit:'mph', dir:'high' },
  { key:'mBat', label:'Bat Speed', unit:'mph', dir:'high' },
];
const METRIC_KEYS = METRICS.map(m=>m.key);
// A range like "1.90-2.00" reads as its fast end, matching how times get quoted.
function parseMetric(v){
  const s = String(v == null ? '' : v).trim();
  if(!s) return null;
  const m = s.match(/-?\d+(\.\d+)?/g);
  if(!m) return null;
  const nums = m.map(Number).filter(n=>!isNaN(n));
  if(!nums.length) return null;
  return Math.min.apply(null, nums);
}
const DEFAULT_MARK_RULES = [
  { key:'m60',  op:'lte', val:6.6, emoji:'🐇' },
  { key:'mEV',  op:'gte', val:100, emoji:'💣' },
  { key:'mFB',  op:'gte', val:90,  emoji:'🔥' },
  { key:'mPop', op:'lte', val:2.0, emoji:'⚡' },
];
let markRules = DEFAULT_MARK_RULES.slice();
let academicBar = { gpa:4.0 };
async function loadMarkRules(){
  try{
    const raw = await Store.get(MARKS_KEY);
    if(raw){ const r = JSON.parse(raw); if(Array.isArray(r)) markRules = r; }
  }catch(e){ markRules = DEFAULT_MARK_RULES.slice(); }
  try{
    const raw2 = await Store.get(ACAD_KEY);
    if(raw2) academicBar = Object.assign({ gpa:4.0 }, JSON.parse(raw2));
  }catch(e){ /* default */ }
}
async function saveMarkRules(){ return Store.set(MARKS_KEY, JSON.stringify(markRules)); }
async function saveAcademicBar(){ return Store.set(ACAD_KEY, JSON.stringify(academicBar)); }
// Emoji a player earns from their measurables right now.
function autoMarks(p){
  const out = [];
  markRules.forEach(r=>{
    const v = parseMetric(getField(p, r.key));
    if(v === null) return;
    const t = parseFloat(r.val);
    if(isNaN(t)) return;
    const hit = r.op === 'lte' ? v <= t : r.op === 'gte' ? v >= t
              : String(getField(p, r.key)).toLowerCase().includes(String(r.val).toLowerCase());
    if(hit && out.indexOf(r.emoji) < 0) out.push(r.emoji);
  });
  return out;
}
function meetsAcademicBar(p){
  const bar = parseFloat(academicBar.gpa);
  if(isNaN(bar)) return false;
  const gpa = parseFloat(getField(p,'gpa'));
  return !isNaN(gpa) && gpa >= bar;
}
function marksHtml(p){
  const marks = autoMarks(p);
  const acad = meetsAcademicBar(p);
  if(!marks.length && !acad) return '';
  return `<span class="pmarks">${marks.map(m=>`<span class="pmark">${m}</span>`).join('')}` +
         `${acad ? '<span class="acad" title="GPA ' + escAttr(getField(p,'gpa')) + '">A+</span>' : ''}</span>`;
}
const EDITABLE_FIELDS = ['collegeFrom','elig','portalDate',
                         'first','last','posDisplay','team','school','gradClass','bt','height','weight','gpa',
                          'address','city','state','zip','phone','phoneNotes','email','xLink',
                          'pgLink','pbrLink','commit','coach','originNotes'].concat(METRIC_KEYS);
// Accepts a full URL, a bare domain path, or free text. Only returns something
// linkable when it actually looks like a web address.
function toWebUrl(v){
  v = String(v == null ? '' : v).trim();
  if(!v) return '';
  if(/^https?:\/\//i.test(v)) return v;
  if(/^[\w-]+(\.[\w-]+)+\//.test(v) || /^www\./i.test(v)) return 'https://' + v;
  return '';
}
function getField(p, key){
  const o = overrides[p.id];
  if(o && o.fields && o.fields[key] !== undefined) return o.fields[key];
  return p[key] !== undefined && p[key] !== null ? p[key] : '';
}
function getPosPrimary(p){
  const o = overrides[p.id];
  if(o && o.fields && o.fields.posDisplay !== undefined) return primaryPos(o.fields.posDisplay);
  return p.posPrimary;
}
async function setField(id, key, value){
  overrides[id] = overrides[id] || {};
  overrides[id].fields = overrides[id].fields || {};
  overrides[id].fields[key] = value;
  return saveOverrides();
}
function computeDefaults(){
  allPlayers().forEach(p=>{ if(p._defaultTier===undefined) p._defaultTier = p.topLion ? "1" : "2"; });
}
function buildTabs(){
  const all = poolPlayers();
  const wrap = document.getElementById('posTabs');
  const label = document.getElementById('sidebarLabel');
  if(groupMode === 'tier'){
    label.textContent = 'Tier';
    const counts = {};
    all.forEach(p=> counts[getTier(p)] = (counts[getTier(p)]||0)+1);
    wrap.innerHTML = `<button class="pos-tab ${activeTier===null?'active':''}" data-tier="">
        <svg class="plate" viewBox="0 0 24 24"><path d="M4 4h16v9l-8 7-8-7z"/></svg>
        <span class="plabel">All</span><span class="pcount">${all.length}</span>
      </button>` +
      TIERS.map(t=>`
        <button class="pos-tab ${activeTier===t?'active':''}" data-tier="${t}">
          <span class="tdot ${TIER_DEFS[t].cls}"></span>
          <span class="plabel">${t}</span><span class="pcount">${counts[t]||0}</span>
        </button>`).join('');
    wrap.querySelectorAll('.pos-tab').forEach(btn=>{
      btn.addEventListener('click', ()=>{ activeTier = btn.dataset.tier || null; renderAll(); });
    });
  } else {
    label.textContent = 'Position';
    const counts = {};
    all.forEach(p=> counts[getPosPrimary(p)] = (counts[getPosPrimary(p)]||0)+1);
    const known = POS_ORDER.filter(k=>counts[k]);
    const extra = Object.keys(counts).filter(k=> !POS_ORDER.includes(k)).sort();
    const present = known.concat(extra);
    wrap.innerHTML = `<button class="pos-tab ${activePos===null?'active':''}" data-pos="">
        <svg class="plate" viewBox="0 0 24 24"><path d="M4 4h16v9l-8 7-8-7z"/></svg>
        <span class="plabel">All</span><span class="pcount">${all.length}</span>
      </button>` +
      present.map(k=>`
        <button class="pos-tab ${activePos===k?'active':''}" data-pos="${k}">
          <svg class="plate" viewBox="0 0 24 24"><path d="M4 4h16v9l-8 7-8-7z"/></svg>
          <span class="plabel">${k}</span><span class="pcount">${counts[k]}</span>
        </button>`).join('');
    wrap.querySelectorAll('.pos-tab').forEach(btn=>{
      btn.addEventListener('click', ()=>{ activePos = btn.dataset.pos || null; renderAll(); });
    });
  }
}
document.getElementById('groupToggle').querySelectorAll('.gt-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    groupMode = btn.dataset.mode;
    document.getElementById('groupToggle').querySelectorAll('.gt-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    activePos = null;
    activeTier = null;
    renderAll();
  });
});
// Big Board filters also apply to the Grid; safe before a6 has initialised.
function bbPass(p){ try{ return passesFilters(p); }catch(e){ return true; } }
function matchesSearch(p){
  if(!searchTerm) return true;
  const hay = `${getField(p,'first')} ${getField(p,'last')} ${getField(p,'state')} ${getField(p,'school')} ${getField(p,'team')}`.toLowerCase();
  return hay.includes(searchTerm);
}
function renderRoster(){
  const title = document.getElementById('posTitle');
  const tagline = document.getElementById('posTagline');
  let list;
  if(groupMode === 'tier'){
    list = poolPlayers().filter(p=> (activeTier ? getTier(p)===activeTier : true) && matchesSearch(p) && bbPass(p));
    list.sort((a,b)=> getPosPrimary(a).localeCompare(getPosPrimary(b)) || getField(a,'last').localeCompare(getField(b,'last')));
    title.textContent = activeTier ? TIER_DEFS[activeTier].label : "All Tiers";
  } else {
    list = poolPlayers().filter(p=> (activePos ? getPosPrimary(p)===activePos : true) && matchesSearch(p));
    list.sort((a,b)=> (TIER_SORT_INDEX[getTier(a)] - TIER_SORT_INDEX[getTier(b)]) || getField(a,'last').localeCompare(getField(b,'last')));
    title.textContent = activePos ? (POS_LABELS[activePos] || activePos) : "All Positions";
  }
  tagline.textContent = `${list.length} recruit${list.length===1?'':'s'}`;
  const roster = document.getElementById('roster');
  if(list.length===0){
    roster.innerHTML = `<div class="empty-state">No recruits match your search.</div>`;
    return;
  }
  roster.innerHTML = list.map(p=>{
    const t = getTier(p);
    const td = TIER_DEFS[t];
    const state = getField(p,'state'), school = getField(p,'school'), city = getField(p,'city');
    const grad = getField(p,'gradClass'), phone = getField(p,'phone'), xLink = getField(p,'xLink');
    const pg = toWebUrl(getField(p,'pgLink')), pbr = toWebUrl(getField(p,'pbrLink'));
    return `
    <div class="row tier-${td.cls}" data-id="${p.id}">
      <div class="rank-badge tier-${td.cls}" title="${td.label}">${td.short}</div>
      <div class="name-cell">
        <div class="nm">${t==='1'?'<svg class="star" viewBox="0 0 24 24"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L2 9.2l7.1-.6z"/></svg>':''}${getField(p,'first')} ${getField(p,'last')}${marksHtml(p)}${p.isCustom?'<span class="custom-tag">Added</span>':''}</div>
        <div class="meta">${state || '—'}${grad ? ' · Class of '+grad : ''}</div>
      </div>
      <div class="posd">${school || '—'}</div>
      <div class="cell-txt dim">${getField(p,'posDisplay')}</div>
      <div class="row-actions">
        ${phone?`<a class="icon-btn" href="tel:${phone}" onclick="event.stopPropagation()" title="Call"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 3a2 2 0 0 1-.5 2.1L8 10.1a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c1 .3 2 .5 3 .7a2 2 0 0 1 1.6 2z"/></svg></a>`:''}
        ${xLink?`<a class="icon-btn" href="${xLink}" target="_blank" onclick="event.stopPropagation()" title="X profile"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.6 8.7L23.3 22h-6.7l-5.2-6.8L5.4 22H2.3l8.2-9.4L1 2h6.9l4.7 6.2zm-1.2 18h1.9L7.4 4H5.3z"/></svg></a>`:''}
        ${pg?`<a class="icon-btn tag-btn pg" href="${pg}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Perfect Game profile">PG</a>`:''}
        ${pbr?`<a class="icon-btn tag-btn pbr" href="${pbr}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="PBR profile">PBR</a>`:''}
      </div>
    </div>
  `;
  }).join('');
  roster.querySelectorAll('.row').forEach(row=>{
    row.addEventListener('click', ()=> openDrawer(row.dataset.id));
  });
}
function renderAll(){
  buildTabs();
  renderRoster();
  updateTotalCount();
  renderRestoreControl();
}
