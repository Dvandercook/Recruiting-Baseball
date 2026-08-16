# Recruiting Board

A college baseball recruiting board — 326 players, 166 fall events, staff sync, event
schedules, depth chart and the rest. One codebase, built two ways.

**This repo is the source of truth.** The app that coaches use is built from here.

---

## Get it on a URL

1. Push this repo to GitHub (private is fine).
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repo.
3. Netlify reads `netlify.toml` and already knows what to do — build with
   `npm install && python3 build.py`, publish `dist/`. Accept the defaults and deploy.
4. You get a URL like `your-site.netlify.app`. Point a custom domain at it if you want.

From then on **every push to `main` rebuilds and redeploys automatically**, usually in
under a minute. No zips, no dragging folders.

If you'd rather not use GitHub yet: run `python3 build.py` locally and drag the `dist`
folder onto [app.netlify.com/drop](https://app.netlify.com/drop). Same result, but you
repeat it by hand every time.

---

## Build it yourself

```bash
npm install        # terser + clean-css (optional — the build falls back without them)
python3 build.py
```

Produces two things from the same source:

| Output | What it's for |
|---|---|
| `dist/` | The hosted site. Split files, service-worker offline, installable on a phone. **This is the real product.** |
| `recruiting_board_v2.html` | One self-contained file. Opens off a disk or in a Claude preview. Now ~405KB, which is past the size a preview pane will open, so treat it as a convenience copy. |

Serve the hosted build locally with `npm run serve` → http://127.0.0.1:8810

---

## How the source is laid out

Load order matters — the files share one global scope, in both builds.

| File | What's in it |
|---|---|
| `a1.html` | Every style. One `<style>` block. |
| `a2.html` | Every bit of markup — all views and modals. |
| `a3.js` | Data layer: storage, tiers, players, CSV, call log, measurables, pools, coaches |
| `a4.js` | Player drawer, screenshot reader, CSV import/export, external links |
| `a6.js` | Big Board and Grid, filters, grouping |
| `a5.js` | Hub routing, events list, NCAA calendar data, team roster, event link resolution |
| `a7.js` | Event Notes — working a roster at a field |
| `a8.js` | Auto marks, duplicate merge, printable event books |
| `a9.js` | Cloud sync (Supabase) |
| `a10.js` | Model access, profile-link paste, written-book reader |
| `a11.js` | Travel organizations |
| `a12.js` | Coaches, tasks, calendar scheduler |
| `a13.js` | Event detail — schedule, rosters, players |
| `build.py` | Assembles both builds, minifies, fingerprints, writes the service worker and icons |
| `players326.json`, `events.json` | The seed data |

### Things that will bite you if you don't know them

- **Top-level names are the shared API between files.** `build.py` runs terser with
  `mangle:{toplevel:false}` and `compress:{toplevel:false}` for exactly this reason.
  Turn either on and the split build breaks.
- **Anything that runs at boot must wait for `DOMContentLoaded`** before touching another
  file's symbols. In the single file every symbol exists immediately; split across
  `<script>` tags it does not. This bit twice.
- **`Cloud` and `AI` are `var`, not `const`** — `a3.js` probes `typeof Cloud`, which throws
  on a `const` in its temporal dead zone.
- **Seed data changes don't reach existing users on their own.** A coach's browser prefers
  its saved copy. `addNewSeedEvents()` and `backfillEventLinks()` in `a5.js` bridge that,
  each behind a version flag — **bump the flag when you add data or they won't run.**
- **`window.print()` is ignored in sandboxed previews**, so anything printable also renders
  on screen.

---

## Tests

Playwright, headless Chromium. Run against the single-file build.

```bash
node tests/modcheck.mjs     # tasks, calendar, event detail, transfer pool  (45 assertions)
node tests/batchcheck.mjs   # measurables, auto marks, merge, event books
node tests/intakecheck.mjs  # profile links, written-book reader           (33 assertions)
node tests/synccheck.mjs    # two coaches syncing through a mock Supabase  (30 assertions)
node tests/orgcheck.mjs     # travel orgs + data-encoding integrity
node tests/pgcheck2.mjs     # PG/PBR/Five Tool link backfill
node tests/pscheck.mjs      # Prospect Select events + fourth link source
node tests/sbcheck2.mjs     # behaviour inside a sandboxed iframe
```

`tests/distcheck.mjs` tests the hosted build — serve `dist/` on port 8810 first.
`tests/mock_supabase.mjs` is a stand-in server implementing the same contract as
`supabase_setup.sql`, so sync is testable without touching a live project.

**Run the suites after any change.** They have caught real bugs repeatedly — game times
sorting as strings, a venue swallowed into a team name, sync silently dropping another
coach's call-log entry.

---

## The other pieces

| File | Where it goes |
|---|---|
| `supabase_setup.sql` | Supabase → SQL Editor. Creates the shared table and its security rules. |
| `ai_proxy.ts` | Supabase Edge Function named `read`. Holds the Anthropic API key so the page never has to. |
| `sheet_mirror.gs` | Apps Script inside your Google Sheet. Mirrors the board into four tabs every 15 minutes. |
| `Staff Sync Setup.md` | The click-by-click setup for all of the above. |

---

## Asking for changes later

Start a Cowork session, attach this repo (or point at the GitHub URL), and describe what
you want. The build notes in the **Recruiting App** project carry the architecture,
decisions and known traps across sessions — worth pointing any new session at them.

Then: change the source, run the tests, `git push`. Netlify does the rest.
