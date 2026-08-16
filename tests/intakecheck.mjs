/* Profile-link paste and the written-book reader, tested against a fake reader
   endpoint that answers the way the Edge Function would. */
import { chromium } from 'playwright';
import http from 'http';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'file://' + path.join(ROOT, 'recruiting_board_v2.html');


const fail = [];
const ok = (n,c,x='') => { console.log((c?'PASS  ':'FAIL  ')+n+(x?'  '+x:'')); if(!c) fail.push(n); };

/* ---- a stand-in reader service ---- */
let lastRequest = null, mode = 'book';
const srv = http.createServer(async (req,res)=>{
  const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Content-Type':'application/json'};
  if(req.method === 'OPTIONS'){ res.writeHead(200, cors); return res.end('ok'); }
  let b=''; for await (const c of req) b += c;
  lastRequest = { auth: req.headers.authorization || '', body: JSON.parse(b || '{}') };
  if(mode === 'fail'){ res.writeHead(500, cors); return res.end(JSON.stringify({error:'boom'})); }
  const reply = mode === 'book'
    ? { entries: [
        { name:'Brock Bailey',  notes:'Loose arm, downhill plane. Sat 88-90 in the 2nd.', velo:'90', pop:'', sixty:'', ev:'', unsure:false },
        { name:'Levi Abrego',   notes:'Quick hands, plus bat speed. Chased spin.',        velo:'',   pop:'', sixty:'6.71', ev:'99', unsure:false },
        { name:'Ghost Player',  notes:'Not on any roster.',                               velo:'',   pop:'', sixty:'', ev:'', unsure:true },
      ] }
    : { first:'Test', last:'Shot' };
  res.writeHead(200, cors);
  res.end(JSON.stringify({ content:[{ type:'text', text: JSON.stringify(reply) }] }));
});
await new Promise(r=> srv.listen(8803, r));
const ENDPOINT = 'http://127.0.0.1:8803/read';

const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERROR:', e.message));
await p.goto(APP);
await p.waitForTimeout(1000);

/* ================= 1. URL parsing ================= */
const parsed = await p.evaluate(()=>({
  pbrFull: parseProfileUrl('https://www.prepbaseballreport.com/profiles/FL/Kline-Cummings-9805147632'),
  pbrBare: parseProfileUrl('https://www.prepbaseballreport.com/profiles/MA/eddie-ritchie'),
  pg:      parseProfileUrl('https://www.perfectgame.org/Players/Playerprofile.aspx?ID=1104274'),
  junk:    parseProfileUrl('https://example.com/whatever'),
  trailing:parseProfileUrl('https://www.prepbaseballreport.com/profiles/PA/Brad-Bucci-0853142697,'),
}));
console.log('parsed:', JSON.stringify(parsed, null, 1));
ok('PBR url yields name, state and id',
   parsed.pbrFull.name === 'Kline Cummings' && parsed.pbrFull.state === 'FL' && parsed.pbrFull.id === '9805147632');
ok('PBR bare slug yields name and state',
   parsed.pbrBare.name === 'Eddie Ritchie' && parsed.pbrBare.state === 'MA' && parsed.pbrBare.id === '');
ok('PG url yields the id only',
   parsed.pg.id === '1104274' && parsed.pg.name === '' && parsed.pg.field === 'pgLink');
ok('a non-profile url is rejected', parsed.junk === null);
ok('trailing punctuation is trimmed', parsed.trailing && parsed.trailing.id === '0853142697');

/* ================= 2. paste flow ================= */
await p.evaluate(()=>goTo('hs')); await p.waitForTimeout(600);
await p.click('#linkPasteBtn'); await p.waitForTimeout(400);
ok('paste modal opens', await p.locator('#linkPasteModal.show').count() === 1);

const known = await p.evaluate(()=>{
  const pl = allPlayers().find(x=>/bailey/i.test(getField(x,'last')));
  return { id: pl.id, name: getField(pl,'first') + '-' + getField(pl,'last'), state: getField(pl,'state') };
});
await p.fill('#lpText', [
  `https://www.prepbaseballreport.com/profiles/${known.state}/${known.name}-1234567890`,
  'https://www.prepbaseballreport.com/profiles/TX/Brand-Newkid-9999999999',
  'https://www.perfectgame.org/Players/Playerprofile.aspx?ID=1104274',
  'https://example.com/not-a-profile',
].join('\n'));
await p.click('#lpRead'); await p.waitForTimeout(500);
console.log('stat:', await p.locator('#lpStat').textContent());
ok('rows render for each link', await p.locator('.lp-row').count() === 4);
ok('unrecognised link is marked bad', await p.locator('.lp-row.bad').count() === 1);
ok('known player auto-matched', await p.locator('.lp-auto').count() === 1);

const choices = await p.evaluate(()=> lpRows.map(r=> r.parsed ? r.choice : 'n/a'));
console.log('choices:', JSON.stringify(choices));
ok('existing player is preselected', choices[0] === known.id);
ok('unknown PBR name defaults to create', choices[1] === 'new');
ok('PG link waits for a human to pick', choices[2] === '');

// pick a player for the PG row by hand
await p.evaluate((id)=>{
  const sel = document.querySelectorAll('.lp-row select')[2];
  sel.value = id; sel.dispatchEvent(new Event('change'));
}, known.id);
await p.waitForTimeout(300);

