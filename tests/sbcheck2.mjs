import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'file://' + path.join(ROOT, 'recruiting_board_v2.html');

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx = await b.newContext();
const p = await ctx.newPage();
const errs = [];
p.on('console', m => { if(m.type()==='error' && !/TUNNEL/.test(m.text())) errs.push(m.text().slice(0,160)); });
p.on('pageerror', e => errs.push('PAGEERROR '+e.message));
await p.goto('file://' + path.join(ROOT, 'sandbox_host.html')); await p.waitForTimeout(1400);
const f = p.frameLocator('#f');
const fail = [];
const ok = (n,c,x='') => { console.log((c?'PASS  ':'FAIL  ')+n+(x?'  '+x:'')); if(!c) fail.push(n); };

ok('hub loaded in sandbox', await f.locator('[data-goto="hs"]').count() > 0);
await f.locator('[data-goto="hs"]').click(); await p.waitForTimeout(800);
await f.locator('#hsModeSeg button').nth(1).click(); await p.waitForTimeout(500);
await f.locator('#searchInput').fill('Bailey'); await p.waitForTimeout(400);
await f.locator('.row').first().click(); await p.waitForTimeout(500);
ok('drawer opens in sandbox', await f.locator('#fi_m60').count() === 1);
await f.locator('#fi_m60').fill('6.51'); await p.waitForTimeout(900);
const line = await f.locator('#dMarkLine').innerText();
ok('marks recompute in sandbox', /🐇/.test(line), JSON.stringify(line));
await f.locator('#drawer .drawer-close').first().click().catch(()=>{}); await p.waitForTimeout(400);
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

await f.locator('#marksBtn').click(); await p.waitForTimeout(500);
ok('marks modal in sandbox', await f.locator('#mkRules .rule-row').count() >= 3);
await f.locator('#mkClose').click(); await p.waitForTimeout(400);
await f.locator('#mergeBtn').click(); await p.waitForTimeout(600);
const mgTxt = await f.locator('#mgBody').innerText();
ok('merge scan runs in sandbox', mgTxt.length > 10, JSON.stringify(mgTxt.slice(0,70)));
await f.locator('#mgClose').click(); await p.waitForTimeout(300);

// event book inside the sandbox — window.print() may be blocked; must not throw
await f.locator('[data-goto="notes"]').count();
const bookErr = await p.frames()[1].evaluate(()=>{
  try{
    const ev = events[0];
    if(!attendeesOf(ev.id).length) attendance.push({playerId:allPlayers()[0].id, eventId:ev.id, team:'T'});
    buildEventBook(ev.id, {});
    return { ok:true, len: document.getElementById('printBook').innerHTML.length };
  }catch(e){ return { ok:false, err:String(e) }; }
});
console.log('book in sandbox:', JSON.stringify(bookErr));
ok('event book survives sandbox print block', bookErr.ok === true || /print/i.test(bookErr.err||''));

console.log('\nconsole errors:', errs.length ? errs.slice(0,6) : 'none');
console.log(fail.length ? 'FAILURES: '+fail.join(', ') : 'ALL PASS');
await b.close();
