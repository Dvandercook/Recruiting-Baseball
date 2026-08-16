import { chromium } from 'playwright';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport:{width:1400,height:900}});
p.on('pageerror', e => console.log('PAGEERROR:', e.message));
const fail=[]; const ok=(n,c,x='')=>{console.log((c?'PASS  ':'FAIL  ')+n+(x?'  '+x:'')); if(!c) fail.push(n);};
await p.goto('file:///home/claude/recruiting_board_v2.html'); await p.waitForTimeout(1400);

/* ================= STAFF ================= */
await p.evaluate(()=>goTo('tasks')); await p.waitForTimeout(500);
await p.click('#staffBtn'); await p.waitForTimeout(400);
for(const nm of ['David Vandercook','Ryan Ellis','Tom Pike']){
  await p.fill('#cchNew', nm); await p.click('#cchAdd'); await p.waitForTimeout(300);
}
ok('coaches added', await p.locator('.cch-row').count() === 3);
const initials = await p.evaluate(()=> coaches.map(c=>c.initials));
console.log('initials:', JSON.stringify(initials));
ok('initials derived from names', initials[0] === 'DV' && initials[1] === 'RE');
await p.click('#cchDone'); await p.waitForTimeout(300);

/* ================= TASKS ================= */
await p.waitForTimeout(300);
ok('coach select populated', (await p.locator('#tkCoach option').count()) === 4);
const target = await p.evaluate(()=>{
  const pl = allPlayers().find(x=>/bailey/i.test(getField(x,'last')));
  return { id: pl.id, name: getField(pl,'first')+' '+getField(pl,'last') };
});
await p.fill('#tkText','Call Bosco about the visit');
await p.fill('#tkPlayer', target.name);
await p.selectOption('#tkCoach', await p.evaluate(()=>coaches[0].id));
await p.fill('#tkWhen','2026-08-20T09:00');
await p.click('#tkAdd'); await p.waitForTimeout(500);
ok('task created', await p.locator('.tk-row').count() === 1);
const t1 = await p.evaluate(()=> tasks[0]);
console.log('task:', JSON.stringify({text:t1.text, player:!!t1.playerId, coach:!!t1.coach, remind:!!t1.remindAt}));
ok('task links a player', t1.playerId === target.id);
ok('task assigns a coach', !!t1.coach);
ok('task keeps a reminder', /2026-08-20/.test(t1.remindAt));
ok('player chip renders', await p.locator('.tk-player').count() === 1);

// bad player name is refused rather than silently dropped
await p.fill('#tkText','Bogus'); await p.fill('#tkPlayer','Nobody Here');
await p.click('#tkAdd'); await p.waitForTimeout(400);
ok('unknown player name is refused', await p.evaluate(()=> tasks.length) === 1);
await p.fill('#tkPlayer',''); await p.click('#tkAdd'); await p.waitForTimeout(400);
ok('task without a player is fine', await p.evaluate(()=> tasks.length) === 2);

// overdue + done
await p.evaluate(async ()=>{ tasks[1].remindAt = '2020-01-01T00:00:00.000Z'; await saveTasks(); renderTasks(); });
await p.waitForTimeout(300);
ok('overdue task is flagged', await p.locator('.tk-row.late').count() === 1);
const doneId = await p.evaluate(()=> tasks.find(t=>/Call Bosco/.test(t.text)).id);
await p.locator(`[data-tkdone="${doneId}"]`).click(); await p.waitForTimeout(600);
ok('done task leaves the open list', await p.locator('.tk-row').count() === 1);
await p.locator('#tkShowDone').check(); await p.waitForTimeout(400);
ok('done task returns when shown', await p.locator('.tk-row').count() === 2);
ok('open count is right', /1 open/.test(await p.locator('#tkCount').textContent()));

/* ================= CALENDAR ================= */
await p.evaluate(()=>goTo('calendar')); await p.waitForTimeout(700);
ok('board view renders rows', await p.locator('.cg-row').count() > 100,
   (await p.locator('.cg-row').count()) + ' days');
