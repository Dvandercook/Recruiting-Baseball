import { chromium } from 'playwright';
import { start } from './mock_supabase.mjs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'file://' + path.join(ROOT, 'recruiting_board_v2.html');


const PORT = 8799;
const API = `http://127.0.0.1:${PORT}`;
const mock = await start(PORT);

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}).catch(()=> chromium.launch());
const fail = [];
const ok = (n,c,x='') => { console.log((c?'PASS  ':'FAIL  ')+n+(x?'  '+x:'')); if(!c) fail.push(n); };

// Two coaches = two isolated browser contexts = two separate localStorages.
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

const A = await coach('dv@school.edu','pw1');
ok('coach A signs in', A.signIn.ok === true, JSON.stringify(A.signIn));

const bad = await A.p.evaluate(async ()=> await Cloud.signIn('dv@school.edu','wrong'));
ok('wrong password is rejected', bad.ok === false, bad.msg);
await A.p.evaluate(async ()=> await Cloud.signIn('dv@school.edu','pw1'));

/* ---- 1. first push seeds the staff board ---- */
let s = await A.p.evaluate(async ()=> await Cloud.sync());
console.log('A first sync:', JSON.stringify(s));
ok('A pushes its board', s.ok && s.pushed > 0, `${s.pushed} records`);

const B = await coach('coach2@school.edu','pw2');
ok('coach B signs in', B.signIn.ok === true);
// B is a fresh device: pull the staff board instead of pushing its blank one
await B.p.evaluate(async ()=>{
  Cloud.meta = { cursor:'', snap:{}, stamps:{} };
  Cloud.snapshotNow();
  await Cloud.saveMeta();
});
s = await B.p.evaluate(async ()=> await Cloud.sync());
console.log('B first sync:', JSON.stringify(s));
ok('B receives the staff board', s.ok && s.applied > 0, `${s.applied} records`);

/* ---- 2. a tier change on A lands on B ---- */
const target = await A.p.evaluate(async ()=>{
  const p = allPlayers().find(x=>/bailey/i.test(getField(x,'last')));
  await setTier(p.id, 'C');
  await addLogEntry(p.id, 'Called mom, visit set for Sept 20.');
  return { id:p.id, name:getField(p,'first')+' '+getField(p,'last') };
});
await A.p.evaluate(async ()=> await Cloud.sync());
s = await B.p.evaluate(async ()=> await Cloud.sync());
const onB = await B.p.evaluate((id)=>{
  const p = playerById(id);
  return { tier:getTier(p), log:getLog(p).map(e=>({t:e.text.slice(0,20), by:e.by})) };
}, target.id);
console.log('B sees:', JSON.stringify(onB));
ok('tier change reaches B', onB.tier === 'C');
ok('call log entry reaches B', onB.log.some(e=>/Called mom/.test(e.t)));
ok('entry is stamped with the author', onB.log.some(e=>e.by === 'dv@school.edu'), JSON.stringify(onB.log));

/* ---- 3. simultaneous call logs both survive ---- */
await A.p.evaluate(async (id)=> await addLogEntry(id, 'A: talked to the kid himself.'), target.id);
await B.p.evaluate(async (id)=> await addLogEntry(id, 'B: saw him at the showcase.'), target.id);
await A.p.evaluate(async ()=> await Cloud.sync());
await B.p.evaluate(async ()=> await Cloud.sync());
await A.p.evaluate(async ()=> await Cloud.sync());   // A merges and sends the union back
await B.p.evaluate(async ()=> await Cloud.sync());   // B picks the union up on its next pull
const logsA = await A.p.evaluate((id)=> getLog(playerById(id)).map(e=>e.text), target.id);
const logsB = await B.p.evaluate((id)=> getLog(playerById(id)).map(e=>e.text), target.id);
console.log('A log:', JSON.stringify(logsA));
console.log('B log:', JSON.stringify(logsB));
const srvLog = [...mock.rows.values()].find(r=>r.kind==='ov' && r.rid===target.id);
ok('server row holds the union of both entries',
   (srvLog.data.callLog||[]).some(e=>/A: talked/.test(e.text)) &&
   (srvLog.data.callLog||[]).some(e=>/B: saw him/.test(e.text)));
