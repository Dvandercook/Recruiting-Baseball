import { chromium } from 'playwright';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx = await b.newContext();
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('TUNNEL'))errs.push('CONSOLE: '+m.text().slice(0,110));});
const popups=[]; ctx.on('page',pg=>popups.push(pg.url()));
await p.goto('file:///home/claude/recruiting_board_v2.html'); await p.waitForTimeout(1100);
await p.locator('[data-goto="hs"]').click(); await p.waitForTimeout(800);

const cards = await p.locator('.bb-card').count();
const withX = await p.locator('.bb-card .bb-x').count();
const noX   = await p.evaluate(()=> allPlayers().filter(x=>!getField(x,'xLink')).length);
console.log(`cards: ${cards} | X icons: ${withX} | players with no X link: ${noX} | ${withX + noX === cards ? 'matches' : 'MISMATCH'}`);

console.log('\n-- clicking X opens the profile, not the drawer --');
await p.fill('#searchInput','Alberto'); await p.waitForTimeout(500);
console.log('  href:', await p.locator('.bb-card .bb-x').first().getAttribute('href'));
console.log('  title:', await p.locator('.bb-card .bb-x').first().getAttribute('title'));
await p.locator('.bb-card .bb-x').first().click({noWaitAfter:true}); await p.waitForTimeout(900);
console.log('  opened a tab:', popups.length > 0);
console.log('  drawer stayed shut:', !(await p.locator('#drawer').evaluate(e=>e.classList.contains('show'))));

console.log('\n-- clicking the card still opens the drawer --');
await p.locator('.bb-card .bb-nm').first().click(); await p.waitForTimeout(600);
console.log('  drawer:', await p.locator('#dName').innerText());
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.fill('#searchInput',''); await p.waitForTimeout(400);
await p.screenshot({path:'bbx.png', clip:{x:0,y:140,width:760,height:420}});

console.log('\n-- sandboxed frame: falls back, no dead click --');
const p2 = await ctx.newPage();
await p2.goto('file:///home/claude/sandbox_host.html'); await p2.waitForTimeout(2200);
const f = p2.frameLocator('#f');
await f.locator('[data-goto="hs"]').click(); await p2.waitForTimeout(900);
await f.locator('.bb-card .bb-x').first().click({noWaitAfter:true}); await p2.waitForTimeout(900);
console.log('  fallback panel:', await f.locator('#linkModal').evaluate(e=>e.classList.contains('show')));
console.log('  title:', await f.locator('#linkTitle').innerText());
console.log('  url:', (await f.locator('#linkUrl').inputValue()).slice(0,52));
console.log('\nERRORS:', errs.length?errs:'none');
await b.close();
