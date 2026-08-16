import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'file://' + path.join(ROOT, 'recruiting_board_v2.html');

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx = await b.newContext();
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('TUNNEL'))errs.push('CONSOLE: '+m.text().slice(0,130));});
await p.goto(APP); await p.waitForTimeout(900);
console.log('HOME tiles:', await p.locator('.tile').count());
for (const t of await p.locator('.tile').all()){
  const txt=(await t.innerText()).split('\n');
  console.log('  •', txt[0].padEnd(26), '|', txt[txt.length-1]);
}
await p.screenshot({path:'hub_home.png'});

console.log('\nHIGH SCHOOL RECRUITING');
await p.locator('[data-goto="hs"]').click(); await p.waitForTimeout(600);
console.log('  board visible:', await p.locator('#view-hs').evaluate(e=>e.classList.contains('active')),
            '| players:', await p.locator('#totalCount').textContent(),
            '| rows:', await p.locator('.row').count());
await p.locator('#view-hs [data-goto="home"]').click(); await p.waitForTimeout(400);
console.log('  back to hub:', await p.locator('#view-home').evaluate(e=>e.classList.contains('active')));

console.log('\nFALL EVENTS');
await p.locator('[data-goto="fall"]').click(); await p.waitForTimeout(600);
console.log('  title:', await p.locator('#evTitle').textContent(), '| count:', await p.locator('#evCount').textContent());
console.log('  rows:', await p.locator('#evBody tbody tr').count());
console.log('  first row:', (await p.locator('#evBody tbody tr').first().innerText()).replace(/\t/g,' | '));
await p.fill('#evSearch','PG'); await p.waitForTimeout(400);
console.log('  search "PG":', await p.locator('#evCount').textContent());
await p.fill('#evSearch','');
await p.selectOption('#evState','GA'); await p.waitForTimeout(400);
console.log('  state GA:', await p.locator('#evCount').textContent());
await p.selectOption('#evState','');
await p.locator('th[data-sort="name"]').click(); await p.waitForTimeout(400);
console.log('  sorted by name:', (await p.locator('#evBody tbody tr').first().innerText()).split('\t')[1]);
await p.screenshot({path:'hub_events.png'});
await p.locator('#evSeasonSeg button[data-season="summer"]').click(); await p.waitForTimeout(400);
console.log('  summer empty state:', (await p.locator('#view-events .sec-empty h4').innerText()));

console.log('\nCALENDAR');
await p.locator('#view-events [data-goto="home"]').click(); await p.waitForTimeout(300);
await p.locator('[data-goto="calendar"]').click(); await p.waitForTimeout(600);
console.log('  now:', (await p.locator('.cb-now').innerText()));
console.log('  sub:', (await p.locator('.cb-sub').innerText()).slice(0,130));
console.log('  periods:', await p.locator('.cal-row').count(), '| highlighted now:', await p.locator('.cal-row.now').count());
await p.screenshot({path:'hub_cal.png'});

console.log('\nTEAM MANAGEMENT');
await p.locator('#view-calendar [data-goto="home"]').click(); await p.waitForTimeout(300);
await p.locator('[data-goto="team"]').click(); await p.waitForTimeout(500);
console.log('  empty state:', await p.locator('#view-team .sec-empty h4').innerText());
await p.locator('#tmAdd').click(); await p.waitForTimeout(600);
console.log('  rows after add:', await p.locator('#tmBody tbody tr').count());
await p.locator('[data-tf="first"]').first().fill?.('') ;
await p.locator('[data-tf="first"]').first().evaluate(el=>{ el.textContent='Jack'; el.dispatchEvent(new Event('blur')); });
await p.waitForTimeout(500);
await p.locator('[data-tf="posDisplay"]').first().evaluate(el=>{ el.textContent='RHP'; el.dispatchEvent(new Event('blur')); });
await p.waitForTimeout(500);
await p.reload(); await p.waitForTimeout(1100);
console.log('  reopened on:', await p.evaluate(()=>document.querySelector('.view.active').id));
console.log('  after reload row:', (await p.locator('#tmBody tbody tr').first().innerText()).replace(/\t/g,' | ').slice(0,80));

console.log('\nTRANSFER');
await p.locator('#view-team [data-goto="home"]').click(); await p.waitForTimeout(400);
await p.locator('[data-goto="transfer"]').click(); await p.waitForTimeout(400);
console.log('  placeholder:', await p.locator('#view-transfer .sec-empty h4').innerText());
console.log('\nERRORS:', errs.length?errs:'none');
await b.close();
