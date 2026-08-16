import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'file://' + path.join(ROOT, 'recruiting_board_v2.html');

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx = await b.newContext();
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('TUNNEL'))errs.push('CONSOLE: '+m.text().slice(0,110));});
const popups=[]; ctx.on('page',pg=>popups.push(pg.url().slice(0,80)));
await p.goto(APP); await p.waitForTimeout(1000);
await p.locator('[data-goto="fall"]').click(); await p.waitForTimeout(700);
console.log('fall count before:', await p.locator('#evCount').textContent());

console.log('\n== validation ==');
await p.locator('#evAdd').click(); await p.waitForTimeout(400);
console.log('  title:', await p.locator('#evmTitle').innerText());
await p.locator('#evmSave').click(); await p.waitForTimeout(300);
console.log('  empty save ->', await p.locator('#evmError').innerText());

console.log('\n== Find works from the form ==');
await p.fill('#evmName','2026 PG Fall Invitational Test');
await p.fill('#evmStart','2026-10-24');
await p.fill('#evmDiv','17U');
await p.locator('[data-find="pg"]').click({noWaitAfter:true}); await p.waitForTimeout(800);
console.log(' ', popups.pop());

console.log('\n== add a fall event ==');
await p.fill('#evmEnd','2026-10-26');
await p.fill('#evmLoc','Emerson, GA');
await p.selectOption('#evmSource','Perfect Game');
await p.fill('#evmPg','https://www.perfectgame.org/Events/Tournaments/Default.aspx?event=99999');
await p.locator('#evmSave').click(); await p.waitForTimeout(900);
console.log('  banner:', await p.locator('#lastUpdated').textContent());
console.log('  fall count:', await p.locator('#evCount').textContent());
await p.fill('#evSearch','Invitational Test'); await p.waitForTimeout(500);
const row = p.locator('tbody tr').first();
console.log('  row:', (await row.innerText()).replace(/\t/g,' | ').replace(/\n/g,' '));
console.log('  saved PG badge:', await row.locator('.ev-lnk.saved').count());
console.log('  state derived:', await p.evaluate(()=> events.find(e=>e.name.includes('Invitational Test')).state));
await p.screenshot({path:'addev.png'});

console.log('\n== add a SUMMER event while on the Fall tab ==');
await p.fill('#evSearch','');
await p.locator('#evAdd').click(); await p.waitForTimeout(400);
await p.fill('#evmName','Summer Kickoff Classic');
await p.fill('#evmStart','2027-06-12');
await p.selectOption('#evmSource','Five Tool');
await p.locator('#evmSave').click(); await p.waitForTimeout(900);
console.log('  banner:', await p.locator('#lastUpdated').textContent());
console.log('  now viewing:', await p.locator('#evTitle').innerText(), '|', await p.locator('#evCount').textContent());

console.log('\n== edit + delete ==');
await p.locator('tbody tr').first().locator('[data-evedit]').click(); await p.waitForTimeout(500);
console.log('  title:', await p.locator('#evmTitle').innerText(), '| name:', await p.locator('#evmName').inputValue());
await p.fill('#evmDiv','17U/18U');
await p.locator('#evmSave').click(); await p.waitForTimeout(700);
console.log('  after edit row:', (await p.locator('tbody tr').first().innerText()).replace(/\t/g,' | ').replace(/\n/g,' '));
await p.locator('tbody tr').first().locator('[data-evedit]').click(); await p.waitForTimeout(400);
const del = p.locator('#evmDelete');
await del.click(); await p.waitForTimeout(300);
console.log('  delete 1st click ->', await del.innerText());
await del.click(); await p.waitForTimeout(800);
console.log('  summer count after delete:', await p.locator('#evCount').textContent());

console.log('\n== persistence + hub tile ==');
await p.reload(); await p.waitForTimeout(1300);
console.log('  reopened on:', await p.evaluate(()=>document.querySelector('.view.active').id));
await p.locator('#evSeasonSeg button[data-season="fall"]').click(); await p.waitForTimeout(600);
console.log('  fall count after reload:', await p.locator('#evCount').textContent());
const csv = await p.evaluate(()=> eventsToCsv(seasonEvents('fall')).split('\r\n'));
console.log('  csv header:', csv[0]);
console.log('  added row :', csv.find(r=>r.includes('Invitational Test')).slice(0,170));
await p.locator('#view-events [data-goto="home"]').click(); await p.waitForTimeout(500);
console.log('  hub fall tile:', (await p.locator('[data-goto="fall"]').innerText()).split('\n').pop());
console.log('\nERRORS:', errs.length?errs:'none');
await b.close();
