-- ===========================================================================
-- 0043 — PRODUCTION HARDENING for the Packs surface.
--
-- Five independent defects, one migration because they all land on the same
-- read path and shipping them separately would leave the Pack page in a
-- half-migrated state:
--
--  1. tv_provider_ingest_locks  — ONE lock per provider, replacing the
--     per-Pack lock. Visiting Hallmark, Lifetime and Crime used to start
--     three separate GLOBAL TVmaze ingests (pack_try_start_ingest keys on
--     pack_id, but runTvmazeIngest fetches every channel regardless of
--     Pack), so the work was triplicated and raced with itself.
--
--  2. pack_list_items           — "My Checklist" as an EXPLICIT user list.
--     The old checklist showed every programme on a Pack's stations and
--     inferred "want to watch" from "not marked seen", so a user who had
--     never touched the Pack still saw a 200-item to-do list that was not
--     theirs. Browse and Checklist are now different questions.
--
--  3. pack_franchise_cache      — persisted franchise groups. Rendering a
--     Pack fanned out 7-20 live TMDB searches on a cold request; the answer
--     changes on the order of weeks, so it belongs in the database.
--
--  4. franchise_entries.pack_slug / order_source — franchises were global,
--     so every Pack rendered every other Pack's franchises, and catalog
--     release order was presented indistinguishably from an editorially
--     verified viewing order.
--
--  5. case_* additions          — evidence, confidence and a uuid-keyed
--     review queue for the Crime Case Files matching pipeline. The 0037
--     queue is keyed on bigint TVmaze episode ids and cannot represent a
--     tv_programmes uuid, which is what production actually holds.
--
-- Every statement is idempotent.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. PROVIDER-LEVEL INGEST LOCK
--
-- Leased, not advisory: a serverless function can vanish mid-run, and an
-- xact-scoped advisory lock would be released on disconnect while the
-- upstream fetch it was guarding is still in flight somewhere. A lease that
-- expires on its own is the honest model for work that can die silently.
-- ---------------------------------------------------------------------------
create table if not exists public.tv_provider_ingest_locks (
  provider_id    text primary key,
  -- The lease. now() >= locked_until means "free".
  locked_until   timestamptz not null default now(),
  last_start_at  timestamptz,
  last_finish_at timestamptz,
  last_ok        boolean
);

comment on table public.tv_provider_ingest_locks is
  'One row per ingest provider (tvmaze, tv_media). Leased lock so exactly one ingest per provider runs at a time, regardless of how many Pack pages or cron ticks ask. Replaces the per-Pack lock in 0038.';

