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
await p.locator('[data-goto="fall"]').click(); await p.waitForTimeout(700);
console.log('columns:', (await p.locator('.dt thead th').allTextContents()).map(s=>s.trim()));
console.log('count:', await p.locator('#evCount').textContent());
console.log('all hollow:', await p.locator('.ev-star.on').count() === 0);

console.log('\n== star three, from the middle of the list ==');
const rows = p.locator('tbody tr');
for (const i of [4, 9, 20]) {
  const name = await rows.nth(i).locator('.nm').innerText();
  await rows.nth(i).locator('.ev-star').click(); await p.waitForTimeout(450);
  console.log('  starred:', name);
}
console.log('  count now:', await p.locator('#evCount').textContent());
console.log('  top 4 rows:', (await p.locator('tbody tr').allTextContents()).slice(0,4).map(t=>t.split('\t')[1]||t.slice(0,34).replace(/\n/g,' ')));
console.log('  starred rows highlighted:', await p.locator('tbody tr.starred').count());
await p.screenshot({path:'stars.png'});

console.log('\n== unstar toggles back ==');
await p.locator('tbody tr').first().locator('.ev-star').click(); await p.waitForTimeout(450);
console.log('  count:', await p.locator('#evCount').textContent());

console.log('\n== starred-only filter ==');
await p.check('#evStarred'); await p.waitForTimeout(500);
console.log('  rows:', await p.locator('tbody tr').count(), '|', await p.locator('#evCount').textContent());
console.log('  names:', (await p.locator('tbody .nm').allTextContents()));
await p.uncheck('#evStarred'); await p.waitForTimeout(400);

console.log('\n== combines with other filters ==');
await p.check('#evStarred'); await p.fill('#evSearch','zzzz'); await p.waitForTimeout(500);
console.log('  no match:', await p.locator('#view-events .sec-empty h4').innerText());
await p.fill('#evSearch',''); await p.uncheck('#evStarred'); await p.waitForTimeout(400);

console.log('\n== persists + hub tile + csv ==');
await p.reload(); await p.waitForTimeout(1300);
await p.locator('#evSeasonSeg button[data-season="fall"]').click(); await p.waitForTimeout(600);
console.log('  after reload:', await p.locator('#evCount').textContent(),
            '| starred rows:', await p.locator('tbody tr.starred').count());
const csv = await p.evaluate(()=> eventsToCsv(seasonEvents('fall')).split('\r\n'));
console.log('  csv header has Starred:', csv[0].includes('Starred'));
console.log('  starred row:', csv.slice(1).find(r=>r.includes(',Yes,')).split(',').slice(2,3) + ' -> Yes');
await p.locator('#view-events [data-goto="home"]').click(); await p.waitForTimeout(500);
console.log('  hub tile:', (await p.locator('[data-goto="fall"]').innerText()).split('\n').pop());
console.log('\nERRORS:', errs.length?errs:'none');
await b.close();
