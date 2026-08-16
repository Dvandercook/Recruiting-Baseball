import { chromium } from 'playwright';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx = await b.newContext();
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('TUNNEL'))errs.push('CONSOLE: '+m.text().slice(0,120));});
await p.goto('file:///home/claude/recruiting_board_v2.html'); await p.waitForTimeout(900);
await p.locator('[data-goto="hs"]').click(); await p.waitForTimeout(700);

console.log('== filter chips ==');
await p.locator('#bbFiltersBtn').click(); await p.waitForTimeout(300);
console.log('tier chips:', await p.locator('#flTier .fchip').allTextContents());
await p.locator('#bbFiltersBtn').click(); await p.waitForTimeout(200);

console.log('\n== tier picker in a profile ==');
await p.locator('.bb-card').first().click(); await p.waitForTimeout(500);
console.log('name:', await p.locator('#dName').textContent());
console.log('options:', (await p.locator('.tier-opt').allTextContents()).map(s=>s.replace(/\s+/g,' ').trim()));
// set C and check it sticks + sorts first
await p.locator('.tier-opt[data-tier="C"]').click(); await p.waitForTimeout(700);
console.log('badge in drawer:', (await p.locator('#dSub').innerText()).replace(/\n/g,' | '));
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
console.log('first card in RHP col:', (await p.locator('.bb-col').first().locator('.bb-card').first().innerText()).replace(/\n/g,' · '));

console.log('\n== each tier renders ==');
for (const t of ['C','1','2','3','4','XX','X','E']) {
  await p.locator('.bb-card').nth(3).click(); await p.waitForTimeout(350);
  await p.locator(`.tier-opt[data-tier="${t}"]`).click(); await p.waitForTimeout(450);
  const sub = (await p.locator('#dSub').innerText()).replace(/\n/g,' ');
  console.log(`  ${t.padEnd(2)} -> ${sub}`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(250);
}

console.log('\n== grid sidebar tier tabs ==');
await p.locator('#hsModeSeg button[data-mode="grid"]').click(); await p.waitForTimeout(500);
await p.locator('.gt-btn[data-mode="tier"]').click(); await p.waitForTimeout(500);
console.log('sidebar:', (await p.locator('.pos-tab').allTextContents()).map(s=>s.replace(/\s+/g,' ').trim()));

console.log('\n== CSV round trip with new tiers ==');
await p.locator('#hsModeSeg button[data-mode="board"]').click(); await p.waitForTimeout(400);
await p.locator('#importCsvBtn').click(); await p.waitForTimeout(400);
await p.locator('#impFile').setInputFiles('/home/claude/test_tiers.csv'); await p.waitForTimeout(800);
console.log('summary:', (await p.locator('#impSummary').innerText()).replace(/\n/g,' '));
await p.locator('#importConfirm').click(); await p.waitForTimeout(900);
await p.locator('#bbFiltersBtn').click(); await p.waitForTimeout(300);
await p.locator('#flGroup .fchip[data-v="pos"]').click(); await p.waitForTimeout(400);
await p.fill('#searchInput','Tiertest'); await p.waitForTimeout(500);
const cards = await p.locator('.bb-card').all();
for (const c of cards) console.log('  ', (await c.innerText()).replace(/\n/g,' · '));
await p.screenshot({path:'tiers.png'});
console.log('\nERRORS:', errs.length?errs:'none');
await b.close();