-- Atomic acquire. Returns true only for the caller that won.
-- p_min_interval_seconds additionally refuses to start when the last run
-- finished too recently, so an hourly cron and a page visit cannot combine
-- into a tighter loop than the provider allows.
create or replace function public.tv_try_acquire_ingest_lock(
  p_provider_id           text,
  p_lease_seconds         int default 300,
  p_min_interval_seconds  int default 0
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  -- GET DIAGNOSTICS ... = ROW_COUNT yields an INTEGER. Declaring this boolean
  -- created a function that installs cleanly and then fails the first time it
  -- is called with "operator does not exist: boolean > integer" — a latent
  -- break that only a fresh environment running the lock would ever hit.
  v_rows integer := 0;
begin
  insert into public.tv_provider_ingest_locks (provider_id, locked_until)
  values (p_provider_id, now() - interval '1 second')
  on conflict (provider_id) do nothing;

  -- Single statement, so two concurrent callers cannot both see a free lease.
  update public.tv_provider_ingest_locks
     set locked_until  = now() + make_interval(secs => greatest(p_lease_seconds, 1)),
         last_start_at = now()
   where provider_id = p_provider_id
     and locked_until <= now()
     and (
       p_min_interval_seconds <= 0
       or last_finish_at is null
       or last_finish_at <= now() - make_interval(secs => p_min_interval_seconds)
     );

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.tv_release_ingest_lock(
  p_provider_id text,
  p_ok          boolean default true
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tv_provider_ingest_locks
     set locked_until   = now(),
         last_finish_at = now(),
         last_ok        = p_ok
   where provider_id = p_provider_id;
$$;

alter table public.tv_provider_ingest_locks enable row level security;
-- Operator-visible (the health endpoint reads it through the service role);
-- no anon policy, so the browser can never see or take the lock.
drop policy if exists tv_provider_ingest_locks_no_public on public.tv_provider_ingest_locks;

revoke all on function public.tv_try_acquire_ingest_lock(text, int, int) from public, anon, authenticated;
revoke all on function public.tv_release_ingest_lock(text, boolean) from public, anon, authenticated;
grant execute on function public.tv_try_acquire_ingest_lock(text, int, int) to service_role;
grant execute on function public.tv_release_ingest_lock(text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 2. MY CHECKLIST — an explicit list, never an inference
-- ---------------------------------------------------------------------------
create table if not exists public.pack_list_items (
  user_id      uuid not null references auth.users(id) on delete cascade,
  pack_id      uuid not null references public.packs(id) on delete cascade,
  programme_id uuid not null references public.tv_programmes(id) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (user_id, pack_id, programme_id)
);

create index if not exists pack_list_items_user_pack_idx
  on public.pack_list_items (user_id, pack_id, added_at desc);

comment on table public.pack_list_items is
  'Titles a user EXPLICITLY added to a Pack checklist. "Not in this table" means "not on my list" — it never means "want to watch". Watched lives in user_seen.';

alter table public.pack_list_items enable row level security;

drop policy if exists pack_list_items_select_own on public.pack_list_items;
create policy pack_list_items_select_own on public.pack_list_items
  for select using (auth.uid() = user_id);

drop policy if exists pack_list_items_insert_own on public.pack_list_items;
create policy pack_list_items_insert_own on public.pack_list_items
  for insert with check (auth.uid() = user_id);

drop policy if exists pack_list_items_delete_own on public.pack_list_items;
create policy pack_list_items_delete_own on public.pack_list_items
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. PERSISTED FRANCHISE GROUPS (no live TMDB fan-out on a page render)
-- ---------------------------------------------------------------------------
create table if not exists public.pack_franchise_cache (
  pack_slug    text not null,
  franchise    text not null,
  -- The resolved, ordered member list. Shape is owned by
  -- src/lib/packs/catalogFranchises.ts (CatalogFranchise).
  payload      jsonb not null,
  entry_count  integer not null default 0,
  source       text not null default 'tmdb_catalog'
                 check (source in ('tmdb_catalog', 'editorial')),
  refreshed_at timestamptz not null default now(),
  primary key (pack_slug, franchise)
);

create index if not exists pack_franchise_cache_slug_idx
  on public.pack_franchise_cache (pack_slug, refreshed_at desc);

comment on table public.pack_franchise_cache is
  'Franchise membership+order resolved from the catalog and STORED. A Pack render reads only this table; refreshing it is a background job, never part of a customer GET.';

alter table public.pack_franchise_cache enable row level security;

drop policy if exists pack_franchise_cache_public_read on public.pack_franchise_cache;
create policy pack_franchise_cache_public_read on public.pack_franchise_cache
  for select using (true);

-- ---------------------------------------------------------------------------
-- 4. FRANCHISES BELONG TO A PACK, AND ORDER HAS A PROVENANCE
-- ---------------------------------------------------------------------------
alter table public.franchise_entries add column if not exists pack_slug text;

-- 'release' = catalog release order (derivable, never an editorial claim).
-- 'editorial' = a verified viewing order somebody actually checked.
alter table public.franchise_entries add column if not exists order_source text
  not null default 'release';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'franchise_entries_order_source_check'
  ) then
    alter table public.franchise_entries
      add constraint franchise_entries_order_source_check
      check (order_source in ('release', 'editorial'));
  end if;
end $$;

create index if not exists franchise_entries_pack_idx
  on public.franchise_entries (pack_slug, franchise, sequence_number);

comment on column public.franchise_entries.pack_slug is
  'Which Pack surfaces this franchise. Null = not surfaced anywhere (legacy rows); the read path filters on this, so a Lifetime franchise can never appear under Hallmark.';
comment on column public.franchise_entries.order_source is
  'release = catalog release order. editorial = a verified viewing order. The UI must label these differently; they are not the same claim.';

-- ---------------------------------------------------------------------------
-- 5. CRIME CASE MATCHING — evidence, confidence, and a uuid review queue
-- ---------------------------------------------------------------------------

-- Extracted identity per programme. One row per tv_programmes row; the
-- fingerprint is what the matcher compares, so it is stored rather than
-- recomputed on every pass and is inspectable when a match looks wrong.
create table if not exists public.case_evidence (
  programme_id  uuid primary key references public.tv_programmes(id) on delete cascade,
  -- Normalized person names (victims, perpetrators, investigators kept apart).
  entities      jsonb not null default '[]'::jsonb,
  victims       jsonb not null default '[]'::jsonb,
  perpetrators  jsonb not null default '[]'::jsonb,
  locations     jsonb not null default '[]'::jsonb,
  event_years   jsonb not null default '[]'::jsonb,
  -- Free-text signature used for cheap blocking before pairwise scoring.
  signature     text,
  extracted_at  timestamptz not null default now()
);

create index if not exists case_evidence_signature_idx on public.case_evidence (signature);

comment on table public.case_evidence is
  'Per-programme case fingerprint extracted from title/episode title/description. Stored so a match can be explained and re-audited without re-deriving it.';

-- How a programme came to be attached to a Case, and how sure we are.
alter table public.case_programmes add column if not exists confidence numeric;
alter table public.case_programmes add column if not exists linked_by text
  not null default 'automatic';
alter table public.case_programmes add column if not exists evidence jsonb
  not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'case_programmes_linked_by_check'
  ) then
    alter table public.case_programmes
      add constraint case_programmes_linked_by_check
      check (linked_by in ('automatic', 'reviewed', 'curated'));
  end if;
end $$;

comment on column public.case_programmes.confidence is
  'Matcher confidence 0..1 for an automatic link. Null for curated links, which assert certainty by hand.';
comment on column public.case_programmes.evidence is
  'The specific reasons this programme was attached — the shared victim name, location, year. Never empty for an automatic link.';

-- The uuid-keyed review queue. 0037''s case_match_candidates is keyed on
-- bigint TVmaze episode ids and structurally cannot hold a tv_programmes
-- uuid, which is what every production row actually is.
create table if not exists public.case_link_candidates (
  id              uuid primary key default gen_random_uuid(),
  -- Canonically ordered so a pair has exactly one row.
  programme_a_id  uuid not null references public.tv_programmes(id) on delete cascade,
  programme_b_id  uuid not null references public.tv_programmes(id) on delete cascade,
  confidence      numeric not null check (confidence >= 0 and confidence <= 1),
  reasons         jsonb not null default '[]'::jsonb,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  case_id         uuid references public.cases(id) on delete set null,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  constraint case_link_candidates_pair_order check (programme_a_id < programme_b_id),
  unique (programme_a_id, programme_b_id)
);

create index if not exists case_link_candidates_status_idx
  on public.case_link_candidates (status, confidence desc);

comment on table public.case_link_candidates is
  'Pairs the matcher believes cover the same case but is not confident enough to link automatically. Nothing is silently dropped: a pair is either linked, queued here, or explicitly rejected.';

alter table public.case_evidence enable row level security;
alter table public.case_link_candidates enable row level security;

-- Evidence is public (it explains a public link). The queue is operator-only.
drop policy if exists case_evidence_public_read on public.case_evidence;
create policy case_evidence_public_read on public.case_evidence
  for select using (true);