const before = await p.evaluate(()=> allPlayers().length);
await p.click('#lpApply'); await p.waitForTimeout(900);
const after = await p.evaluate((k)=>{
  const pl = playerById(k.id);
  return { total: allPlayers().length, pbr: getField(pl,'pbrLink'), pg: getField(pl,'pgLink'),
           created: !!allPlayers().find(x=> /Newkid/i.test(getField(x,'last'))) };
}, known);
console.log('after apply:', JSON.stringify(after));
ok('pbr link attached to the matched player', /1234567890/.test(after.pbr));
ok('pg link attached to the chosen player',   /1104274/.test(after.pg));
ok('unknown name became a new player', after.created === true);
ok('exactly one player was added', after.total === before + 1, `${before} -> ${after.total}`);

// survives a reload
await p.reload(); await p.waitForTimeout(1000);
const persisted = await p.evaluate((id)=> getField(playerById(id),'pbrLink'), known.id);
ok('attached link persists', /1234567890/.test(persisted));

/* ================= 3. reader endpoint config ================= */
await p.evaluate(async (ep)=>{
  Cloud.cfg = { url:'', key:'', ai: ep };
  await Cloud.saveCfg();
  AI.endpoint = ep;
}, ENDPOINT);
ok('AI reports configured', await p.evaluate(()=> AI.configured) === true);

/* ================= 4. written book ================= */
const ev = await p.evaluate(async ()=>{
  const e = events[0];
  const a = allPlayers().find(x=>/bailey/i.test(getField(x,'last')));
  const c = allPlayers().find(x=>/abrego/i.test(getField(x,'last')));
  if(!isAttending(a.id, e.id)) await addAttendance(a.id, e.id, 'Canes');
  if(!isAttending(c.id, e.id)) await addAttendance(c.id, e.id, 'Canes');
  goNotes(e.id);
  return { id:e.id, name:e.name, a:a.id, c:c.id };
});
await p.waitForTimeout(700);
ok('read button is present in Event Notes', await p.locator('#ntRead').count() === 1);
await p.click('#ntRead'); await p.waitForTimeout(400);
ok('book reader opens', await p.locator('#bookReadModal.show').count() === 1);

// a real PNG so the canvas shrink path actually runs
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAKklEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAHwbYnAAAe0hY0oAAAAASUVORK5CYII=',
  'base64');
await p.setInputFiles('#bkrFiles', [{ name:'page1.png', mimeType:'image/png', buffer:png },
                                     { name:'page2.png', mimeType:'image/png', buffer:png }]);
await p.waitForTimeout(400);
ok('pages queue up', await p.locator('.bkr-th').count() === 2);
await p.click('#bkrRead'); await p.waitForTimeout(2500);
console.log('status:', await p.locator('#bkrStatus').textContent());

ok('request carried the roster', /Brock Bailey/.test(JSON.stringify(lastRequest.body)));
ok('images were shrunk to jpeg',
   JSON.stringify(lastRequest.body).includes('image/jpeg'));
ok('both pages were sent',
   (lastRequest.body.messages[0].content.filter(c=>c.type==='image')).length === 2);

const rows = await p.locator('.bkr-row').count();
ok('an entry per transcription', rows === 3, rows + ' rows');
const entryState = await p.evaluate(()=> bkEntries.map(e=>({
  read:e.readName, matched: e.player ? getField(e.player,'last') : null, use:e.use, mx:e.metricLine })));
console.log('entries:', JSON.stringify(entryState, null, 1));
ok('roster names matched', entryState[0].matched === 'Bailey' && entryState[1].matched === 'Abrego');
ok('off-roster name is flagged, not guessed', entryState[2].matched === null && entryState[2].use === false);
ok('unclear handwriting is marked', /unclear/.test(entryState[2].read));
ok('metrics parsed into a line', /Velo 90/.test(entryState[0].mx) && /60 6.71/.test(entryState[1].mx));

await p.click('#bkrApply'); await p.waitForTimeout(1200);
const written = await p.evaluate((e)=>{
  const a = playerById(e.a), c = playerById(e.c);
  return { aNotes:(getNotes(a)||'').slice(0,90), cNotes:(getNotes(c)||'').slice(0,90),
           aFB:getField(a,'mFB'), c60:getField(c,'m60'), cEV:getField(c,'mEV'),
           ghost: !!allPlayers().find(x=>/Ghost/i.test(getField(x,'last'))) };
}, ev);
console.log('written:', JSON.stringify(written, null, 1));
ok('notes landed on the first player', /Loose arm/.test(written.aNotes));
ok('note is stamped with the event', new RegExp(ev.name.slice(0,12).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(written.aNotes));
ok('notes landed on the second player', /Quick hands/.test(written.cNotes));
ok('velo became a measurable', written.aFB === '90');
ok('60 and EV became measurables', written.c60 === '6.71' && written.cEV === '99');
ok('unmatched entry created nobody', written.ghost === false);

/* ================= 5. honest failure ================= */
mode = 'fail';
await p.click('#ntRead'); await p.waitForTimeout(300);
await p.setInputFiles('#bkrFiles', [{ name:'p.png', mimeType:'image/png', buffer:png }]);
await p.waitForTimeout(300);
await p.click('#bkrRead'); await p.waitForTimeout(2000);
const errText = await p.locator('#bkrStatus').textContent();
console.log('error text:', errText);
ok('a server error is reported, not swallowed', /500|reader service/i.test(errText));
ok('nothing was applied after the failure', await p.evaluate(()=> bkEntries.length) === 0);

/* unconfigured endpoint gives actionable advice */
const advice = await p.evaluate(()=>{
  AI.endpoint = '';
  return AI.why(new TypeError('Failed to fetch'));
});
ok('missing endpoint explains itself', /reader endpoint/i.test(advice), advice);

console.log('\n' + (fail.length ? 'FAILURES: ' + fail.join(', ') : 'ALL PASS'));
await b.close(); srv.close();
process.exit(fail.length ? 1 : 0);
