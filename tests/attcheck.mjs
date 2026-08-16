import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'file://' + path.join(ROOT, 'recruiting_board_v2.html');

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await (await b.newContext()).newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('TUNNEL'))errs.push('CONSOLE: '+m.text().slice(0,120));});
await p.goto(APP); await p.waitForTimeout(1100);

console.log('== add from the PLAYER side ==');
await p.locator('[data-goto="hs"]').click(); await p.waitForTimeout(700);
await p.fill('#searchInput','Alberto'); await p.waitForTimeout(400);
await p.locator('.bb-card').first().click(); await p.waitForTimeout(600);
console.log('  empty state:', await p.locator('#attList .att-none').innerText());
console.log('  event options in list:', await p.locator('#attEventList option').count());
await p.fill('#attEvent','2026 Fall World Series');
await p.fill('#attTeam','NJ Sandlot 17U');
await p.locator('#attAdd').click(); await p.waitForTimeout(800);
console.log('  row:', (await p.locator('#attList .att-row').first().innerText()).replace(/\n/g,' · '));
console.log('  team value:', await p.locator('[data-attteam]').first().inputValue());
// second event, team defaults to the player's program
await p.fill('#attEvent','2026 PG Fall Atlanta Open');
await p.locator('#attAdd').click(); await p.waitForTimeout(700);
console.log('  entries:', await p.locator('#attList .att-row').count());
console.log('  defaulted team:', await p.locator('[data-attteam]').nth(1).inputValue());
// duplicate guard
await p.fill('#attEvent','2026 Fall World Series');
await p.locator('#attAdd').click(); await p.waitForTimeout(500);
console.log('  duplicate ->', await p.locator('#lastUpdated').textContent());
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

console.log('\n== count shows on the EVENT table ==');
await p.locator('#view-hs [data-goto="home"]').click(); await p.waitForTimeout(400);
await p.locator('[data-goto="fall"]').click(); await p.waitForTimeout(700);
await p.fill('#evSearch','Fall World Series'); await p.waitForTimeout(500);
console.log('  row:', (await p.locator('tbody tr').first().innerText()).replace(/\t/g,' | ').replace(/\n/g,' '));

console.log('\n== add from the EVENT side ==');
await p.locator('tbody tr').first().locator('[data-evedit]').click(); await p.waitForTimeout(600);
console.log('  heading count:', await p.locator('#evmAttCount').innerText());
console.log('  existing:', (await p.locator('#evmAttList .att-row').first().innerText()).replace(/\n/g,' · '));
console.log('  player options:', await p.locator('#evmPlayerList option').count());
await p.fill('#evmAttPlayer','Brad Bucci');
await p.fill('#evmAttTeam','Pittsburgh Pirates Scout Team');
await p.locator('#evmAttAdd').click(); await p.waitForTimeout(700);
console.log('  now attending:', await p.locator('#evmAttList .att-row').count(), '| count:', await p.locator('#evmAttCount').innerText());
console.log('  sorted by tier:', (await p.locator('#evmAttList .att-nm').allTextContents()));
await p.locator('#evmAttPlayer').fill('Nobody Here');
await p.locator('#evmAttAdd').click(); await p.waitForTimeout(400);
console.log('  bad name ->', await p.locator('#evmError').innerText());
await p.locator('#evmCancel').click(); await p.waitForTimeout(400);
console.log('  table count now:', (await p.locator('tbody tr').first().innerText()).match(/\d+$|\d+/g).slice(-1));
await p.screenshot({path:'attend.png'});

console.log('\n== persists + both directions agree ==');
await p.reload(); await p.waitForTimeout(1300);
await p.locator('#evSeasonSeg button[data-season="fall"]').click(); await p.waitForTimeout(500);
await p.fill('#evSearch','Fall World Series'); await p.waitForTimeout(500);
console.log('  going after reload:', await p.locator('tbody tr .att-count').first().innerText());
const csv = await p.evaluate(()=> eventsToCsv(seasonEvents('fall')).split('\r\n').find(r=>r.includes('Fall World Series')));
console.log('  event csv tail:', csv.split(',').slice(-2).join(' , '));
const pcsv = await p.evaluate(()=>{
  const p2 = allPlayers().find(x=>getField(x,'last')==='Alberto');
  return eventsForPlayer(p2.id).map(a=>{const e=eventById(a.eventId);return e.name+' ('+a.team+')';});
});
console.log('  player side:', pcsv);
console.log('\nERRORS:', errs.length?errs:'none');
await b.close();
