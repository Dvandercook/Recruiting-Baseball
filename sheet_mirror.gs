/**
 * Recruiting Board → Google Sheet mirror
 * ---------------------------------------------------------------------------
 * Copies the shared staff board out of Supabase into this spreadsheet on a
 * timer, so the sheet is always current for sorting, filtering and sharing.
 *
 * This is a ONE-WAY mirror. The app is the source of truth; these tabs are
 * rewritten from scratch on every run. Do not hand-edit them — anything you
 * type will be gone on the next pass. Add your own tabs alongside them freely.
 *
 * Setup lives at the bottom of this file, and in the setup guide.
 */

var TABS = {
  board: 'Board (auto)',
  log:   'Call Log (auto)',
  events:'Events (auto)',
  att:   'Attendance (auto)',
};

var TIER_LABEL = {
  'C':'C — Committed', '1':'1 — Top Lion', '2':'2 — Guy To See',
  '3':'3 — Need To See More', '4':'4 — Recommended/Emailed',
  'XX':'XX — Not A Guy', 'X':'X — Not Interested', 'E':'E — Committed Elsewhere',
};
var METRICS = [
  ['m60','60'], ['mEV','Exit Velo'], ['mFB','FB Velo'], ['mPop','Pop'],
  ['mC','C Velo'], ['mOF','OF Velo'], ['mINF','INF Velo'], ['mBat','Bat Speed'],
];

/* ---- talking to Supabase -------------------------------------------------- */

function cfg_(){
  var p = PropertiesService.getScriptProperties();
  var c = {
    url:  p.getProperty('SUPABASE_URL'),
    key:  p.getProperty('SUPABASE_KEY'),
    email:p.getProperty('MIRROR_EMAIL'),
    pass: p.getProperty('MIRROR_PASSWORD'),
  };
  if(!c.url || !c.key || !c.email || !c.pass){
    throw new Error('Missing script properties. Run setUp() first — see the bottom of this file.');
  }
  c.url = c.url.replace(/\/+$/, '');
  return c;
}

function token_(c){
  var res = UrlFetchApp.fetch(c.url + '/auth/v1/token?grant_type=password', {
    method:'post',
    contentType:'application/json',
    headers:{ apikey: c.key },
    payload: JSON.stringify({ email:c.email, password:c.pass }),
    muteHttpExceptions:true,
  });
  var body = JSON.parse(res.getContentText() || '{}');
  if(res.getResponseCode() !== 200 || !body.access_token){
    throw new Error('Supabase sign-in failed: ' + (body.error_description || res.getContentText()));
  }
  return body.access_token;
}

// Pulls every live record, paging so a big board can't be silently truncated.
function fetchAll_(c, tok){
  var out = [], page = 0, SIZE = 1000;
  while(true){
    var res = UrlFetchApp.fetch(
      c.url + '/rest/v1/records?select=kind,rid,data,deleted,updated_at,updated_by&deleted=eq.false&order=kind.asc,rid.asc',
      { headers:{ apikey:c.key, Authorization:'Bearer ' + tok,
                  Range: (page*SIZE) + '-' + ((page+1)*SIZE - 1) },
        muteHttpExceptions:true });
    if(res.getResponseCode() >= 300){
      throw new Error('Supabase read failed (' + res.getResponseCode() + '): ' + res.getContentText().slice(0,200));
    }
    var rows = JSON.parse(res.getContentText() || '[]');
    out = out.concat(rows);
    if(rows.length < SIZE) break;
    page++;
    if(page > 50) break;              // hard stop; nothing here is that big
  }
  return out;
}

/* ---- turning records back into players ------------------------------------ */

function assemble_(rows){
  var base = {}, ov = {}, custom = {}, removed = {}, events = [], att = [];
  rows.forEach(function(r){
    if(r.kind === 'bp') base[r.rid] = r.data;
    else if(r.kind === 'cp') custom[r.rid] = r.data;
    else if(r.kind === 'ov') ov[r.rid] = r.data;
    else if(r.kind === 'rm') removed[r.rid] = true;
    else if(r.kind === 'ev') events.push(r.data);
    else if(r.kind === 'at') att.push(r.data);
  });
  var players = [];
  Object.keys(base).forEach(function(id){ if(!removed[id]) players.push(base[id]); });
  Object.keys(custom).forEach(function(id){ if(!removed[id]) players.push(custom[id]); });
  return { players: players, ov: ov, events: events, att: att };
}

