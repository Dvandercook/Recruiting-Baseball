import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'file://' + path.join(ROOT, 'recruiting_board_v2.html');

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}).catch(()=> chromium.launch());
const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERROR:', e.message));
p.on('console', m => { if(m.type()==='error') console.log('CONSOLE ERR:', m.text()); });
await p.goto(APP);
await p.waitForTimeout(900);

const fail = [];
const ok = (name, cond, extra='') => { console.log((cond?'PASS  ':'FAIL  ')+name+(extra?'  '+extra:'')); if(!cond) fail.push(name); };

/* ---------- 1. measurables save + auto marks ---------- */
await p.evaluate(()=>goTo('hs')); await p.waitForTimeout(700);
// grid mode
await p.locator('#hsModeSeg button').nth(1).click(); await p.waitForTimeout(400);
// find a player and open drawer
await p.fill('#searchInput','Bailey'); await p.waitForTimeout(300);
await p.locator('.row').first().click(); await p.waitForTimeout(400);
const nm = await p.locator('#dName').textContent();
console.log('drawer:', nm);
ok('measurable inputs render', await p.locator('#fi_m60').count() === 1);
await p.fill('#fi_m60','6.42'); await p.locator('#fi_m60').blur(); await p.waitForTimeout(350);
await p.fill('#fi_mEV','103'); await p.locator('#fi_mEV').blur(); await p.waitForTimeout(900);
const markLine = await p.locator('#drawer .mx-grid').locator('xpath=following-sibling::div[1]').innerText();
ok('drawer shows auto marks', /🐇/.test(markLine) && /💣/.test(markLine), JSON.stringify(markLine));
const hdrMarks = await p.locator('#drawer').innerText();
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

// persistence across reload
await p.reload(); await p.waitForTimeout(1000);
await p.evaluate(()=>goTo('hs')); await p.waitForTimeout(500);
await p.locator('#hsModeSeg button').nth(1).click(); await p.waitForTimeout(400);
await p.fill('#searchInput','Bailey'); await p.waitForTimeout(300);
const rowTxt = await p.locator('.row').first().innerText();
ok('grid row shows marks', /🐇/.test(rowTxt) && /💣/.test(rowTxt), JSON.stringify(rowTxt.replace(/\n/g,' | ')));
await p.locator('.row').first().click(); await p.waitForTimeout(400);
ok('60 persisted', (await p.locator('#fi_m60').inputValue()) === '6.42');
ok('EV persisted', (await p.locator('#fi_mEV').inputValue()) === '103');
await p.keyboard.press('Escape'); await p.waitForTimeout(250);

/* ---------- 2. big board card marks ---------- */
await p.fill('#searchInput',''); await p.waitForTimeout(200);
await p.locator('#hsModeSeg button').first().click(); await p.waitForTimeout(700);
const boardHtml = await p.locator('#bbWrap').innerText().catch(()=>'');
ok('board card shows marks', /🐇/.test(boardHtml) || /💣/.test(boardHtml), boardHtml.slice(0,0));

/* ---------- 3. rules editor ---------- */
await p.click('#marksBtn'); await p.waitForTimeout(400);
ok('marks modal opens', await p.locator('#marksModal.show').count() === 1);
const hits0 = await p.locator('#mkRules .rule-hits').first().textContent();
ok('rule hit counts render', /player/.test(hits0), hits0);
const gpaCount = await p.locator('#mkGpaCount').textContent();
ok('gpa count renders', /earn it/.test(gpaCount), gpaCount);
// change the 60 rule to something absurd so Bailey stops qualifying
await p.locator('#mkRules .rule-row').first().locator('input.val').fill('5.0');
await p.locator('#mkRules .rule-row').first().locator('input.val').dispatchEvent('change');
await p.waitForTimeout(300);
await p.click('#mkSave'); await p.waitForTimeout(500);
await p.locator('#hsModeSeg button').nth(1).click(); await p.waitForTimeout(300);
await p.fill('#searchInput','Bailey'); await p.waitForTimeout(300);
const rowTxt2 = await p.locator('.row').first().innerText();
ok('rule change retags', !/🐇/.test(rowTxt2) && /💣/.test(rowTxt2), JSON.stringify(rowTxt2.replace(/\n/g,' | ')));
// restore defaults
await p.click('#marksBtn'); await p.waitForTimeout(300);
await p.click('#mkReset'); await p.waitForTimeout(250);
await p.click('#mkSave'); await p.waitForTimeout(400);
await p.fill('#searchInput','Bailey'); await p.waitForTimeout(300);
ok('reset restores rules', /🐇/.test(await p.locator('.row').first().innerText()));

