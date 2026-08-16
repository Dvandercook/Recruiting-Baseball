-- ===========================================================================
--  Recruiting Board — shared staff database
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--  Safe to run more than once.
-- ===========================================================================

-- One table holds everything the app syncs. `kind` says what sort of record it
-- is, `rid` is that record's id, `data` is the record itself.
--   ov = player tier / notes / fields / call log      rid = player id
--   cp = a player added inside the app                rid = player id
--   rm = a player hidden from the board               rid = player id
--   ev = an event                                     rid = event id
--   at = one player attending one event               rid = attendance id
--   tm = a player on your own roster                  rid = roster id
--   st = a shared setting (auto-mark rules, GPA bar)  rid = setting name
create table if not exists public.records (
  kind        text        not null,
  rid         text        not null,
  data        jsonb       not null default '{}'::jsonb,
  deleted     boolean     not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  primary key (kind, rid)
);

-- Devices pull "everything changed since I last looked", so this index is the
-- one that matters.
create index if not exists records_updated_at_idx on public.records (updated_at);

-- The clock that decides who wins a conflict is the SERVER's, never a laptop's.
-- The writer's email is stamped here too, so it can't be faked by the client.
create or replace function public.touch_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(
    nullif(current_setting('request.jwt.claims', true)::json ->> 'email', ''),
    new.updated_by
  );
  return new;
end
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
  before insert or update on public.records
  for each row execute function public.touch_record();

-- ---------------------------------------------------------------------------
-- Row Level Security: signed-in staff only.
-- Without this, anyone who opened the app could read every recruit's phone
-- number. With it, the key inside the HTML file is useless on its own.
-- ---------------------------------------------------------------------------
alter table public.records enable row level security;

drop policy if exists "staff read"   on public.records;
drop policy if exists "staff insert" on public.records;
drop policy if exists "staff update" on public.records;

create policy "staff read"
  on public.records for select
  to authenticated
  using (true);

create policy "staff insert"
  on public.records for insert
  to authenticated
  with check (true);

create policy "staff update"
  on public.records for update
  to authenticated
  using (true)
  with check (true);

-- Deliberately no DELETE policy. Removing a player or an event writes a
-- tombstone (deleted = true) instead of destroying the row, so a mistake on
-- one phone can never wipe the record for the whole staff.