ok('a column per coach', await p.locator('.cg-head .cg-coach').count() === 3);
const ncaaFilled = await p.locator('.cg-ncaa.contact, .cg-ncaa.quiet, .cg-ncaa.dead').count();
ok('NCAA periods paint the backdrop', ncaaFilled > 50, ncaaFilled + ' days coloured');

// book a legal visit
await p.click('#calAdd'); await p.waitForTimeout(400);
await p.fill('#ceDate','2026-09-15');
await p.selectOption('#ceType','official');
await p.fill('#ceWhat','Official visit');
await p.fill('#cePlayer', target.name);
await p.selectOption('#ceCoach', await p.evaluate(()=>coaches[0].id));
await p.click('#ceSave'); await p.waitForTimeout(700);
ok('entry saved', await p.evaluate(()=> calEntries.length) === 1);
ok('entry appears on the board', await p.locator('.ce').count() >= 1);
ok('official visits counted in the banner', /1 official visit/.test(await p.locator('#calBanner').innerText()));

// book into a dead period and expect a warning
const deadDay = await p.evaluate(()=> (CAL_PERIODS.find(x=>/dead/i.test(x.type)) || {}).start);
console.log('dead period starts', deadDay);
await p.click('#calAdd'); await p.waitForTimeout(400);
await p.fill('#ceDate', deadDay);
await p.selectOption('#ceType','visit');
await p.fill('#ceWhat','Campus visit');
await p.click('#ceSave'); await p.waitForTimeout(800);
const warn = await p.locator('#cloudWarn, .alert-bar, #alertBar').first().innerText().catch(()=> '');
const conflicted = await p.evaluate(()=> calEntries.filter(e=> entryConflict(e)).length);
ok('a visit inside a dead period is flagged', conflicted === 1, warn.slice(0,80));
ok('the flagged entry is marked on the board', await p.locator('.ce.bad').count() === 1);

// week / day views
await p.locator('#calViewSeg button[data-calview="week"]').click(); await p.waitForTimeout(500);
ok('week view renders', await p.locator('.cl-block').count() > 0);
await p.locator('#calViewSeg button[data-calview="day"]').click(); await p.waitForTimeout(500);
ok('day view renders', await p.locator('.cl-day').count() > 0);
await p.locator('#calViewSeg button[data-calview="board"]').click(); await p.waitForTimeout(500);

/* ================= EVENT DETAIL ================= */
const ev = await p.evaluate(async ()=>{
  const e = events[0];
  const a = allPlayers().find(x=>/bailey/i.test(getField(x,'last')));
  const c = allPlayers().find(x=>/abrego/i.test(getField(x,'last')));
  if(!isAttending(a.id,e.id)) await addAttendance(a.id, e.id, 'Canes National');
  if(!isAttending(c.id,e.id)) await addAttendance(c.id, e.id, 'Scorpions');
  await setTier(a.id, '1');
  goEventDetail(e.id);
  return { id:e.id, name:e.name, start:e.start };
});
await p.waitForTimeout(700);
ok('event detail opens', await p.locator('#view-edetail').evaluate(e=>getComputedStyle(e).display!=='none'));
ok('empty schedule explains itself', /no schedule yet/i.test(await p.locator('#edBody').innerText()));

await p.click('#edImport'); await p.waitForTimeout(400);
await p.fill('#gimText', [
  'date,time,venue,division,home,away',
  `${ev.start},8:00 AM,Field 3,17U,Canes National,Scorpions`,
  `${ev.start},10:30 AM,Field 1,17U,Marucci Elite,Canes National`,
  `${ev.start},1:00 PM,Field 2,16U,Team Elite,Dallas Tigers`,
].join('\n'));
await p.click('#gimRead'); await p.waitForTimeout(500);
ok('preview counts the games', /3 games/.test(await p.locator('#gimPreview').innerText()));
ok('preview flags games with your players', /with someone from your board/.test(await p.locator('#gimPreview').innerText()),
   (await p.locator('#gimPreview').innerText()).split('\n')[0]);
await p.click('#gimApply'); await p.waitForTimeout(800);
ok('games imported', await p.evaluate(()=> eventGames.length) === 3);
ok('game cards render', await p.locator('.ed-game').count() === 3);

