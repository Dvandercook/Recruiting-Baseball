# Staff Sharing & Cloud Sync — setup

One-time setup, about 20 minutes. After this, every coach opens the same link on
any device, signs in, and sees the same board.

You do steps 1–5 once. Each coach does step 6 once.

---

## What you're building

```
   Coach's phone  ─┐
   Your laptop    ─┼──►  one HTML file at a shared URL
   iPad at a field ┘              │
                                  ▼
                          Supabase (free)
                     the shared staff database
```

The board keeps working with no signal. Everything saves to the device first and
goes up the moment you're back on wifi.

---

## 1. Create the Supabase project

1. Go to **supabase.com** and sign up (free tier is plenty — this board is well
   under 1 MB of actual data).
2. **New project**. Name it something like `recruiting-board`.
3. Pick a database password when asked and put it in your password manager. You
   won't need it for the app, only for direct database access later.
4. Choose the region closest to campus. Wait ~2 minutes for it to finish
   provisioning.

## 2. Create the table

Already done on the live project. This is how to do it again on a new one.

1. Left sidebar → **SQL Editor** → **New query**.
2. Open `supabase/migrations/20260817000000_records.sql` from the repo, copy the
   whole thing, paste it in, and hit **Run**.
3. You should see "Success. No rows returned." That's correct — it built the
   table, the security policies and the write trigger.

This is safe to run again later if you ever need to.

Or skip it: with the GitHub integration connected (§10), pushing to `main` applies
everything in `supabase/migrations/` for you.

## 3. Turn off public signups

Without this, anyone who found your link could create themselves an account.

1. **Authentication** → **Sign In / Providers** → **Email**.
2. Turn **off** "Allow new users to sign up".
3. Save.

