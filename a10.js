/* ==========================================================================
   Two intake routes, plus the model access they need.

   The original screenshot reader called api.anthropic.com straight from the
   page. That only ever worked inside the Claude preview, which quietly proxies
   it — from a hosted copy the call fails outright. So anything that needs a
   model now goes through AI.call(), which prefers a proxy you deploy (the key
   stays on the server) and falls back to the direct call when we happen to be
   running inside the preview.
   ========================================================================== */
var AI = {
  endpoint: '',
  async load(){
    try{
      const raw = await Store.get(CLOUD_CFG_KEY);
      if(raw) this.endpoint = (JSON.parse(raw).ai || '').trim();
    }catch(e){ this.endpoint = ''; }
  },
  get configured(){ return !!this.endpoint; },

  async call(payload){
    const body = JSON.stringify(Object.assign({ model:'claude-sonnet-4-6' }, payload));
    let res, via;
    if(this.endpoint){
      const headers = { 'Content-Type':'application/json' };
      const tok = (typeof Cloud !== 'undefined' && Cloud && Cloud.signedIn) ? await Cloud.token() : null;
      if(tok) headers.Authorization = 'Bearer ' + tok;
      via = 'proxy';
      res = await fetch(this.endpoint, { method:'POST', headers, body });
    }else{
      via = 'preview';
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST', headers:{ 'Content-Type':'application/json' }, body });
    }
    if(!res.ok){
      const t = await res.text().catch(()=> '');
      throw new Error(via === 'proxy'
        ? `The reader service answered ${res.status}. ${t.slice(0,140)}`
        : `Reading is not available in this copy (${res.status}). Set a reader endpoint in Sync → Project connection.`);
    }
    const data = await res.json();
    const block = (data.content || []).find(b=> b.type === 'text');
    if(!block) throw new Error('The model sent nothing back.');
    return block.text;
  },

  json(text){
    const cleaned = String(text || '').replace(/```json|```/g, '').trim();
    const start = cleaned.search(/[{[]/);
    return JSON.parse(start > 0 ? cleaned.slice(start) : cleaned);
  },

  // Why a failure happened, in words a coach can act on.
  why(err){
    const m = String(err && err.message || err);
    if(/failed to fetch|networkerror|load failed/i.test(m)){
      return this.endpoint
        ? 'Could not reach the reader service. Check the endpoint in Sync → Project connection.'
        : 'Reading images needs a reader endpoint. Open Sync → Project connection and add one — the setup guide has the steps.';
    }
    return m;
  },
};

// Big phone photos are slow and expensive to send; 1500px is plenty for reading
// handwriting and cuts a 4MB picture to a couple hundred KB.
function shrinkImage(file, maxPx){
  maxPx = maxPx || 1500;
  return new Promise((resolve, reject)=>{
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = ()=>{
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width  = Math.round(img.width  * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve({ data: c.toDataURL('image/jpeg', 0.78).split(',')[1], media: 'image/jpeg' });
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

/* ==========================================================================
   1. Paste a PG / PBR profile link
   Everything here is parsed out of the URL itself — no lookups, no guessing.
   A PBR address carries the name and state; a Perfect Game one carries only
   an id, so those always ask you which player it belongs to.
   ========================================================================== */
function parseProfileUrl(raw){
  const u = String(raw || '').trim().replace(/[),.]+$/, '');
  if(!u) return null;
  var m = u.match(/prepbaseballreport\.com\/profiles\/([A-Za-z]{2})\/([^\/?#\s]+)/i);
  if(m){
    var st = m[1].toUpperCase(), slug = m[2], id = '';
    var idm = slug.match(/-(\d{6,})$/);
    if(idm){ id = idm[1]; slug = slug.slice(0, idm.index); }
    var name = slug.split('-').filter(Boolean).map(function(w){
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }).join(' ');
    return { site:'PBR', field:'pbrLink', url:u, name:name, state:st, id:id };
  }
  if(/perfectgame\.org/i.test(u)){
    m = u.match(/[?&]id=(\d+)/i);
    return { site:'PG', field:'pgLink', url:u, name:'', state:'', id: m ? m[1] : '' };
  }
  return null;
}

function matchByName(name, state){
  if(!name) return [];
  var n = normName(name);
  var hits = allPlayers().filter(function(p){
    return normName(getField(p,'first') + ' ' + getField(p,'last')) === n; });
  if(hits.length > 1 && state){
    var narrowed = hits.filter(function(p){
      return String(getField(p,'state')).toUpperCase() === state; });
    if(narrowed.length) hits = narrowed;
  }
  return hits;
}

let lpRows = [];
function playerOptionsHtml(selectedId){
  return allPlayers().slice().sort(function(a,b){
    return String(getField(a,'last')).localeCompare(String(getField(b,'last'))); })
    .map(function(p){
      return '<option value="' + escAttr(p.id) + '"' + (p.id === selectedId ? ' selected' : '') + '>'
           + escAttr(getField(p,'last') + ', ' + getField(p,'first'))
           + escAttr(getField(p,'state') ? ' · ' + getField(p,'state') : '') + '</option>';
    }).join('');
}
function renderLinkPaste(){
  var box = document.getElementById('lpBody');
  if(!lpRows.length){
    box.innerHTML = '<p class="imp-hint" style="margin:0">Paste one link per line above, then hit Read links.</p>';
    document.getElementById('lpApply').disabled = true;
    return;
  }
  document.getElementById('lpApply').disabled = false;
  box.innerHTML = lpRows.map(function(r, i){
    if(!r.parsed){
      return '<div class="lp-row bad"><div class="lp-u">' + escAttr(r.raw.slice(0,90)) + '</div>'
           + '<div class="imp-hint" style="margin:0">Not a Perfect Game or PBR profile address — skipped.</div></div>';
    }
    var p = r.parsed;
    var existing = r.choice && r.choice !== 'new' ? playerById(r.choice) : null;
    var already = existing ? getField(existing, p.field) : '';
    return '<div class="lp-row">'
      + '<div class="lp-u"><span class="lp-site ' + p.site.toLowerCase() + '">' + p.site + '</span>'
      + escAttr(p.name || ('id ' + p.id)) + (p.state ? ' · ' + escAttr(p.state) : '') + '</div>'
      + '<div class="lp-pick">'
      +   '<select data-lp="' + i + '">'
      +     '<option value="">— skip —</option>'
      +     (p.name ? '<option value="new"' + (r.choice === 'new' ? ' selected' : '') + '>Add as a new player</option>' : '')
      +     playerOptionsHtml(r.choice)
      +   '</select>'
      +   (r.auto ? '<span class="lp-auto">matched by name</span>' : '')
      +   (already ? '<span class="lp-warn">replaces a link already saved</span>' : '')
      + '</div></div>';
  }).join('');
  box.querySelectorAll('[data-lp]').forEach(function(sel){
    sel.addEventListener('change', function(){
      lpRows[+sel.dataset.lp].choice = sel.value;
      lpRows[+sel.dataset.lp].auto = false;
      renderLinkPaste();
    });
  });
}
function readLinks(){
  var text = document.getElementById('lpText').value;
  lpRows = text.split(/[\s,]+/).map(function(s){ return s.trim(); })
    .filter(function(s){ return /^https?:\/\//i.test(s) || /prepbaseballreport|perfectgame/i.test(s); })
    .map(function(raw){
      var parsed = parseProfileUrl(raw);
      var row = { raw:raw, parsed:parsed, choice:'', auto:false };
      if(parsed && parsed.name){
        var hits = matchByName(parsed.name, parsed.state);
        if(hits.length === 1){ row.choice = hits[0].id; row.auto = true; }
        else if(!hits.length) row.choice = 'new';
      }
      return row;
    });
  var known = lpRows.filter(function(r){ return r.parsed; }).length;
  document.getElementById('lpStat').textContent = lpRows.length
    ? known + ' of ' + lpRows.length + ' recognised'
    : 'No links found in that text.';
  renderLinkPaste();
}
async function applyLinks(){
  var attached = 0, created = 0;
  for(var i = 0; i < lpRows.length; i++){
    var r = lpRows[i];
    if(!r.parsed || !r.choice) continue;
    if(r.choice === 'new'){
      var parts = r.parsed.name.split(' ');
      var id = 'custom-' + normName(r.parsed.name) + '-' + Date.now() + '-' + i;
      var rec = { id:id, first:parts[0] || '', last:parts.slice(1).join(' ') || '',
                  posPrimary:'UNK', posDisplay:'', state:r.parsed.state || '',
                  isCustom:true, _defaultTier:'3' };
      rec[r.parsed.field] = r.parsed.url;
      customPlayers.push(rec);
      created++;
    }else{
      await setField(r.choice, r.parsed.field, r.parsed.url);
      attached++;
    }
  }
  var ok = (await saveCustomPlayers()) && (await saveOverrides());
  closeDrawer();
  if(typeof renderHs === 'function') renderHs();
  alertBar((attached ? attached + ' link' + (attached===1?'':'s') + ' attached' : 'Nothing attached')
    + (created ? ', ' + created + ' player' + (created===1?'':'s') + ' added' : '')
    + (ok ? '.' : ' — but the save failed, export before closing.'), ok ? 'ok' : undefined);
}
document.getElementById('linkPasteBtn').addEventListener('click', function(){
  lpRows = [];
  document.getElementById('lpText').value = '';
  document.getElementById('lpStat').textContent = '';
  renderLinkPaste();
  document.getElementById('scrim').classList.add('show');
  document.getElementById('linkPasteModal').classList.add('show');
});
document.getElementById('lpRead').addEventListener('click', readLinks);
document.getElementById('lpApply').addEventListener('click', applyLinks);
document.getElementById('lpClose').addEventListener('click', closeDrawer);
document.getElementById('lpCancel').addEventListener('click', closeDrawer);

/* ==========================================================================
   2. Read a written-on event book
   Print the blank book, write on it at the field, photograph the pages, and
   the handwriting comes back onto the right players' notes. The roster is
   handed to the model as the list of allowed names, which is what keeps the
   matching honest.
   ========================================================================== */
let bkFiles = [], bkEntries = [];

function bkStatus(msg, kind){
  var el = document.getElementById('bkrStatus');
  el.textContent = msg || '';
  el.className = 'shot-status' + (kind ? ' ' + kind : '') + (msg ? ' show' : '');
}
function renderBookEntries(){
  var box = document.getElementById('bkrBody');
  if(!bkEntries.length){ box.innerHTML = ''; document.getElementById('bkrApply').disabled = true; return; }
  document.getElementById('bkrApply').disabled = false;
  box.innerHTML = bkEntries.map(function(e, i){
    return '<div class="bkr-row">'
      + '<label class="bkr-take"><input type="checkbox" data-bkr="' + i + '"' + (e.use ? ' checked' : '') + '></label>'
      + '<div class="bkr-main">'
      +   '<div class="bkr-nm">' + escAttr(e.readName)
      +     (e.player ? '<span class="bkr-ok">→ ' + escAttr(getField(e.player,'first') + ' ' + getField(e.player,'last')) + '</span>'
                      : '<span class="bkr-no">no one on this roster matches</span>') + '</div>'
      +   (e.metricLine ? '<div class="bkr-mx">' + escAttr(e.metricLine) + '</div>' : '')
      +   '<div class="bkr-tx">' + escAttr(e.notes || '(nothing written)') + '</div>'
      + '</div></div>';
  }).join('');
  box.querySelectorAll('[data-bkr]').forEach(function(cb){
    cb.addEventListener('change', function(){ bkEntries[+cb.dataset.bkr].use = cb.checked; });
  });
}
async function readBook(){
  if(!bkFiles.length) return;
  var ev = eventById(ntEventId);
  var roster = ntPlayers().map(function(x){ return getField(x.p,'first') + ' ' + getField(x.p,'last'); });
  var btn = document.getElementById('bkrRead');
  btn.disabled = true;
  bkStatus('Shrinking ' + bkFiles.length + ' page' + (bkFiles.length===1?'':'s') + '…');
  try{
    var imgs = [];
    for(var i = 0; i < bkFiles.length; i++) imgs.push(await shrinkImage(bkFiles[i]));
    bkStatus('Reading the handwriting…');
    var content = imgs.map(function(im){
      return { type:'image', source:{ type:'base64', media_type:im.media, data:im.data } }; });
    content.push({ type:'text', text:
      'These are photographs of a printed scouting book with handwritten notes added at the field.\n' +
      (roster.length ? 'The players on this roster are:\n' + roster.join('\n') + '\n\n' : '') +
      'Return the handwritten notes for each player.' });
    var text = await AI.call({
      max_tokens: 4000,
      system: [
        'You transcribe handwritten scouting notes from photographs of a printed player book.',
        'Each printed entry has a player name; handwriting near or under it belongs to that player.',
        'Respond with ONLY a raw JSON object, no markdown fences and no commentary.',
        'Shape: {"entries":[{"name":"","notes":"","velo":"","pop":"","sixty":"","ev":"","unsure":false}]}',
        'name: match to the roster list given, copying that spelling exactly. If no roster name plausibly matches, return the name as written.',
        'notes: transcribe the handwriting as literally as you can, cleaning up only obvious letter shapes. Do NOT summarise, embellish, or invent scouting language that is not written.',
        'velo / pop / sixty / ev: numbers written for fastball velocity, pop time, 60 time and exit velocity. Use "" when not written. Never estimate one from another.',
        'unsure: true when the handwriting is too unclear to read confidently.',
        'Skip any printed entry that has nothing handwritten on it — only return players who were actually written about.',
      ].join(' '),
      messages: [{ role:'user', content: content }],
    });
    var out = AI.json(text);
    var list = (out && out.entries) || [];
    bkEntries = list.map(function(e){
      var hits = matchByName(e.name, '');
      var onRoster = ntPlayers().map(function(x){ return x.p; });
      var pick = hits.find(function(p){ return onRoster.some(function(q){ return q.id === p.id; }); })
              || hits[0]
              || onRoster.find(function(q){
                   return normName(getField(q,'first') + ' ' + getField(q,'last')).indexOf(normName(e.name)) >= 0; });
      var m = { velo:e.velo || '', pop:e.pop || '', sixty:e.sixty || '', ev:e.ev || '' };
      return { readName: e.name + (e.unsure ? ' (unclear)' : ''), player: pick || null,
               notes: String(e.notes || '').trim(), m: m, metricLine: metricLine(m),
               use: !!pick };
    });
    var matched = bkEntries.filter(function(e){ return e.player; }).length;
    bkStatus(bkEntries.length
      ? matched + ' of ' + bkEntries.length + ' matched to the roster. Untick anything you do not want written.'
      : 'No handwriting found on those pages.', matched ? 'ok' : '');
    renderBookEntries();
  }catch(err){
    console.error(err);
    bkStatus(AI.why(err), 'error');
  }finally{
    btn.disabled = false;
  }
}
async function applyBook(){
  var ev = eventById(ntEventId);
  var n = 0, failed = 0;
  for(var i = 0; i < bkEntries.length; i++){
    var e = bkEntries[i];
    if(!e.use || !e.player) continue;
    var body = [e.notes, e.metricLine].filter(Boolean).join(' ');
    if(!body) continue;
    var entry = noteStamp(ev) + '\n' + body;
    var prior = getNotes(e.player) || '';
    var ok = await setNotes(e.player.id, prior ? entry + '\n\n' + prior : entry);
    var map = { velo:'mFB', pop:'mPop', sixty:'m60', ev:'mEV' };
    for(var k in map){ if(e.m[k]) await setField(e.player.id, map[k], e.m[k]); }
    if(!isAttending(e.player.id, ntEventId)) await addAttendance(e.player.id, ntEventId, '');
    ok ? n++ : failed++;
  }
  closeDrawer();
  renderNotes();
  if(typeof renderHs === 'function') renderHs();
  alertBar(failed ? n + ' written, ' + failed + ' failed to save — export before closing.'
                  : n + ' note' + (n===1?'':'s') + ' written to profiles.', failed ? undefined : 'ok');
}
document.getElementById('ntRead').addEventListener('click', function(){
  bkFiles = []; bkEntries = [];
  document.getElementById('bkrFiles').value = '';
  document.getElementById('bkrThumbs').innerHTML = '';
  document.getElementById('bkrRead').disabled = true;
  renderBookEntries();
  bkStatus(AI.configured || !Cloud.on
    ? 'Photograph each page of the printed book, then add them here.'
    : 'No reader endpoint set yet — add one in Sync → Project connection, or this only works in the Claude preview.',
    '');
  document.getElementById('scrim').classList.add('show');
  document.getElementById('bookReadModal').classList.add('show');
});
document.getElementById('bkrFiles').addEventListener('change', function(e){
  bkFiles = Array.prototype.slice.call(e.target.files || []).slice(0, 8);
  document.getElementById('bkrRead').disabled = !bkFiles.length;
  document.getElementById('bkrThumbs').innerHTML = bkFiles.map(function(f){
    return '<div class="bkr-th">' + escAttr(f.name) + '</div>'; }).join('');
  if(bkFiles.length) bkStatus(bkFiles.length + ' page' + (bkFiles.length===1?'':'s') + ' ready.', '');
});
document.getElementById('bkrRead').addEventListener('click', readBook);
document.getElementById('bkrApply').addEventListener('click', applyBook);
document.getElementById('bkrClose').addEventListener('click', closeDrawer);
document.getElementById('bkrCancel').addEventListener('click', closeDrawer);

/* ---- cloud bootstrap ------------------------------------------------------
   Lives in the last file on purpose. Split across separate <script> tags the
   hub can finish booting before a9.js has even downloaded, so starting the
   cloud from a5 raced and threw "Cloud is not defined".
--------------------------------------------------------------------------- */
(async function bootCloud(){
  if(document.readyState === 'loading'){
    await new Promise(r=> document.addEventListener('DOMContentLoaded', r, { once:true }));
  }
  await APP_READY;
  await Cloud.load();
  await AI.load();
  renderCloudStatus();
  if(Cloud.signedIn){ await Cloud.sync(); Cloud.start(); }
})();
