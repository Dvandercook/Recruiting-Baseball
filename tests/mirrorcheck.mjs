/* Drives the app against the mock Supabase, then runs the Apps Script mirror's
   real logic (pulled straight out of sheet_mirror.gs) over what landed in the
   database — with fake Google services standing in for the spreadsheet. */
import { chromium } from 'playwright';
import { start } from './mock_supabase.mjs';
import fs from 'fs';
import vm from 'vm';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'file://' + path.join(ROOT, 'recruiting_board_v2.html');


const PORT = 8802, API = `http://127.0.0.1:${PORT}`;
const mock = await start(PORT);
const fail = [];
const ok = (n,c,x='') => { console.log((c?'PASS  ':'FAIL  ')+n+(x?'  '+x:'')); if(!c) fail.push(n); };

/* ---- 1. a coach uses the app and syncs ---- */
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERROR:', e.message));
await p.goto(APP);
await p.waitForTimeout(900);
await p.evaluate(async (url)=>{
  Cloud.cfg = { url, key:'anon-test-key' }; await Cloud.saveCfg();
  await Cloud.signIn('dv@school.edu','pw1');
}, API);

const seeded = await p.evaluate(async ()=>{
  const bailey = allPlayers().find(x=>/bailey/i.test(getField(x,'last')));
  await setTier(bailey.id, 'C');
  await setField(bailey.id, 'commit', 'Penn State');
  await setField(bailey.id, 'm60', '6.38');
  await addLogEntry(bailey.id, 'Committed. Great call with the family.');
  const drop = allPlayers().find(x=>/abrego/i.test(getField(x,'last')));
  await removePlayer(drop.id);
  customPlayers.push({ id:'custom-mirror-1', first:'Walk', last:'Onn', posPrimary:'C',
    posDisplay:'C', state:'OH', school:'Mirror HS', isCustom:true, _defaultTier:'3' });
  await saveCustomPlayers();
  const ev = events[0];
  await addAttendance(bailey.id, ev.id, 'Canes National');
  return { bailey:bailey.id, dropped:drop.id, droppedName:getField(drop,'last'),
           event:ev.name, total:allPlayers().length };
});
const s = await p.evaluate(async ()=> await Cloud.sync());
console.log('seeded:', JSON.stringify(seeded), '| sync:', JSON.stringify(s));
await b.close();

/* ---- 2. run the mirror's own code over what the database now holds ---- */
const src = fs.readFileSync(path.join(ROOT, 'sheet_mirror.gs'),'utf8');
const ctx = vm.createContext({ console });
vm.runInContext(src, ctx);

const res = await fetch(`${API}/rest/v1/records?select=kind,rid,data,deleted,updated_at,updated_by&deleted=eq.false`, {
  headers:{ apikey:'anon-test-key', Authorization:'Bearer a-dv@school.edu' } });
const rows = await res.json();
ok('mirror can read the board', Array.isArray(rows) && rows.length > 300, rows.length + ' rows');

const data = vm.runInContext('assemble_', ctx)(rows);
const ov = data.ov;
const field_ = vm.runInContext('field_', ctx);
const tier_  = vm.runInContext('tier_', ctx);
const TIER_LABEL = vm.runInContext('TIER_LABEL', ctx);

console.log('assembled:', JSON.stringify({ players:data.players.length,
  overrides:Object.keys(ov).length, events:data.events.length, att:data.att.length }));

ok('mirror sees the whole roster', data.players.length === seeded.total,
   `${data.players.length} vs ${seeded.total} in the app`);

const bailey = data.players.find(x=> x.id === seeded.bailey);
ok('mirror finds the edited player', !!bailey);
ok('tier override applied',    tier_(bailey, ov) === 'C', tier_(bailey, ov));
ok('field override applied',   field_(bailey, ov, 'commit') === 'Penn State', field_(bailey, ov, 'commit'));
ok('measurable applied',       field_(bailey, ov, 'm60') === '6.38');
ok('base field still shows',   !!field_(bailey, ov, 'school'), field_(bailey, ov, 'school'));
ok('removed player is excluded', !data.players.find(x=> x.id === seeded.dropped), seeded.droppedName);
ok('added player is included',   !!data.players.find(x=> x.id === 'custom-mirror-1'));

const log = (ov[seeded.bailey] || {}).callLog || [];
ok('call log came through', log.some(e=>/Committed\. Great call/.test(e.text)));
ok('log entry carries the author', log.some(e=> e.by === 'dv@school.edu'),
   JSON.stringify(log.map(e=>e.by)));

ok('attendance came through', data.att.some(a=> a.playerId === seeded.bailey));
ok('events came through', data.events.length > 100, data.events.length + ' events');

/* ---- 3. build the Board rows exactly as the script would ---- */
const tierRank_ = vm.runInContext('tierRank_', ctx);
const sorted = data.players.slice().sort((a,x)=>
  (tierRank_(tier_(a,ov)) - tierRank_(tier_(x,ov))) ||
  String(field_(a,ov,'last')).localeCompare(String(field_(x,ov,'last'))));
ok('committed player sorts to the top', sorted[0].id === seeded.bailey,
   `${field_(sorted[0],ov,'first')} ${field_(sorted[0],ov,'last')} (${tier_(sorted[0],ov)})`);

const sample = sorted.slice(0,3).map(pl=>[
  TIER_LABEL[tier_(pl,ov)], field_(pl,ov,'first'), field_(pl,ov,'last'),
  field_(pl,ov,'posDisplay'), field_(pl,ov,'state'), field_(pl,ov,'school'),
  field_(pl,ov,'phone'), field_(pl,ov,'commit'), field_(pl,ov,'m60'),
]);
console.log('\nfirst three Board rows:');
sample.forEach(r=> console.log('  ' + r.map(v=> v === '' ? '—' : v).join(' | ')));
ok('board rows are populated, not blank',
   sample.every(r=> r[1] && r[2]) && sample[0][7] === 'Penn State');

/* ---- 4. no tombstones leak into the sheet ---- */
const anyDeleted = rows.some(r=> r.deleted === true);
ok('tombstoned rows never reach the mirror', anyDeleted === false);

console.log('\n' + (fail.length ? 'FAILURES: ' + fail.join(', ') : 'ALL PASS'));
mock.srv.close();
process.exit(fail.length ? 1 : 0);