ok('A keeps its own entry',  logsA.some(t=>/A: talked/.test(t)));
ok('A receives B\'s entry',   logsA.some(t=>/B: saw him/.test(t)));
ok('B keeps both entries',    logsB.some(t=>/A: talked/.test(t)) && logsB.some(t=>/B: saw him/.test(t)));
ok('no entry duplicated', new Set(logsA).size === logsA.length, logsA.length + ' entries');

/* ---- 4. deleting a log entry does not resurrect ---- */
const entryId = await A.p.evaluate((id)=> getLog(playerById(id)).find(e=>/B: saw him/.test(e.text)).id, target.id);
await A.p.evaluate(async (a)=> await deleteLogEntry(a.id, a.e), { id:target.id, e:entryId });
await A.p.evaluate(async ()=> await Cloud.sync());
await B.p.evaluate(async ()=> await Cloud.sync());
await A.p.evaluate(async ()=> await Cloud.sync());
const afterDelA = await A.p.evaluate((id)=> getLog(playerById(id)).map(e=>e.text), target.id);
const afterDelB = await B.p.evaluate((id)=> getLog(playerById(id)).map(e=>e.text), target.id);
ok('deleted entry stays gone on A', !afterDelA.some(t=>/B: saw him/.test(t)), JSON.stringify(afterDelA));
ok('deletion propagates to B',      !afterDelB.some(t=>/B: saw him/.test(t)), JSON.stringify(afterDelB));

/* ---- 5. a new player and an event travel both ways ---- */
await B.p.evaluate(async ()=>{
  customPlayers.push({ id:'custom-sync-1', first:'Test', last:'Transfer', posPrimary:'OF',
                       posDisplay:'OF', state:'PA', isCustom:true, _defaultTier:'2' });
  await saveCustomPlayers();
  events.push({ id:'ev-sync-1', name:'Sync Test Showcase', start:'2026-09-20', end:'2026-09-21',
                location:'Testville', division:'17U', season:'fall', star:true });
  await saveEvents();
  await addAttendance('custom-sync-1','ev-sync-1','Test Travel');
});
await B.p.evaluate(async ()=> await Cloud.sync());
s = await A.p.evaluate(async ()=> await Cloud.sync());
const gotA = await A.p.evaluate(()=>({
  player: !!allPlayers().find(p=>p.id==='custom-sync-1'),
  event:  !!events.find(e=>e.id==='ev-sync-1'),
  att:    attendance.filter(a=>a.eventId==='ev-sync-1').length,
}));
console.log('A got:', JSON.stringify(gotA));
ok('added player syncs',  gotA.player === true);
ok('added event syncs',   gotA.event === true);
ok('attendance syncs',    gotA.att === 1);

/* ---- 6. removing a player is a tombstone, not a wipe ---- */
await A.p.evaluate(async ()=>{ await removePlayer('custom-sync-1'); });
await A.p.evaluate(async ()=> await Cloud.sync());
await B.p.evaluate(async ()=> await Cloud.sync());
const goneB = await B.p.evaluate(()=> !allPlayers().find(p=>p.id==='custom-sync-1'));
ok('removal propagates', goneB === true);
const serverRows = [...mock.rows.values()];
ok('server keeps a tombstone rather than dropping the row',
   serverRows.some(r=> r.kind==='cp' && r.rid==='custom-sync-1' && r.deleted === true));