// Same rule the app uses: a saved edit wins over the original sheet value.
function field_(p, ov, key){
  var o = ov[p.id];
  if(o && o.fields && o.fields[key] !== undefined && o.fields[key] !== '') return o.fields[key];
  return (p[key] === undefined || p[key] === null) ? '' : p[key];
}
function tier_(p, ov){
  var o = ov[p.id];
  if(o && o.tier && TIER_LABEL[o.tier]) return o.tier;
  return p.topLion ? '1' : '2';
}
function tierRank_(t){
  var order = ['C','1','2','3','4','XX','X','E'];
  var i = order.indexOf(t);
  return i < 0 ? 99 : i;
}

/* ---- writing the tabs ----------------------------------------------------- */

function writeTab_(ss, name, header, rows){
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  var all = [header].concat(rows.length ? rows : [header.map(function(){ return ''; })]);
  sh.getRange(1, 1, all.length, header.length).setValues(all);
  sh.getRange(1, 1, 1, header.length)
    .setFontWeight('bold').setBackground('#1b3a2b').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, Math.min(header.length, 20));
  return sh;
}

function mirrorNow(){
  var c = cfg_();
  var tok = token_(c);
  var data = assemble_(fetchAll_(c, tok));
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ov = data.ov;

  var eventName = {};
  data.events.forEach(function(e){ eventName[e.id] = e.name; });
  var goingByPlayer = {};
  data.att.forEach(function(a){
    (goingByPlayer[a.playerId] = goingByPlayer[a.playerId] || [])
      .push(eventName[a.eventId] || a.eventId);
  });

  /* --- Board --- */
  var head = ['Tier','First','Last','Pos','Grad','B/T','Ht','Wt','GPA','State','High School',
              'Travel Team','Phone','Email','X','PBR','PG','Committed To','Coach',
              'Last Contact','Calls Logged','Events'];
  METRICS.forEach(function(m){ head.push(m[1]); });
  head.push('Scouting Notes');

  var players = data.players.slice().sort(function(a,b){
    var d = tierRank_(tier_(a,ov)) - tierRank_(tier_(b,ov));
    if(d) return d;
    return String(field_(a,ov,'last')).localeCompare(String(field_(b,ov,'last')));
  });

  var boardRows = players.map(function(p){
    var o = ov[p.id] || {};
    var log = (o.callLog || []).filter(function(e){ return e && e.ts; });
    var last = '';
    log.forEach(function(e){ if(e.ts > last) last = e.ts; });
    var row = [
      TIER_LABEL[tier_(p,ov)] || tier_(p,ov),
      field_(p,ov,'first'), field_(p,ov,'last'), field_(p,ov,'posDisplay'),
      field_(p,ov,'gradClass'), field_(p,ov,'bt'), field_(p,ov,'height'), field_(p,ov,'weight'),
      field_(p,ov,'gpa'), field_(p,ov,'state'), field_(p,ov,'school'), field_(p,ov,'team'),
      field_(p,ov,'phone'), field_(p,ov,'email'), field_(p,ov,'xLink'),
      field_(p,ov,'pbrLink'), field_(p,ov,'pgLink'), field_(p,ov,'commit'), field_(p,ov,'coach'),
      last ? new Date(last) : '',
      (o.callLog || []).length,
      (goingByPlayer[p.id] || []).join(', '),
    ];
    METRICS.forEach(function(m){ row.push(field_(p, ov, m[0])); });
    row.push(o.notes || '');
    return row;
  });
  var boardSheet = writeTab_(ss, TABS.board, head, boardRows);
  boardSheet.getRange(2, 20, Math.max(boardRows.length,1), 1)
            .setNumberFormat('mmm d, yyyy h:mm am/pm');

  /* --- Call Log: one row per entry, newest first --- */
  var logRows = [];
  players.forEach(function(p){
    var o = ov[p.id] || {};
    (o.callLog || []).forEach(function(e){
      logRows.push([
        e.ts ? new Date(e.ts) : '',
        field_(p,ov,'first') + ' ' + field_(p,ov,'last'),
        TIER_LABEL[tier_(p,ov)] || '',
        e.by || (e.imported ? 'from spreadsheet' : ''),
        e.text || '',
      ]);
    });
  });
  logRows.sort(function(a,b){
    return (b[0] ? b[0].getTime() : 0) - (a[0] ? a[0].getTime() : 0);
  });
  var logSheet = writeTab_(ss, TABS.log, ['When','Player','Tier','Logged By','Entry'], logRows);
  logSheet.getRange(2, 1, Math.max(logRows.length,1), 1)
          .setNumberFormat('mmm d, yyyy h:mm am/pm');
  logSheet.setColumnWidth(5, 520);
  logSheet.getRange(2, 5, Math.max(logRows.length,1), 1).setWrap(true);

  /* --- Events --- */
  var goingCount = {};
  data.att.forEach(function(a){ goingCount[a.eventId] = (goingCount[a.eventId] || 0) + 1; });
  var evRows = data.events.slice().sort(function(a,b){
    return String(a.start || '').localeCompare(String(b.start || ''));
  }).map(function(e){
    return [ e.star ? '★' : '', e.name || '', e.start || '', e.end || '',
             e.location || '', e.division || '', e.season || '', goingCount[e.id] || 0 ];
  });
  writeTab_(ss, TABS.events, ['Top','Event','Start','End','Location','Division','Season','Recruits Going'], evRows);

  /* --- Attendance --- */
  var byId = {};
  data.players.forEach(function(p){ byId[p.id] = p; });
  var attRows = data.att.map(function(a){
    var p = byId[a.playerId];
    return [ eventName[a.eventId] || a.eventId,
             p ? field_(p,ov,'first') + ' ' + field_(p,ov,'last') : a.playerId,
             p ? (TIER_LABEL[tier_(p,ov)] || '') : '',
             p ? field_(p,ov,'posDisplay') : '',
             a.team || '' ];
  }).sort(function(x,y){ return String(x[0]).localeCompare(String(y[0])); });
  writeTab_(ss, TABS.att, ['Event','Player','Tier','Pos','Playing For'], attRows);

  /* --- stamp it, so a stale mirror is obvious rather than misleading --- */
  var stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "MMM d, yyyy 'at' h:mm a");
  [TABS.board, TABS.log, TABS.events, TABS.att].forEach(function(n){
    var sh = ss.getSheetByName(n);
    var col = sh.getLastColumn() + 2;
    sh.getRange(1, col).setValue('Mirrored from the recruiting app — do not edit. Last run: ' + stamp)
      .setFontColor('#888888').setFontSize(9);
  });

  return { players: players.length, log: logRows.length, events: evRows.length };
}

