/* A brand-new device must never overwrite the staff board.

   synccheck.mjs covers two coaches syncing, but it hand-rolls the safe path:
   before coach B's first sync it clears meta and calls snapshotNow(), which is
   what the "Replace this device from the staff board" button does. That is the
   fix being simulated, so the suite never exercised what actually happens when
   a coach just signs in — and what actually happened was that the fresh
   device's untouched starting board was pushed over everyone else's work.

   This file drives the unassisted path: sign in, sync, and check the staff's
   records survived. */
import { chromium } from 'playwright';
import { start } from './mock_supabase.mjs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'file://' + path.join(ROOT, 'recruiting_board_v2.html');

const PORT = 8797;
const API = `http://127.0.0.1:${PORT}`;
const mock = await start(PORT);

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}).catch(()=> chromium.launch());
const fail = [];
const ok = (n,c,x='') => { console.log((c?'PASS  ':'FAIL  ')+n+(x?'  '+x:'')); if(!c) fail.push(n); };

async function coach(email, pass){
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log(`PAGEERROR[${email}]:`, e.message));
  await p.goto(APP);
  await p.waitForTimeout(900);
  await p.evaluate(async (cfg)=>{
    Cloud.cfg = { url: cfg.url, key:'anon-test-key' };
    await Cloud.saveCfg();
  }, { url: API });
  const r = await p.evaluate(async (c)=> await Cloud.signIn(c.email, c.pass), { email, pass });
  return { ctx, p, signIn:r };
}

/* ---- coach A builds a board worth protecting ---- */
const A = await coach('dv@school.edu','pw1');
ok('coach A signs in', A.signIn.ok === true, JSON.stringify(A.signIn));

let s = await A.p.evaluate(async ()=> await Cloud.sync());
ok('A seeds the staff board', s.ok && s.pushed > 0, `${s.pushed} records`);
ok('A is not treated as a joiner', s.adopted === false, `adopted=${s.adopted}`);

// Distinctive work: a tier the seed would never produce, plus a call entry.
const target = await A.p.evaluate(async ()=>{
  const p = allPlayers().find(x=>/bailey/i.test(getField(x,'last')));
  await setTier(p.id, 'C');
  await addLogEntry(p.id, 'A: committed, do not lose this line.');
  return p.id;
});
await A.p.evaluate(async ()=> await Cloud.sync());

const beforeRows = await A.p.evaluate(async (api)=>{
  const r = await fetch(`${api}/rest/v1/records?select=kind,rid,data`, {
    headers:{ apikey:'anon-test-key', Authorization:'Bearer '+Cloud.sess.access_token } });
  return (await r.json()).length;
}, API);
ok('staff board has rows on the server', beforeRows > 0, `${beforeRows} rows`);

/* ---- coach B signs in on a fresh device and just syncs ----
   No meta clearing, no snapshotNow(), no button. This is the path a real
   coach takes, and the one that used to overwrite everything. */
const B = await coach('coach2@school.edu','pw2');
ok('coach B signs in', B.signIn.ok === true);

const bMeta = await B.p.evaluate(()=> ({
  cursor: Cloud.meta.cursor || '',
  snapKeys: Object.keys(Cloud.meta.snap || {}).length,
}));
ok('B really is a never-synced device', bMeta.cursor === '' && bMeta.snapKeys === 0,
   JSON.stringify(bMeta));

s = await B.p.evaluate(async ()=> await Cloud.sync());
console.log('B unassisted first sync:', JSON.stringify(s));

ok('B adopts instead of asserting', s.adopted === true, `adopted=${s.adopted}`);
ok('B pushes nothing on first sync', s.pushed === 0, `pushed=${s.pushed}`);
ok('B receives the staff board', s.applied > 0, `${s.applied} records`);

/* ---- the point of the whole exercise: A's work is still there ---- */
// The mock only filters on updated_at / deleted, so pick the row out here
// rather than asking the server for it.
const survived = await A.p.evaluate(async (t)=>{
  const r = await fetch(`${t.api}/rest/v1/records?select=kind,rid,data`, {
    headers:{ apikey:'anon-test-key', Authorization:'Bearer '+Cloud.sess.access_token } });
  const rows = await r.json();
  const row = rows.find(x=> x.kind === 'ov' && x.rid === t.id);
  const d = (row || {}).data || {};
  return { found: !!row, tier: d.tier, log: (d.callLog||[]).map(e=>e.text) };
}, { api: API, id: target });
ok('A\'s record is on the server', survived.found === true, JSON.stringify(survived));

ok('A\'s tier survived B joining', survived.tier === 'C', JSON.stringify(survived.tier));
ok('A\'s call entry survived B joining',
   survived.log.some(t=>/do not lose this line/.test(t)), JSON.stringify(survived.log));

const bSees = await B.p.evaluate((id)=>{
  const p = allPlayers().find(x=>x.id===id);
  return { tier: getTier(p), log: getLog(p).map(e=>e.text) };
}, target);
ok('B sees A\'s tier rather than its own default', bSees.tier === 'C', JSON.stringify(bSees.tier));
ok('B sees A\'s call entry',
   bSees.log.some(t=>/do not lose this line/.test(t)), JSON.stringify(bSees.log));

/* ---- B is a normal participant afterwards ---- */
await B.p.evaluate(async (id)=>{ await addLogEntry(id, 'B: added after joining.'); }, target);
s = await B.p.evaluate(async ()=> await Cloud.sync());
ok('B pushes its own work after adopting', s.ok && s.pushed > 0, `pushed=${s.pushed}`);
ok('adopting is a one-time event', s.adopted === false, `adopted=${s.adopted}`);

const both = await A.p.evaluate(async (id)=>{
  await Cloud.sync();
  const p = allPlayers().find(x=>x.id===id);
  return getLog(p).map(e=>e.text);
}, target);
ok('A now sees B\'s entry too', both.some(t=>/added after joining/.test(t)), JSON.stringify(both));
ok('and still has its own', both.some(t=>/do not lose this line/.test(t)));

/* ---- bootstrap case: first device ever must still seed an empty board ----
   The mock keeps its rows in module scope, so a second start() would share
   this one's data. Empty the board instead, then bring a fresh device up
   against it. Do this last: it wipes what the assertions above rely on. */
mock.reset();
const C = await coach('dv@school.edu','pw1');
s = await C.p.evaluate(async ()=> await Cloud.sync());
ok('an empty server is still seeded by the first device', s.ok && s.pushed > 0, `pushed=${s.pushed}`);
ok('first device is not treated as a joiner', s.adopted === false, `adopted=${s.adopted}`);

console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nALL PASS');
await b.close();
mock.srv.close();
process.exit(fail.length ? 1 : 0);
