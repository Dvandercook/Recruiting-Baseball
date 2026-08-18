import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'file://' + path.join(ROOT, 'recruiting_board_v2.html');

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}).catch(()=> chromium.launch());
const p = await (await b.newContext()).newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('TUNNEL'))errs.push('CONSOLE: '+m.text().slice(0,120));});
await p.goto(APP); await p.waitForTimeout(1100);
await p.locator('[data-goto="fall"]').click(); await p.waitForTimeout(700);
const first = async n => (await p.locator('tbody tr').allTextContents()).slice(0,n)
  .map(t=>t.replace(/\s+/g,' ').trim().slice(0,58));

console.log('default (dates asc):'); console.log('  ', (await first(3)).join('\n   '));
// star a few spread through the list
for (const i of [6, 30, 90]) { await p.locator('tbody tr').nth(i).locator('.ev-star').click(); await p.waitForTimeout(350); }

console.log('\n-- sort by ★ --');
await p.locator('th[data-sort="star"]').click(); await p.waitForTimeout(500);
console.log('  header:', (await p.locator('th[data-sort="star"]').innerText()).trim(), '| sorted class:', await p.locator('th[data-sort="star"]').evaluate(e=>e.classList.contains('sorted')));
console.log('  ', (await first(4)).join('\n   '));
await p.locator('th[data-sort="star"]').click(); await p.waitForTimeout(500);
console.log('  reversed (unstarred first):', (await first(2)).join(' // '));

console.log('\n-- sort by location --');
await p.locator('th[data-sort="location"]').click(); await p.waitForTimeout(500);
console.log('  asc :', (await p.locator('tbody td:nth-child(5)').allTextContents()).slice(0,4));
await p.locator('th[data-sort="location"]').click(); await p.waitForTimeout(500);
console.log('  desc:', (await p.locator('tbody td:nth-child(5)').allTextContents()).slice(0,4));
console.log('  stars no longer forced to top:', !(await p.locator('tbody tr').first().evaluate(e=>e.classList.contains('starred'))));

console.log('\n-- sort by dates both ways --');
await p.locator('th[data-sort="start"]').click(); await p.waitForTimeout(500);
console.log('  asc :', (await p.locator('tbody td:nth-child(2)').allTextContents()).slice(0,3));
await p.locator('th[data-sort="start"]').click(); await p.waitForTimeout(500);
console.log('  desc:', (await p.locator('tbody td:nth-child(2)').allTextContents()).slice(0,3));

console.log('\n-- date range filter (overlap, not just start) --');
await p.fill('#evFrom','2026-10-01'); await p.waitForTimeout(500);
console.log('  from Oct 1:', await p.locator('#evCount').textContent(), '| first:', (await first(1))[0]);
await p.fill('#evTo','2026-10-05'); await p.waitForTimeout(500);
console.log('  Oct 1-5   :', await p.locator('#evCount').textContent());
console.log('  rows:', (await p.locator('tbody td:nth-child(2)').allTextContents()));
console.log('  clear button visible:', await p.locator('#evRangeClear').isVisible());
await p.locator('#evRangeClear').click(); await p.waitForTimeout(500);
console.log('  after clear:', await p.locator('#evCount').textContent(), '| button hidden:', !(await p.locator('#evRangeClear').isVisible()));

console.log('\n-- range + starred + search together --');
await p.check('#evStarred'); await p.fill('#evFrom','2026-09-01'); await p.waitForTimeout(600);
console.log('  ', await p.locator('#evCount').textContent(), '->', await p.locator('tbody tr').count(), 'rows');
await p.screenshot({path:'sortstar.png'});
console.log('\nERRORS:', errs.length?errs:'none');
await b.close();
