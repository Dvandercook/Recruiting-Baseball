"""Builds the recruiting board two ways from the same sources.

  recruiting_board_v2.html   one self-contained file — the Claude preview, or
                             anything you want to open straight off a disk.
  dist/                      separate css/js/data files for hosting. No size
                             ceiling, cached by a service worker, installable.

The dist build is NOT an ES-module refactor. The scripts still share one global
scope and still run in the same order, so behaviour is identical to the
concatenated file — the only difference is how the bytes arrive.
"""
import json, re, os, shutil, hashlib, subprocess, tempfile

players = json.load(open('players326.json'))
events  = json.load(open('events.json'))
a1 = open('a1.html').read()
a2 = open('a2.html').read()
PARTS = ['a3', 'a4', 'a6', 'a5', 'a7', 'a8', 'a9', 'a10', 'a11', 'a12', 'a13']   # load order matters
src = {n: open(n + '.js').read() for n in PARTS}

# a4 carries the original document tail; drop it so more JS can follow
src['a4'] = re.sub(r'</script>\s*</body>\s*</html>\s*$', '', src['a4'])
assert '</script>' not in src['a4'] and '</html>' not in src['a4'], 'a4 tail not stripped'


def sval(v):
    """One compact string per value, without changing what the app sees.
    Every numeric read in the app goes through parseFloat/String(), and topLion
    is only ever tested for truthiness, so '' / '1' is faithful."""
    if v is None:
        return ''
    if isinstance(v, bool):
        return '1' if v else ''
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


SEP = '|'


def keyed(rows):
    """Field names once in a header, each record one delimited string.
    Roughly 2 characters saved per field against an array of JSON strings,
    which is ~25KB across this board — the difference between the
    single-file build opening in a preview pane and not."""
    keys = sorted({k for r in rows for k in r})
    lines = []
    for r in rows:
        vals = [sval(r.get(k, '')) for k in keys]
        while vals and vals[-1] == '':      # trailing blanks are implied
            vals.pop()
        assert not any(SEP in v for v in vals), 'a value contains the separator'
        lines.append(SEP.join(vals))
    return (json.dumps(keys, separators=(',', ':'), ensure_ascii=False),
            json.dumps(lines, separators=(',', ':'), ensure_ascii=False))


DECODE = ("function _rows(k,v){return v.map(function(s){var a=s.split('|'),o={};"
          "for(var i=0;i<k.length;i++)o[k[i]]=a[i]===undefined?'':a[i];return o;});}\n")
pk, pv = keyed(players)
ek, ev = keyed(events)
player_js = DECODE + f'const PLAYERS = _rows({pk},{pv});\n'
seed_js   = f'const SEED_EVENTS = _rows({ek},{ev});\n'

# A coach's browser already has these events saved, so a new seed never reaches
# them. This map lets the app fill in links it did not have before, once.
_fill = {}
for _e in events:
    _row = {k: _e[k] for k in ('pgUrl', 'pbrUrl', 'ftUrl') if _e.get(k)}
    if _row:
        _fill[re.sub(r'[^a-z0-9]', '', _e['name'].lower())] = _row
seed_js += ('const LINK_BACKFILL = '
            + json.dumps(_fill, separators=(',', ':'), ensure_ascii=False) + ';\n')


HAVE_CLEANCSS = os.path.exists('node_modules/clean-css')


def _strip_css(css):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    css = re.sub(r'\s*\n\s*', '', css)
    css = re.sub(r'\s*([{};:,>])\s*', r'\1', css)
    return re.sub(r';}', '}', css)


def mini_css(css):
    if not HAVE_CLEANCSS:
        return _strip_css(css)
    with tempfile.NamedTemporaryFile('w', suffix='.css', delete=False) as f:
        f.write(css)
        src = f.name
    out = src + '.min'
    try:
        subprocess.run(['node', 'mincss.mjs', src, out], check=True,
                       capture_output=True, text=True)
        return open(out).read()
    except subprocess.CalledProcessError as e:
        print('  clean-css failed, falling back:', e.stderr.strip()[:160])
        return _strip_css(css)
    finally:
        for p in (src, out):
            if os.path.exists(p):
                os.remove(p)