/* ---- setup ----------------------------------------------------------------
   1. Fill in the four values below.
   2. Run setUp() once (Run ▸ setUp). Approve the permissions prompt.
   3. DELETE the four values out of this function and save, so the password
      isn't sitting in the code. It's stored in Script Properties from then on.
   4. Run mirrorNow() once to confirm it works.
   5. Run installTrigger() once to have it refresh every 15 minutes.
--------------------------------------------------------------------------- */
function setUp(){
  PropertiesService.getScriptProperties().setProperties({
    SUPABASE_URL:   'https://YOUR-PROJECT.supabase.co',
    SUPABASE_KEY:   'sb_publishable_YOUR_KEY',
    MIRROR_EMAIL:   'mirror@yourschool.edu',
    MIRROR_PASSWORD:'the password you set for that user',
  });
}

function installTrigger(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    if(t.getHandlerFunction() === 'mirrorNow') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('mirrorNow').timeBased().everyMinutes(15).create();
}

function removeTrigger(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    if(t.getHandlerFunction() === 'mirrorNow') ScriptApp.deleteTrigger(t);
  });
}

// Puts a "Recruiting Board ▸ Refresh now" item in the spreadsheet menu bar.
function onOpen(){
  SpreadsheetApp.getUi().createMenu('Recruiting Board')
    .addItem('Refresh now', 'mirrorNow')
    .addToUi();
}