(Supabase moves this label around occasionally — you're looking for the email
provider's signup toggle.)

## 4. Add your coaches

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Enter their email and a password you choose. Tick "Auto confirm user" so they
   don't have to click an email link.
3. Repeat for each coach, including yourself.
   - Add one extra user called something like `mirror@yourschool.edu`. That's not
     a person — it's the account the Google Sheet mirror signs in as. Give it a
     long random password and keep it in your password manager.
4. Send each coach their password however you'd normally share one. They can't
   change it themselves — if someone needs a reset, you do it from this same
   screen.

For 2–4 coaches this is less hassle than setting up invite emails. Say the word
if you'd rather have proper self-service password resets and I'll wire that up.

## 5. Get your two connection values

1. **Settings** (gear) → **API Keys**.
2. Copy the **Project URL** — looks like `https://abcdefgh.supabase.co`.
3. Copy the **publishable key** — starts with `sb_publishable_...`.
   - If your project only shows a legacy **anon** key (starts with `eyJ...`),
     that works too. Supabase is retiring those at the end of 2026, so use the
     publishable key if you have the choice.
   - **Do not** use anything labeled *secret* or *service_role*. Those bypass all
     the security you just set up.

The publishable key is designed to be public. On its own it can't read a single
row — the database only answers signed-in staff, which is what the policies in
step 2 enforce.

## 6. Put the app somewhere everyone can reach it

Emailing the file around defeats the purpose — coaches end up on different
versions. Pick one:

Use **`recruiting-board-site.zip`** for this, not the single HTML file. Unzip it
and you'll get a folder with `index.html` and the rest of the app split into
separate files. That version has no size ceiling, caches itself for offline use,
and installs to a phone home screen properly.

- **Netlify Drop** (`app.netlify.com/drop`) — drag the whole unzipped **folder**
  onto the page, get a URL back in about ten seconds. Easiest.
- **Cloudflare Pages** or **GitHub Pages** — same idea, needs a free account.

The single `Recruiting Board.html` file still works and still opens straight off
a disk or in the Claude preview — keep it for that. Both are built from the same
source, so they behave identically.

Once it's up, each coach:

1. Opens the link.
2. Taps the **Sync off** pill in the bottom-right corner.
3. Opens **Project connection**, pastes the Project URL and the publishable key,
   hits **Save connection**.
4. Enters their email and password, hits **Sign in**.
5. **On every device except the first one**, opens **Project connection** and
   hits **Replace this device from the staff board**. This pulls the staff's work
   down instead of pushing that device's fresh copy up over it.

On iPhone, Share → **Add to Home Screen** gives them an app icon that opens
full-screen.

## 7. Mirror the board into your Google Sheet

Optional, but this is the part that keeps the sheet you already work in current.
A script inside the spreadsheet pulls from the database every 15 minutes and
rewrites four tabs. One way only — the app is the source of truth.

1. Open the Google Sheet you want the mirror in. It can be your existing
   recruiting sheet, or a fresh one.
2. **Extensions** → **Apps Script**. Delete the placeholder `myFunction` code.
3. Paste in all of `sheet_mirror.gs` and save.
4. Scroll to `setUp()` at the bottom and fill in the four values: your project
   URL, the publishable key, and the email and password of the `mirror@` user
   from step 4.
5. Run **setUp** once from the toolbar. Google will ask you to approve
   permissions — it's your own script, so approve it.
6. **Delete those four values out of `setUp()` and save.** They're stored in the
   project's properties now, and leaving a password sitting in the code is how
   passwords leak.
7. Run **mirrorNow** once. Switch back to the spreadsheet and you should see four
   new tabs.
8. Run **installTrigger** once to have it refresh every 15 minutes on its own.

You get:

- **Board (auto)** — every player, sorted by tier: contact info, measurables,
  what they're committed to, when they were last contacted, what events they're
  going to.
- **Call Log (auto)** — one row per call, newest first, with which coach logged it.
  This is the tab you'll want for staff meetings.
- **Events (auto)** — the schedule with starred events and a head count going.
- **Attendance (auto)** — who's at what, and the travel team they're playing for.

Two things to know. These four tabs are **rewritten from scratch every run**, so
don't type into them — build your own tabs alongside and reference the auto ones
with formulas. And the mirror runs on Google's timer, so the sheet trails the app
by up to 15 minutes; there's a **Recruiting Board → Refresh now** menu item in the
spreadsheet if you want it immediately.

## 8. The reader service (needed for screenshots and written books)

**Read this even if you skip it** — it explains a thing that will otherwise break
on you.

The screenshot reader has been calling Anthropic directly from the page. That
only works inside the Claude preview, which quietly proxies the call. The moment
the file is hosted at your own URL (step 6), screenshot import stops working —
there's no API key in the file, and there shouldn't be, because anyone could read
it out of a public page.

The fix is a tiny function on your Supabase project that holds the key. The board
calls that instead. Supabase checks the coach is signed in before it runs, so
nobody outside your staff can spend your credits.

1. Get an Anthropic API key at **console.anthropic.com** — it's pay-as-you-go and
   separate from any Claude subscription. Reading a page of handwriting costs
   around a cent; a season of use is a few dollars.
2. The function is already deployed as `read` — its source lives at
   `supabase/functions/read/index.ts`. To redeploy by hand: **Edge Functions** →
   **Deploy a new function** → **Via Editor**, name it `read`, paste that file in.
   Leave **Verify JWT** on; the function has no auth logic of its own.
3. **Edge Functions** → **Secrets** → add `ANTHROPIC_API_KEY` with your key. Until
   this exists the reader answers 500 with `ANTHROPIC_API_KEY is not set on this
   function`.
4. Copy the function's URL — `https://YOUR-PROJECT.supabase.co/functions/v1/read`.
5. In the app: the **Sync** pill → **Project connection** → paste it into
   **Reader endpoint** → **Save connection**.

Skip this and everything else still works — the board, sync, the Sheet mirror,
event books, links. Only the two image-reading features go dark, and they'll tell
you why rather than failing quietly.

## 9. Two ways to get players in faster

**Paste profile links** — on the board bar. Paste Perfect Game or PBR profile
addresses, one per line, as many as you like.

A PBR address carries the player's name and state (`/profiles/FL/Kline-Cummings-9805147632`),
so those match themselves against the board — if the name is new, it offers to add
them. A Perfect Game address is only a numeric id, so those ask you which player it
belongs to. Nothing is ever guessed from an id.

This is the practical way to chip away at the 304 recruits still missing a PBR
link: when you're on a kid's profile anyway, copy the URL and paste it in later in
a batch.

**Read a written book** — in Event Notes, next to the print buttons. The loop:

1. **Blank book** → print it before you leave.
2. Write on it at the field, the way you already would.
3. Photograph the pages on your phone.
4. **Read written book** → add the photos → **Read pages**.

The roster for that event gets sent along as the list of allowed names, which is
what keeps it from putting notes on the wrong kid. You get a row per player with
the transcription and any velo, pop, 60 or EV it picked up — tick what's right,
untick what isn't, and it writes to the profiles. Anything it can't match to the
roster is flagged rather than guessed, and handwriting it couldn't read
confidently is marked unclear.

It transcribes; it doesn't editorialise. If you wrote three words, you get three
words.

---

## 10. Keeping the backend in the repo

The database schema and the reader function both live in the repo now, under
`supabase/`. Supabase watches the repo and applies changes on push, the same reflex
as the Netlify deploy.

**Supabase → Settings → Integrations → GitHub:**

- **Repository** — `Dvandercook/Recruiting-Baseball`
- **Working directory** — `.` (a single dot; the `supabase/` folder is at the repo root)
- **Deploy to production** — on
- **Production branch** — `main`

Preview branches need a paid plan; production deploys don't, so leave branching off.

Two rules, and they matter:

1. **Never edit a migration that has already been applied.** Add a new file with a
   later timestamp instead. Supabase decides what to run by filename against
   `supabase_migrations.schema_migrations` — editing history in place means the
   change silently never runs.
2. **Keep every migration idempotent** — `create ... if not exists`,
   `create or replace`, `drop ... if exists`. That table has no record of anything you
   ran by hand in the SQL Editor, so a hand-run migration *will* run again on the next
   push. The first one is written this way on purpose.

Secrets, coach logins and API keys stay out of the repo. Those are dashboard-only.

## How it behaves once it's running

**It syncs** every 45 seconds while the tab is open, a couple of seconds after
any edit, whenever you switch back to the tab, and the moment you reconnect.

**The pill in the corner tells you the truth.** "Synced 3 min ago", "Offline",
"Sync error" — it never claims to have saved something it didn't. If it says
offline, your work is on the device and will go up later.

**Call log entries are stamped** with whoever wrote them, so you can see which
coach talked to which kid.

**Two coaches logging calls on the same player at the same time both keep their
entry.** Call log entries merge rather than overwrite. Same for deletions — a
deleted entry stays deleted instead of coming back on the next sync.

**Removing a player or event doesn't destroy anything.** It writes a "removed"
marker, so a mistap on somebody's phone can't wipe a record for the whole staff.
The row is still in the database if you ever need it back.

**One honest limitation:** if two coaches type into the *same free-text box* on
the *same player* within the same minute — the Scouting Notes field, say — the
last save wins and the other one's sentence is gone. Tiers, measurables, contact
fields and everything else are per-record so this is rare, and the call log is
immune by design. If it turns into a real problem, the fix is field-level merging
and I can build it.

**View settings stay per device.** Your filters, your Big Board grouping and your
sort order are yours — those don't sync, on purpose.

---

## Cost

Free tier covers this comfortably: the whole board is well under a megabyte, and
four coaches syncing all day is a rounding error against the limits. Two things
to know:

- Free projects **pause after a week with no activity**. In season you'll never
  hit that; over a dead stretch in the winter it might pause, and you unpause it
  from the dashboard with one click. Nothing is lost.
- If you'd rather it never pause, the Pro tier is $25/month. You almost certainly
  don't need it for a staff of four.

## If something goes wrong

**"Invalid login credentials"** — email typo, or the user wasn't created in step 4.

**Pill says "Sync error"** — hover it for the message. A 401 usually means the key
was pasted wrong or you used the wrong one; a 404 usually means step 2's SQL
didn't run.

**A coach sees an old board** — they were signed out and edited locally. Have them
sign in and hit **Sync now**; their work merges up.

**You want a clean slate on one device** — **Replace this device from the staff
board** pulls the shared version down over whatever's local.