const ranked = await p.locator('.eg-ranked').count();
ok('ranked badge shows on the right games', ranked === 2, ranked + ' games with a ranked player');
const g1 = await p.locator('.ed-game').first().innerText();
console.log('first game:', g1.replace(/\n/g,' | '));
ok('team player counts render', await p.locator('.eg-tc').count() >= 2);
ok('player surnames listed on the card', /Bailey/.test(g1));

// free-form parsing
await p.click('#edImport'); await p.waitForTimeout(400);
await p.fill('#gimText', '2026-09-12 3:15 PM Field 7 16U Ostingers Baseball Academy vs Prime Baseball');
await p.click('#gimRead'); await p.waitForTimeout(400);
const freeform = await p.evaluate(()=> gimRows[0]);
console.log('freeform:', JSON.stringify(freeform));
ok('free-form line parsed', freeform.home === 'Ostingers Baseball Academy'
   && freeform.away === 'Prime Baseball' && freeform.time === '3:15 PM'
   && freeform.division === '16U' && freeform.date === '2026-09-12');
ok('venue kept out of the team name', !/Field/.test(freeform.home));
await p.click('#gimCancel'); await p.waitForTimeout(300);

// attend + notes + filters
await p.locator('[data-egatt]').first().click(); await p.waitForTimeout(500);
ok('attend toggles', await p.evaluate(()=> eventGames.filter(g=>g.attend).length) === 1);
await p.locator('[data-egnote]').first().fill('Watch the RHP first inning');
await p.waitForTimeout(800);
ok('per-game note saves', await p.evaluate(()=> eventGames.find(g=>g.notes)?.notes || '') === 'Watch the RHP first inning');
await p.locator('#edAttendOnly').check(); await p.waitForTimeout(500);
ok('going-only filter works', await p.locator('.ed-game').count() === 1);
await p.locator('#edAttendOnly').uncheck(); await p.waitForTimeout(300);
await p.locator('#edRankedOnly').check(); await p.waitForTimeout(400);
ok('has-one-of-mine filter works', await p.locator('.ed-game').count() === 2);
await p.locator('#edRankedOnly').uncheck(); await p.waitForTimeout(300);

// day tabs
ok('day tabs render', await p.locator('.ed-day').count() >= 2);

// rosters + players tabs
await p.locator('#edTabs button[data-edtab="rosters"]').click(); await p.waitForTimeout(500);
const teams = await p.locator('.ed-team').count();
ok('rosters tab lists teams', teams >= 4, teams + ' teams');
ok('your players show under their team', await p.locator('.et-p').count() >= 2);
await p.locator('#edTabs button[data-edtab="players"]').click(); await p.waitForTimeout(500);
ok('players tab lists attendees', await p.locator('.ed-pl').count() === 2);
ok('players tab counts their games', /game/.test(await p.locator('.ed-pl').first().innerText()));

// day sheet
await p.locator('#edTabs button[data-edtab="schedule"]').click(); await p.waitForTimeout(400);
const sheet = await p.evaluate(()=>{
  const real = window.print; let printed = false;
  window.print = ()=>{ printed = true; };
  buildDaySheet();
  const html = document.getElementById('printBook').innerHTML;
  const shown = document.getElementById('printBook').classList.contains('show');
  document.getElementById('bkClose').click();
  window.print = real;
  return { printed, shown, games:(html.match(/class="bk-p"/g)||[]).length, hasNames:/Bailey/.test(html) };
});
console.log('day sheet:', JSON.stringify(sheet));
ok('day sheet prints only what you are attending', sheet.games === 1 && sheet.printed && sheet.shown);
ok('day sheet names who to watch', sheet.hasNames === true);

// whiteboard
await p.click('#edWhiteboard'); await p.waitForTimeout(400);
await p.fill('#wbText','Ryan has Field 3 at 8. I take Field 1.');
await p.waitForTimeout(900);
ok('whiteboard saves onto the event',
   /Field 3/.test(await p.evaluate((id)=> eventById(id).board || '', ev.id)));
await p.click('#wbDone'); await p.waitForTimeout(300);