def mini_html(h):
    """Indentation, blank lines and comments out of the markup. Textareas in
    this document are all empty, so collapsing whitespace is safe."""
    h = re.sub(r'<!--(?!\[if).*?-->', '', h, flags=re.S)
    return '\n'.join(l.strip() for l in h.split('\n') if l.strip())


def _strip_js(s):
    """Fallback when terser isn't installed: whole-line comments and indentation
    only. Never joins lines, so automatic semicolon insertion is unaffected."""
    s = re.sub(r'^[ \t]*/\*.*?\*/[ \t]*$', '', s, flags=re.S | re.M)
    return '\n'.join(l.strip() for l in s.split('\n')
                     if l.strip() and not l.strip().startswith('//'))


HAVE_TERSER = os.path.exists('node_modules/terser')
_mini_cache = {}


def mini_js(s):
    """Terser with top-level names left alone — they are the shared API between
    the files, and in the split build they cross <script> boundaries, so
    mangling or tree-shaking them would break everything."""
    if not HAVE_TERSER:
        return _strip_js(s)
    if s in _mini_cache:
        return _mini_cache[s]
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f:
        f.write(s)
        src = f.name
    out = src + '.min'
    try:
        subprocess.run(['node', 'minify.mjs', src, out], check=True,
                       capture_output=True, text=True)
        res = open(out).read()
    except subprocess.CalledProcessError as e:
        print('  terser failed, falling back:', e.stderr.strip()[:160])
        res = _strip_js(s)
    finally:
        for p in (src, out):
            if os.path.exists(p):
                os.remove(p)
    _mini_cache[s] = res
    return res


# ---------------------------------------------------------------- single file
a1_min = re.sub(r'<style>(.*?)</style>',
                lambda m: '<style>' + mini_css(m.group(1)) + '</style>', a1, flags=re.S)
body = (mini_js(src['a3']) + '\n' + mini_js(src['a4']) + '\n' + seed_js +
        mini_js(src['a6']) + '\n' + mini_js(src['a5']) + '\n' + mini_js(src['a7']) +
        '\n' + mini_js(src['a8']) + '\n' + mini_js(src['a9']) + '\n' + mini_js(src['a10']) + '\n' + mini_js(src['a11']) +
        '\n' + mini_js(src['a12']) + '\n' + mini_js(src['a13']))
one = a1_min + mini_html(a2.replace('__DATA__', 'null').replace(
    'const PLAYERS = null;', player_js)) + body + '\n</script>\n</body>\n</html>\n'
open('recruiting_board_v2.html', 'w').write(one)
print(f'single file : {len(one):>8,} bytes  recruiting_board_v2.html')

# ---------------------------------------------------------------------- dist
os.makedirs('dist', exist_ok=True)
for f in os.listdir('dist'):
    os.remove(os.path.join('dist', f))

style = re.search(r'<style>(.*?)</style>', a1, flags=re.S).group(1)
head  = re.sub(r'<style>.*?</style>', '', a1, flags=re.S)
open('dist/app.css', 'w').write(mini_css(style))

# Data as a plain script, not a fetch: a fetch would fail on file:// and would
# also mean the board is blank until the network answers.
open('dist/data.js', 'w').write(player_js + seed_js)

files = ['data.js'] + [n + '.js' for n in PARTS]
for n in PARTS:
    open(f'dist/{n}.js', 'w').write(mini_js(src[n]))

# Cache-bust on content, so a coach's phone never serves yesterday's build.
def stamp(path):
    h = hashlib.sha1(open('dist/' + path, 'rb').read()).hexdigest()[:8]
    return f'{path}?v={h}'

