import { chromium } from 'playwright';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx = await b.newContext();
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('TUNNEL'))errs.push('CONSOLE: '+m.text().slice(0,130));});
await p.goto('file:///home/claude/recruiting_board_v2.html'); await p.waitForTimeout(900);
await p.locator('[data-goto="hs"]').click(); await p.waitForTimeout(700);
console.log('mode buttons:', await p.locator('#hsModeSeg button').allTextContents());
console.log('stat:', await p.locator('#bbStat').textContent());
console.log('board visible:', await p.locator('#bbWrap').evaluate(e=>e.classList.contains('active')),
            '| grid hidden:', await p.locator('#hsGridLayout').evaluate(e=>e.style.display));
console.log('columns:', await p.locator('.bb-col').count(),
            '->', (await p.locator('.bb-col-head').allTextContents()).map(s=>s.replace(/\s+/g,' ').trim()));
console.log('cards:', await p.locator('.bb-card').count());
await p.screenshot({path:'bb_default.png'});

console.log('\n-- filters --');
await p.locator('#bbFiltersBtn').click(); await p.waitForTimeout(400);
console.log('panel open:', await p.locator('#bbPanel').evaluate(e=>e.classList.contains('open')));
console.log('class chips:', await p.locator('#flClass .fchip').allTextContents());
console.log('pos chips  :', await p.locator('#flPos .fchip').allTextContents());
console.log('tier chips :', await p.locator('#flTier .fchip').allTextContents());
console.log('bats chips :', await p.locator('#flBats .fchip').allTextContents());
console.log('group chips:', await p.locator('#flGroup .fchip').allTextContents());
await p.locator('#flPos .fchip', {hasText:'RHP'}).click(); await p.waitForTimeout(400);
await p.locator('#flBats .fchip', {hasText:'L'}).first().click(); await p.waitForTimeout(400);
console.log('after POS=RHP + Bats=L ->', await p.locator('#bbFiltersBtn').textContent(), '|', await p.locator('#bbStat').textContent());
console.log('  columns now:', (await p.locator('.bb-col-head').allTextContents()).map(s=>s.replace(/\s+/g,' ').trim()));
await p.locator('#flHt').fill('74'); await p.waitForTimeout(400);
console.log('  Ht 6-2+ ->', await p.locator('#htLabel').textContent(), '|', await p.locator('#bbStat').textContent());
await p.locator('#flReset').click(); await p.waitForTimeout(400);
console.log('after reset:', await p.locator('#bbFiltersBtn').textContent(), '|', await p.locator('#bbStat').textContent());

console.log('\n-- group by --');
for (const g of ['state','team','commit']) {
  await p.locator(`#flGroup .fchip[data-v="${g}"]`).click(); await p.waitForTimeout(500);
  const cols = await p.locator('.bb-col').count();
  const stacked = await p.locator('#bbWrap').evaluate(e=>e.classList.contains('bb-stack'));
  console.log(`  ${g}: ${cols} groups | stacked=${stacked} | first=`, (await p.locator('.bb-col-head').first().innerText()).replace(/\s+/g,' '));
}
await p.locator('#flGroup .fchip[data-v="pos"]').click(); await p.waitForTimeout(400);

console.log('\n-- grid mode --');
await p.locator('#hsModeSeg button[data-mode="grid"]').click(); await p.waitForTimeout(600);
console.log('grid rows:', await p.locator('.row').count(), '| board hidden:', !(await p.locator('#bbWrap').evaluate(e=>e.classList.contains('active'))));
await p.screenshot({path:'bb_grid.png'});

console.log('\n-- card opens drawer + commit field --');
await p.locator('#hsModeSeg button[data-mode="board"]').click(); await p.waitForTimeout(500);
await p.locator('.bb-card').first().click(); await p.waitForTimeout(500);
console.log('drawer:', await p.locator('#dName').textContent(), '| commit field present:', await p.locator('#fi_commit').count());
await p.locator('#fi_commit').fill('Yale'); await p.waitForTimeout(900);
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.locator('#flGroup .fchip[data-v="commit"]').click(); await p.waitForTimeout(500);
console.log('grouped by commit:', (await p.locator('.bb-col-head').allTextContents()).map(s=>s.replace(/\s+/g,' ').trim()).slice(0,3));

console.log('\n-- persistence --');
await p.reload(); await p.waitForTimeout(1100);
console.log('reopened view:', await p.evaluate(()=>document.querySelector('.view.active').id));
console.log('groupBy kept:', await p.locator('#flGroup .fchip.on').textContent());
console.log('\nERRORS:', errs.length?errs:'none');
await b.close();