/* ================= TRANSFER POOL ================= */
await p.evaluate(()=>goTo('transfer')); await p.waitForTimeout(700);
ok('transfer board opens', await p.locator('#view-hs').evaluate(e=>getComputedStyle(e).display!=='none'));
ok('board title switches', /Transfer/.test(await p.locator('#poolTitle').textContent()));
ok('transfer pool starts empty', (await p.locator('.bb-card').count()) === 0,
   (await p.locator('#bbStat').textContent()));

const tr = await p.evaluate(async ()=>{
  customPlayers.push({ id:'tr-1', first:'Jake', last:'Portal', posPrimary:'RHP', posDisplay:'RHP',
    state:'FL', pool:'transfer', isCustom:true, _defaultTier:'2',
    collegeFrom:'Florida State', elig:'2 years' });
  await saveCustomPlayers();
  renderHs();
  return allPlayers().filter(x=> poolOf(x)==='transfer').length;
});
await p.waitForTimeout(600);
ok('transfer player appears in the transfer pool', tr === 1 && (await p.locator('.bb-card').count()) === 1);
await p.evaluate(()=>goTo('hs')); await p.waitForTimeout(700);
const hsCount = await p.locator('#bbStat').textContent();
console.log('hs stat:', hsCount);
ok('transfer player stays out of the HS board', !/327/.test(hsCount) && /326/.test(hsCount));

// drawer shows transfer-only fields, and only for transfers
await p.evaluate(()=>goTo('transfer')); await p.waitForTimeout(600);
await p.locator('.bb-card').first().click(); await p.waitForTimeout(600);
ok('transfer fields show on a transfer', await p.locator('#fi_collegeFrom').count() === 1);
ok('coming-from value renders', (await p.locator('#fi_collegeFrom').inputValue()) === 'Florida State');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.evaluate(()=>goTo('hs')); await p.waitForTimeout(600);
await p.locator('.bb-card').first().click(); await p.waitForTimeout(600);
ok('transfer fields hidden on a high schooler', await p.locator('#fi_collegeFrom').count() === 0);
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

// a player added while the transfer board is open joins that pool
await p.evaluate(()=>goTo('transfer')); await p.waitForTimeout(500);
await p.click('#addPlayerBtn'); await p.waitForTimeout(400);
await p.fill('#f_first','Second'); await p.fill('#f_last','Portalguy'); await p.fill('#f_pos','OF');
await p.click('#submitAdd'); await p.waitForTimeout(900);
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
const pools = await p.evaluate(()=>({
  transfer: allPlayers().filter(x=> poolOf(x)==='transfer').length,
  hs: allPlayers().filter(x=> poolOf(x)==='hs').length }));
console.log('pools:', JSON.stringify(pools));
ok('new player joined the open pool', pools.transfer === 2 && pools.hs === 326);

/* ================= persistence ================= */
await p.reload(); await p.waitForTimeout(1600);
const after = await p.evaluate(()=>({
  coaches: coaches.length, tasks: tasks.length, cal: calEntries.length,
  games: eventGames.length, transfer: allPlayers().filter(x=>poolOf(x)==='transfer').length,
  attend: eventGames.filter(g=>g.attend).length }));
console.log('after reload:', JSON.stringify(after));
ok('everything persists', after.coaches===3 && after.tasks===2 && after.cal===2
   && after.games===3 && after.transfer===2 && after.attend===1, JSON.stringify(after));

/* hub tiles */
await p.evaluate(()=>goTo('home')); await p.waitForTimeout(500);
const tasksTile = await p.locator('.tile', {hasText:'Tasks'}).innerText();
const trTile = await p.locator('.tile', {hasText:'Transfer Recruiting'}).innerText();
console.log('tiles:', tasksTile.replace(/\n/g,' | '), '||', trTile.replace(/\n/g,' | '));
ok('tasks tile counts open work', /open/.test(tasksTile));
ok('transfer tile counts the pool', /2 in the pool/.test(trTile));

console.log('\n' + (fail.length ? 'FAILURES: '+fail.join(', ') : 'ALL PASS'));
await b.close();
process.exit(fail.length?1:0);
