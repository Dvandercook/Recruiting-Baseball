import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'file://' + path.join(ROOT, 'recruiting_board_v2.html');

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}).catch(()=> chromium.launch());
const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERROR:', e.message));
const fail=[]; const ok=(n,c,x='')=>{console.log((c?'PASS  ':'FAIL  ')+n+(x?'  '+x:'')); if(!c) fail.push(n);};
await p.goto(APP); await p.waitForTimeout(1200);

/* ---- data encoding survived ---- */
const data = await p.evaluate(()=>{
  const a = PLAYERS.find(x=>/bailey/i.test(x.last));
  const withGpa = PLAYERS.filter(x=> x.gpa).length;
  const zips = PLAYERS.map(x=>x.zip).filter(Boolean).filter(z=>/\.0$/.test(String(z)));
  return { n:PLAYERS.length, ev:SEED_EVENTS.length, sample:{first:a.first,last:a.last,state:a.state,
    school:a.school,grad:a.gradClass,gpa:a.gpa,weight:a.weight,topLion:a.topLion,phone:a.phone},
    withGpa, badZips:zips.length,
    lions: PLAYERS.filter(x=>x.topLion).length,
    emptyIsEmpty: PLAYERS.filter(x=> x.commit === '').length };
});
console.log('data:', JSON.stringify(data));
ok('all players decoded', data.n === 326);
ok('all events decoded', data.ev === 166, String(data.ev));
ok('strings intact', data.sample.school && data.sample.phone);
ok('grad class intact', String(data.sample.grad) === '2028', String(data.sample.grad));
ok('no float artefacts in zips', data.badZips === 0);
ok('topLion still truthy', data.lions > 0 && data.lions < 326, data.lions + ' top lions');
ok('missing values are empty strings', data.emptyIsEmpty > 0);

/* ---- travel orgs ---- */
await p.evaluate(()=>goTo('orgs')); await p.waitForTimeout(600);
ok('orgs view renders', await p.locator('#view-orgs').evaluate(e=>getComputedStyle(e).display!=='none'));
ok('starts empty', (await p.locator('.og-row').count()) === 0);
await p.click('#ogSeed'); await p.waitForTimeout(600);
const seeded = await p.locator('.og-row').count();
ok('starter list loads', seeded > 20, seeded + ' programs');
ok('nothing is pre-ranked', await p.evaluate(()=> travelOrgs.every(o=> !o.rank && !o.tier)));

// set a tier
await p.evaluate(()=>{
  const row=[...document.querySelectorAll('.og-row')].find(r=>/Canes Baseball/i.test(r.querySelector('.og-name').value));
  const s=row.querySelector('.og-tier'); s.value='A'; s.dispatchEvent(new Event('change'));
});
await p.waitForTimeout(500);
ok('tier saves', await p.evaluate(()=> travelOrgs.find(o=>/canes baseball/i.test(o.name)).tier === 'A'));

// paste a ranked list
await p.click('#ogPasteBtn'); await p.waitForTimeout(400);
await p.fill('#ogPasteText', '1. Canes Baseball\n2. Brand New Program — TX\n3. East Cobb Baseball');
await p.click('#ogPasteApply'); await p.waitForTimeout(700);
const ranked = await p.evaluate(()=>({
  canes: travelOrgs.find(o=>/canes baseball/i.test(o.name)),
  fresh: travelOrgs.find(o=>/Brand New/i.test(o.name)),
  total: travelOrgs.length }));
console.log('ranked:', JSON.stringify(ranked));
ok('rank applied to an existing program', ranked.canes && ranked.canes.rank === '1');
ok('existing tier survived the paste', ranked.canes && ranked.canes.tier === 'A');
ok('new program created from the paste', !!ranked.fresh && ranked.fresh.rank === '2');
ok('region parsed off the line', ranked.fresh && ranked.fresh.region === 'TX', ranked.fresh && ranked.fresh.region);

// build from board: attendance travel teams
await p.evaluate(async ()=>{
  const pl = allPlayers()[0], ev = events[0];
  await addAttendance(pl.id, ev.id, 'Ostingers Baseball Academy');
  const p2 = allPlayers()[1];
  await addAttendance(p2.id, ev.id, 'A Club Not In The List');
});
await p.click('#ogFromBoard'); await p.waitForTimeout(700);
ok('board travel teams become programs',
   await p.evaluate(()=> travelOrgs.some(o=>/A Club Not In The List/i.test(o.name))));
const counts = await p.evaluate(()=>{
  const o = travelOrgs.find(x=>/Ostingers/i.test(x.name));
  return { ids: orgPlayerIds(o.name).length, ev: orgEventCount(o.name) };
});
console.log('counts:', JSON.stringify(counts));
ok('recruit count ties to attendance', counts.ids === 1);
ok('event count ties to attendance', counts.ev === 1);
await p.waitForTimeout(300);
ok('recruit pill renders', await p.locator('.og-n').count() >= 1);

// sort + search + persistence
await p.fill('#ogSearch','Canes'); await p.waitForTimeout(300);
ok('search filters', await p.locator('.og-row').count() >= 1 && await p.locator('.og-row').count() < seeded);
await p.fill('#ogSearch',''); await p.waitForTimeout(300);
await p.locator('#ogHeads [data-ogsort="rank"]').click(); await p.waitForTimeout(400);
const firstAfterSort = await p.locator('.og-row .og-name').first().inputValue();
ok('sort by rank puts ranked first', /Canes/i.test(firstAfterSort), firstAfterSort);

await p.reload(); await p.waitForTimeout(1200);
await p.evaluate(()=>goTo('orgs')); await p.waitForTimeout(600);
const after = await p.evaluate(()=>({ n:travelOrgs.length,
  tiered:travelOrgs.filter(o=>o.tier).length, ranked:travelOrgs.filter(o=>o.rank).length }));
console.log('after reload:', JSON.stringify(after));
ok('list persists', after.n === ranked.total + 1, `${after.n} vs expected ${ranked.total + 1}`);
ok('tiers persist', after.tiered === 1);
ok('ranks persist', after.ranked === 3);

// hub tile
await p.evaluate(()=>goTo('home')); await p.waitForTimeout(400);
const tile = await p.locator('.tile', {hasText:'Travel Organizations'}).innerText();
console.log('tile:', tile.replace(/\n/g,' | '));
ok('hub tile shows a count', /programs/.test(tile));

console.log('\n' + (fail.length ? 'FAILURES: '+fail.join(', ') : 'ALL PASS'));
await b.close();
process.exit(fail.length?1:0);