markup = mini_html(a2.split('<script>')[0])
tags = '\n'.join(f'  <script src="{stamp(f)}"></script>' for f in files)
index = (head.replace('</head>',
            f'  <link rel="stylesheet" href="{stamp("app.css")}">\n'
            '  <link rel="manifest" href="manifest.webmanifest">\n'
            '  <meta name="theme-color" content="#11150f">\n'
            '  <link rel="icon" href="favicon.png" sizes="64x64">\n'
            '  <link rel="apple-touch-icon" href="icon-192.png">\n'
            '</head>')
         + markup + tags + """
  <script>
    if('serviceWorker' in navigator){
      addEventListener('load', function(){
        navigator.serviceWorker.register('sw.js').catch(function(){ /* http:// or blocked — the app still works */ });
      });
    }
  </script>
</body>
</html>
""")
open('dist/index.html', 'w').write(index)

VERSION = hashlib.sha1((index + open('dist/app.css').read()).encode()).hexdigest()[:10]
open('dist/sw.js', 'w').write(
    "/* Cache-first for the shell so the board opens at a field with no signal.\n"
    "   Supabase and the reader endpoint are never cached — those must be live. */\n"
    f"const CACHE = 'rb-{VERSION}';\n"
    f"const SHELL = {json.dumps(['./', 'index.html', stamp('app.css')] + [stamp(f) for f in files])};\n"
    """
self.addEventListener('install', e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=> c.addAll(SHELL)).catch(()=>{}));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(ks=> Promise.all(
    ks.filter(k=> k !== CACHE).map(k=> caches.delete(k)))).then(()=> self.clients.claim()));
});
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if(e.request.method !== 'GET') return;
  if(url.origin !== location.origin) return;          // never touch the API
  e.respondWith(
    caches.match(e.request, {ignoreSearch:false}).then(hit=>
      hit || fetch(e.request).then(res=>{
        const copy = res.clone();
        caches.open(CACHE).then(c=> c.put(e.request, copy)).catch(()=>{});
        return res;
      }).catch(()=> caches.match('index.html'))
    )
  );
});
""")

# Home-screen icons. Coaches run this off a phone, and an untitled grey square
# is how an app stops feeling like an app.
def icon(px):
    """A ball: two seam arcs struck from circles centred outside the ball, so
    the visible span curves the right way and stays inside the edge."""
    from PIL import Image, ImageDraw
    img = Image.new('RGBA', (px * 4, px * 4), (17, 21, 15, 255))   # 4x, then downsample
    d = ImageDraw.Draw(img)
    c, r = px * 2, px * 4 * 0.34
    d.ellipse([c - r, c - r, c + r, c + r], fill=(244, 241, 232, 255))
    R, off = r * 1.0, r * 1.25
    w = max(3, int(px * 4 * 0.03))
    seam = (76, 140, 91, 255)
    d.arc([c + off - R, c - R, c + off + R, c + R], start=133, end=227, fill=seam, width=w)
    d.arc([c - off - R, c - R, c - off + R, c + R], start=-47, end=47,  fill=seam, width=w)
    return img.resize((px, px), Image.LANCZOS)


try:
    for px in (192, 512):
        icon(px).save(f'dist/icon-{px}.png')
    icon(64).save('dist/favicon.png')
    icons = [{"src": f"icon-{px}.png", "sizes": f"{px}x{px}", "type": "image/png",
              "purpose": "any maskable"} for px in (192, 512)]
except Exception as e:                      # Pillow missing — ship without icons
    print('  (no icons:', e, ')')
    icons = []

open('dist/manifest.webmanifest', 'w').write(json.dumps({
    "name": "Recruiting Board", "short_name": "Board",
    "start_url": "./", "display": "standalone",
    "background_color": "#11150f", "theme_color": "#11150f",
    "icons": icons,
}, indent=2))

open('dist/_headers', 'w').write(
    "# Netlify: never cache the entry points, always cache the fingerprinted assets\n"
    "/index.html\n  Cache-Control: no-cache\n"
    "/sw.js\n  Cache-Control: no-cache\n"
    "/*.js\n  Cache-Control: public, max-age=31536000, immutable\n"
    "/*.css\n  Cache-Control: public, max-age=31536000, immutable\n")

total = sum(os.path.getsize('dist/' + f) for f in os.listdir('dist'))
print(f'dist/       : {total:>8,} bytes across {len(os.listdir("dist"))} files'
      f'  (largest single file {max(os.path.getsize("dist/" + f) for f in os.listdir("dist")):,})')
