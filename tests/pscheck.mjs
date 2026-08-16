import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'file://' + path.join(ROOT, 'recruiting_board_v2.html');

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message));
const fail=[]; const ok=(n,c,x='')=>{console.log((c?'PASS  ':'FAIL  ')+n+(x?'  '+x:'')); if(!c) fail.push(n);};

// A coach who already had the OLD 154 events saved, none of the new ones.
await p.goto(APP); await p.waitForTimeout(1400);
await p.evaluate(async ()=>{
  const old = SEED_EVENTS.filter(e=> !e.psUrl).map(e=> Object.assign({}, e, {pgUrl:'',pbrUrl:'',ftUrl:''}));
  localStorage.setItem('events-store', JSON.stringify(old));
  ['seed-events-added','event-links-filled'].forEach(k=> localStorage.removeItem(k));
});
await p.reload(); await p.waitForTimeout(1800);
const a = await p.evaluate(()=>({
  total: events.length,
  fall: events.filter(e=>e.season==='fall').length,
  ps: events.filter(e=>e.psUrl).length,
  pg: events.filter(e=>e.pgUrl).length,
  linked: events.filter(e=>e.pgUrl||e.pbrUrl||e.ftUrl||e.psUrl).length,
  seedFlag: localStorage.getItem('seed-events-added'),
  linkFlag: localStorage.getItem('event-links-filled'),
  cary: (events.find(e=>/Cary Invite/.test(e.name))||{}),
}));
console.log('after boot:', JSON.stringify({...a, cary:a.cary.name+' '+a.cary.start}));
ok('new events added to a saved board', a.fall === 166, a.fall + ' fall events');
ok('12 Prospect Select events carry their link', a.ps === 12, a.ps + '');
ok('existing links still backfill', a.pg === 92);
ok('155 fall events linked', a.linked === 155, a.linked + '');
ok('flags set', a.seedFlag === 'v1' && a.linkFlag === 'v3');
ok('display name used, not the slug', /Cary Invite/.test(a.cary.name||''), a.cary.name);

// running again must not duplicate
await p.reload(); await p.waitForTimeout(1800);
const again = await p.evaluate(()=> events.filter(e=>e.season==='fall').length);
ok('no duplicates on a second load', again === 166, again + '');

// an event the coach deleted stays deleted
await p.evaluate(async ()=>{
  events = events.filter(e=> !/DMV Fall Classic/.test(e.name));
  await saveEvents();
});
await p.reload(); await p.waitForTimeout(1800);
ok('a deleted event does not come back',
   (await p.evaluate(()=> events.some(e=>/DMV Fall Classic/.test(e.name)))) === false);

// the PS chip renders, saved, and points at Prospect Select
await p.evaluate(()=>goTo('fall')); await p.waitForTimeout(900);
const chips = await p.evaluate(()=>{
  const rows = [...document.querySelectorAll('a.ev-lnk')];
  return { total: rows.length,
    ps: rows.filter(r=>/play\.ps-baseball\.com/.test(r.href)).length,
    psSaved: rows.filter(r=>r.classList.contains('saved') && /play\.ps-baseball\.com\/events\//.test(r.href)).length,
    psSearch: rows.filter(r=>!r.classList.contains('saved') && /play\.ps-baseball\.com\/\?/.test(r.href)).length };
});
console.log('chips:', JSON.stringify(chips));
ok('a PS chip on every event row', chips.ps > 150, chips.ps + '');
ok('PS links show as saved', chips.psSaved === 11, chips.psSaved + ' (one event was deleted above)');
ok('other rows fall back to the PS finder, not Five Tool', chips.psSearch > 140, chips.psSearch + '');

// CSV carries the new column
const csv = await p.evaluate(()=> eventsToCsv(events.slice(0,3)).split('\r\n')[0]);
ok('CSV has a Prospect Select column', /Prospect Select URL/.test(csv), csv.slice(0,120));

console.log('\n'+(fail.length?'FAILURES: '+fail.join(', '):'ALL PASS'));
await b.close(); process.exit(fail.length?1:0);