/* ---------- 4. merge tool ---------- */
// seed a duplicate through the app's own add path
const added = await p.evaluate(async ()=>{
  const src = allPlayers().find(x=>/bailey/i.test(getField(x,'last')));
  const id = 'custom-dup-test-1';
  customPlayers.push({ id, first:getField(src,'first'), last:getField(src,'last'),
     posPrimary:'RHP', posDisplay:'RHP', state:'ZZ', school:'Dup High', email:'dup@test.com',
     pgLink:'https://www.perfectgame.org/Players/Playerprofile.aspx?ID=999999',
     isCustom:true, _defaultTier:'2' });
  overrides[id] = { tier:'2', notes:'dup-side note' };
  await saveCustomPlayers(); await saveOverrides();
  return { id, total: allPlayers().length };
});
console.log('seeded dup:', JSON.stringify(added));
await p.waitForTimeout(300);
await p.click('#mergeBtn'); await p.waitForTimeout(500);
ok('merge modal opens', await p.locator('#mergeModal.show').count() === 1);
const pairCount = await p.locator('.mg-pair').count();
ok('duplicate pair found', pairCount >= 1, pairCount + ' pair(s)');
const beforeTotal = await p.evaluate(()=>allPlayers().length);
if(pairCount){
  const pairTxt = await p.locator('.mg-pair').first().innerText();
  console.log('pair:', pairTxt.replace(/\n/g,' | ').slice(0,200));
  await p.locator('.mg-pair').first().locator('[data-mgdo]').click();
  await p.waitForTimeout(700);
}
const afterTotal = await p.evaluate(()=>allPlayers().length);
ok('merge removes one record', afterTotal === beforeTotal - 1, `${beforeTotal} -> ${afterTotal}`);
const survivor = await p.evaluate(()=>{
  const s = allPlayers().find(x=>/bailey/i.test(getField(x,'last')));
  return { email:getField(s,'email'), pgLink:getField(s,'pgLink'), m60:getField(s,'m60'), notes:(getNotes(s)||'').slice(0,60),
           school:getField(s,'school'), n:allPlayers().filter(x=>/bailey/i.test(getField(x,'last'))).length };
});
console.log('survivor:', JSON.stringify(survivor));
ok('merge fills only blanks', /999999/.test(survivor.pgLink||'') && survivor.email !== 'dup@test.com');
ok('merge carries notes over', /dup-side note/.test(survivor.notes||''));
ok('merge keeps keeper measurables', survivor.m60 === '6.42');
ok('only one Bailey remains', survivor.n === 1);
await p.click('#mgClose').catch(()=>{}); await p.waitForTimeout(300);

/* ---------- 5. event book ---------- */
const book = await p.evaluate(()=>{
  const ev = events.find(e=> attendeesOf(e.id).length > 0) || events[0];
  if(!ev) return { err:'no events' };
  // attach a player if the event has none
  if(!attendeesOf(ev.id).length){
    const pl = allPlayers()[0];
    attendance.push({ playerId: pl.id, eventId: ev.id, team:'Test Travel' });
  }
  const realPrint = window.print; let printed = false;
  window.print = ()=>{ printed = true; };
  buildEventBook(ev.id, {});
  const filled = document.getElementById('printBook').innerHTML;
  const onScreen = document.getElementById('printBook').classList.contains('show')
                && document.getElementById('bkBar').classList.contains('show');
  buildEventBook(ev.id, {blank:true});
  const blank = document.getElementById('printBook').innerHTML;
  document.getElementById('bkClose').click();
  const closed = !document.getElementById('printBook').classList.contains('show');
  window.print = realPrint;
  return { printed, onScreen, closed, evName: ev.name, players: (filled.match(/class="bk-p"/g)||[]).length,
           hasHead: /bk-head/.test(filled), blankBoxes: (blank.match(/bk-blank/g)||[]).length,
           sample: filled.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,240) };
});
console.log('book:', JSON.stringify(book));
ok('event book calls print', book.printed === true);
ok('event book renders players', book.players >= 1, book.players + ' entries');
ok('event book has header', book.hasHead === true);
ok('blank book has note space', book.blankBoxes >= 1);
ok('book shows on screen', book.onScreen === true);
ok('book closes', book.closed === true);

/* ---------- 6. note metrics write measurables ---------- */
const nt = await p.evaluate(async ()=>{
  const pl = allPlayers().find(x=>/bailey/i.test(getField(x,'last')));
  const before = getField(pl,'mFB');
  await setField(pl.id,'mFB','');
  return { before };
});
console.log('note-metric precheck:', JSON.stringify(nt));

/* ---------- 7. no regressions in existing views ---------- */
for (const s of ['hs','transfer','calendar','team','notes','fall','summer','spring']) {
  const shown = await p.evaluate(async (sec)=>{
    goTo(sec); await new Promise(r=>setTimeout(r,200));
    const def = SECTIONS.find(x=>x.id===sec);
    const el = document.getElementById(def.view);
    return !!el && getComputedStyle(el).display !== 'none' && el.innerText.trim().length > 20;
  }, s);
  ok('view '+s+' renders', shown);
}
const errsSeen = await p.evaluate(()=>0);

await p.screenshot({path:'batch.png', fullPage:false});
console.log('\n' + (fail.length ? 'FAILURES: ' + fail.join(', ') : 'ALL PASS'));
await b.close();
