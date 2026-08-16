import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'file://' + path.join(ROOT, 'recruiting_board_v2.html');

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await (await b.newContext()).newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('TUNNEL'))errs.push('CONSOLE: '+m.text().slice(0,120));});
await p.goto(APP); await p.waitForTimeout(1200);
console.log('hub tiles:', await p.locator('.tile').count());
console.log('notes tile:', (await p.locator('[data-goto="notes"]').innerText()).replace(/\n/g,' | '));

console.log('\n== event picker ==');
await p.locator('[data-goto="notes"]').click(); await p.waitForTimeout(700);
console.log('  options shown:', await p.locator('#ntPick button').count());
console.log('  first:', (await p.locator('#ntPick button').first().innerText()).replace(/\n/g,' · '));
await p.locator('#ntPick button').first().click(); await p.waitForTimeout(700);
console.log('  opened:', await p.locator('#ntTitle').innerText(), '|', await p.locator('#ntSub').innerText());
console.log('  empty state:', (await p.locator('.nt-empty').innerText()).split('\n')[0]);

console.log('\n== paste a roster ==');
await p.locator('#ntPaste').click(); await p.waitForTimeout(500);
await p.fill('#pmText', `12  Michael Alberto  C
Brad Bucci, Peters Township
#7 Kline Cummings LHP
Jimmy Notreal, Some Academy`);
await p.locator('#pmGo').click(); await p.waitForTimeout(700);
console.log('  summary:', (await p.locator('#pmResult .imp-summary').innerText()).replace(/\n/g,' '));
console.log('  matched:', (await p.locator('#pmResult .imp-preview').first().innerText()).replace(/\n/g,' | ').slice(0,150));
console.log('  button:', await p.locator('#pmGo').innerText());
await p.locator('#pmGo').click(); await p.waitForTimeout(1000);
console.log('  banner:', await p.locator('#lastUpdated').textContent());
console.log('  roster rows:', await p.locator('.nt-card').count(), '|', await p.locator('#ntCount').innerText());

console.log('\n== take a note with metrics + tier ==');
await p.locator('.nt-card .nt-row').first().click(); await p.waitForTimeout(600);
const who = await p.locator('.nt-card.open .nt-nm').innerText();
console.log('  opened:', who);
await p.fill('#ntText','Sat 88-90 with a clean arm action. Fastball played up in the zone.');
await p.fill('#ntVelo','90'); await p.fill('#ntSixty','6.9');
await p.locator('[data-nttier="1"]').click(); await p.waitForTimeout(400);
await p.locator('#ntSave').click(); await p.waitForTimeout(1200);
console.log('  after save, "noted" badges:', await p.locator('.nt-seen').count());
console.log('  count line:', await p.locator('#ntCount').innerText());

console.log('\n== it landed on the profile ==');
await p.locator('#view-notes [data-goto="home"]').click(); await p.waitForTimeout(400);
await p.locator('[data-goto="hs"]').click(); await p.waitForTimeout(700);
await p.fill('#searchInput', who.split(' ')[1]); await p.waitForTimeout(500);
await p.locator('.bb-card').first().click(); await p.waitForTimeout(700);
console.log('  tier now:', (await p.locator('#dSub').innerText()).replace(/\n/g,' | '));
console.log('  scouting notes:\n   ', (await p.locator('#notesArea').inputValue()).split('\n').join('\n    '));
await p.screenshot({path:'notes.png'});

console.log('\n== survives reload ==');
await p.reload(); await p.waitForTimeout(1300);
console.log('  reopened on:', await p.evaluate(()=>document.querySelector('.view.active').id));
console.log('  attendance rows:', await p.evaluate(()=>attendance.length));
console.log('\nERRORS:', errs.length?errs:'none');
await b.close();
