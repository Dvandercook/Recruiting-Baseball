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
const popups=[]; ctx.on('page',pg=>popups.push(pg.url().slice(0,72)));
await p.goto(APP); await p.waitForTimeout(1000);
await p.locator('[data-goto="fall"]').click(); await p.waitForTimeout(700);
console.log('columns:', (await p.locator('.dt thead th').allTextContents()).map(s=>s.trim()));
console.log('links on row 1:', await p.locator('tbody tr').first().locator('.ev-lnk').allTextContents());
console.log('all grey (unsaved):', await p.locator('.ev-lnk.saved').count() === 0);
console.log('hub links:', (await p.locator('.ev-hubs').innerText()).replace(/\n/g,' '));

console.log('\n-- clicking PG opens the search --');
await p.locator('tbody tr').first().locator('.ev-lnk').first().click({noWaitAfter:true}); await p.waitForTimeout(900);
console.log(' ', popups.pop());

console.log('\n-- save a real link --');
await p.locator('tbody tr').first().locator('[data-evedit]').click(); await p.waitForTimeout(500);
console.log('  modal:', await p.locator('#evmName').innerText(), '|', await p.locator('#evmDates').innerText());
await p.fill('#evmPg','https://www.perfectgame.org/Events/Tournaments/Default.aspx?event=12345');
await p.locator('#evmSave').click(); await p.waitForTimeout(800);
console.log('  saved badges now:', await p.locator('.ev-lnk.saved').count());
console.log('  banner:', await p.locator('#lastUpdated').textContent());
await p.locator('tbody tr').first().locator('.ev-lnk.saved').click({noWaitAfter:true}); await p.waitForTimeout(800);
console.log('  saved link opens ->', popups.pop());
await p.screenshot({path:'ev_links.png'});

console.log('\n-- survives reload + exports --');
await p.reload(); await p.waitForTimeout(1100);
console.log('  saved badges after reload:', await p.locator('.ev-lnk.saved').count());
const csv = await p.evaluate(()=> eventsToCsv(seasonEvents('fall')).split('\r\n').slice(0,2));
console.log('  csv header:', csv[0]);
console.log('  csv row 1 :', csv[1].slice(0,150));
console.log('\nERRORS:', errs.length?errs:'none');
await b.close();