/* ---- 7. offline: local saves keep working and go up on reconnect ---- */
await A.ctx.setOffline(true);
const offlineSave = await A.p.evaluate(async ()=>{
  const p = allPlayers().find(x=>/abrego/i.test(getField(x,'last')));
  const okSave = await setField(p.id, 'm60', '6.71');
  const res = await Cloud.sync();
  return { okSave, syncOk:res.ok, status:Cloud.status, value:getField(playerById(p.id),'m60') };
});
console.log('offline:', JSON.stringify(offlineSave));
ok('save still succeeds offline', offlineSave.okSave === true && offlineSave.value === '6.71');
ok('sync reports offline honestly', offlineSave.syncOk === false && offlineSave.status === 'offline');
await A.ctx.setOffline(false);
s = await A.p.evaluate(async ()=> await Cloud.sync());
ok('queued work goes up on reconnect', s.ok === true && s.pushed >= 1, JSON.stringify(s));
await B.p.evaluate(async ()=> await Cloud.sync());
const bSees = await B.p.evaluate(()=>{
  const p = allPlayers().find(x=>/abrego/i.test(getField(x,'last')));
  return getField(p,'m60');
});
ok('offline edit reaches B once back on', bSees === '6.71', bSees);

/* ---- 7b. the newer stores travel too ---- */
await A.p.evaluate(async ()=>{
  coaches.push({ id:'c-sync-1', name:'Sync Coach', initials:'SC' }); await saveCoaches();
  tasks.push({ id:'tk-sync-1', text:'Sync task', playerId:'', coach:'c-sync-1',
               remindAt:'', done:false, createdAt:'2026-08-16T10:00:00.000Z' }); await saveTasks();
  calEntries.push({ id:'cl-sync-1', date:'2026-09-20', type:'official', title:'OV',
                    playerId:'', coach:'c-sync-1', notes:'' }); await saveCalEntries();
  eventGames.push({ id:'gm-sync-1', eventId: events[0].id, date:'2026-09-20', time:'9:00 AM',
                    venue:'Field 1', division:'17U', home:'Canes', away:'Scorpions',
                    attend:true, notes:'sync note' }); await saveGames();
});
await A.p.evaluate(async ()=> await Cloud.sync());
await B.p.evaluate(async ()=> await Cloud.sync());
const staffOnB = await B.p.evaluate(()=>({
  coach: coaches.some(c=>c.id==='c-sync-1'),
  task: tasks.some(t=>t.id==='tk-sync-1'),
  cal: calEntries.some(c=>c.id==='cl-sync-1'),
  game: eventGames.some(g=>g.id==='gm-sync-1' && g.attend === true),
}));
console.log('staff stores on B:', JSON.stringify(staffOnB));
ok('coaches sync', staffOnB.coach === true);
ok('tasks sync', staffOnB.task === true);
ok('calendar entries sync', staffOnB.cal === true);
ok('event games sync', staffOnB.game === true);

/* ---- 8. an unauthenticated device gets nothing ---- */
const anon = await b.newContext();
const ap = await anon.newPage();
await ap.goto(APP);
await ap.waitForTimeout(800);
const anonRes = await ap.evaluate(async (url)=>{
  const r = await fetch(url + '/rest/v1/records?select=kind', { headers:{ apikey:'anon-test-key' } });
  return r.status;
}, API);
ok('anon key alone cannot read the board', anonRes === 401, 'HTTP ' + anonRes);

/* ---- 9. the status pill tells the truth ---- */
const pill = await A.p.evaluate(()=>{
  renderCloudStatus();
  const el = document.getElementById('cloudBtn');
  return { text: el.textContent, cls: el.className };
});
console.log('pill:', JSON.stringify(pill));
ok('status pill shows synced', /Synced/.test(pill.text) && /ok/.test(pill.cls));

/* ---- 10. reload keeps the session and does not double-push ---- */
await A.p.reload(); await A.p.waitForTimeout(1500);
const afterReload = await A.p.evaluate(()=>({ signedIn: Cloud.signedIn, who: Cloud.who, status: Cloud.status }));
console.log('after reload:', JSON.stringify(afterReload));
ok('session survives reload', afterReload.signedIn === true && afterReload.who === 'dv@school.edu');
const s2 = await A.p.evaluate(async ()=> await Cloud.sync());
ok('nothing re-pushes when nothing changed', s2.ok && s2.pushed === 0, JSON.stringify(s2));

console.log('\nserver rows:', mock.rows.size);
console.log(fail.length ? 'FAILURES: ' + fail.join(', ') : 'ALL PASS');
await b.close();
mock.srv.close();
process.exit(fail.length ? 1 : 0);
