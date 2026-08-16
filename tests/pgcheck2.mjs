import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'file://' + path.join(ROOT, 'recruiting_board_v2.html');

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message));
const fail=[]; const ok=(n,c,x='')=>{console.log((c?'PASS  ':'FAIL  ')+n+(x?'  '+x:'')); if(!c) fail.push(n);};

// Simulate a coach who already had the old events saved, with no links.
await p.goto(APP); await p.waitForTimeout(1400);
await p.evaluate(async ()=>{
  const stripped = SEED_EVENTS.map(e=> Object.assign({}, e, { pgUrl:'', pbrUrl:'', ftUrl:'' }));
  localStorage.setItem('events-store', JSON.stringify(stripped));
  ['event-links-filled','seed-events-added'].forEach(k=> localStorage.removeItem(k));
});
await p.reload(); await p.waitForTimeout(1600);
const after = await p.evaluate(()=>({
  total: events.length,
  fall: events.filter(e=>e.season==='fall').length,
  linked: events.filter(e=>e.season==='fall' && e.pgUrl).length,
  pbr: events.filter(e=>e.season==='fall' && e.pbrUrl).length,
  ft: events.filter(e=>e.season==='fall' && e.ftUrl).length,
  either: events.filter(e=>e.season==='fall' && (e.pgUrl||e.pbrUrl||e.ftUrl||e.psUrl)).length,
  flag: localStorage.getItem('event-links-filled'),
  sample: (events.find(e=>/Fall World Series/i.test(e.name))||{}).pgUrl,
}));
console.log('after backfill:', JSON.stringify(after));
ok('existing saved events get filled', after.linked === 92, after.linked + ' linked');
ok('flag set so it runs once', after.flag === 'v3');
ok('PBR links filled too', after.pbr === 18, after.pbr + ' PBR links');
ok('Five Tool links filled too', after.ft === 33, after.ft + ' Five Tool links');
ok('155 fall events now carry a link', after.either === 155, after.either + ' linked');
ok('urls point at PG grouped events', /perfectgame\.org\/Schedule\/GroupedEvents\.aspx\?gid=\d+/.test(after.sample||''), after.sample);

// a link the coach clears must stay cleared
await p.evaluate(async ()=>{
  const e = events.find(x=>/Fall World Series/i.test(x.name));
  e.pgUrl = ''; await saveEvents();
});
await p.reload(); await p.waitForTimeout(1600);
ok('a cleared link is not resurrected',
   (await p.evaluate(()=> (events.find(e=>/Fall World Series/i.test(e.name))||{}).pgUrl)) === '');

// the events table should show the link as saved (green), and open it
await p.evaluate(()=>goTo('fall')); await p.waitForTimeout(800);
const linkStates = await p.evaluate(()=>{
  const rows = [...document.querySelectorAll('a.ev-lnk')];
  return { total: rows.length, saved: rows.filter(r=>r.classList.contains('saved')).length,
           pgSaved: rows.filter(r=>r.classList.contains('saved') && /GroupedEvents/.test(r.href)).length };
});
console.log('link chips:', JSON.stringify(linkStates));
ok('event rows show link chips', linkStates.total > 0);
ok('PG links render as saved, not as a search fallback', linkStates.pgSaved > 20, linkStates.pgSaved + ' saved PG links');
const pbrSaved = await p.evaluate(()=> [...document.querySelectorAll('a.ev-lnk.saved')]
  .filter(r=>/prepbaseballreport\.com\/events\//.test(r.href)).length);
ok('PBR links render as saved', pbrSaved >= 17, pbrSaved + ' saved PBR links');
const ftSaved = await p.evaluate(()=> [...document.querySelectorAll('a.ev-lnk.saved')]
  .filter(r=>/events\.fivetool\.org\/events\//.test(r.href)).length);
ok('Five Tool links render as saved', ftSaved >= 32, ftSaved + ' saved Five Tool links');
const ftDates = await p.evaluate(()=> events.filter(e=>e.ftUrl)
  .filter(e=>{ const m = e.ftUrl.match(/-(\d{2})-(\d{2})-(\d{4})$/);
    return m && `${m[3]}-${m[1]}-${m[2]}` !== e.start; }).map(e=>e.name));
ok('every Five Tool link sits on its own date', ftDates.length === 0, JSON.stringify(ftDates));
const pbrDates = await p.evaluate(()=> events.filter(e=>e.pbrUrl)
  .filter(e=>{ const m = e.pbrUrl.match(/-(\d{2})-(\d{2})-(\d{4})$/);
    return m && `${m[3]}-${m[1]}-${m[2]}` !== e.start; }).map(e=>e.name));
console.log('PBR links whose slug date differs from ours:', JSON.stringify(pbrDates));
ok('at most one PBR link is off its date', pbrDates.length <= 1, JSON.stringify(pbrDates));

// no duplicate gids across different events
const dupes = await p.evaluate(()=>{
  const seen = {}, out = [];
  events.filter(e=>e.pgUrl).forEach(e=>{
    const g = e.pgUrl.split('gid=')[1];
    if(seen[g]) out.push([seen[g], e.name]); else seen[g] = e.name;
  });
  return out;
});
console.log('shared gids:', JSON.stringify(dupes));
// The sheet has one event listed twice on the same date; both correctly get the
// same link. Anything beyond that pair would mean a bad match.
ok('only the known duplicate row shares a link',
   dupes.length === 0 || (dupes.length === 1 && dupes[0][0] === dupes[0][1]),
   JSON.stringify(dupes));

console.log('\n'+(fail.length?'FAILURES: '+fail.join(', '):'ALL PASS'));
await b.close(); process.exit(fail.length?1:0);
