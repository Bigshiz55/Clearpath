-- WatchVerdict — Watchmode streaming-availability cache.
--
-- Everything here is written ONLY by the cron sync job (service role); a
-- browser or a signed-in user's request never reaches Watchmode directly —
-- that is the whole point of caching it. `watchmode_availability` and
-- `watchmode_fetch_state` are world-readable so a card can show what we hold
-- without a round trip through the service role; `watchmode_title_map` and
-- `watchmode_call_ledger` are operational and stay service-role-only, same
-- split as `tv_call_ledger` in 0032_tv_ingestion.sql.

-- ---------------------------------------------------------------------------
-- The ID map — imported whole from Watchmode's title_id_map.csv (ONE request,
-- see src/lib/watchmode/sync.ts), so resolving a TMDB id to a Watchmode id at
-- fetch time is a local lookup, never a per-title search call.
-- ---------------------------------------------------------------------------
create table if not exists public.watchmode_title_map (
  watchmode_id      bigint primary key,
  imdb_id           text,
  tmdb_id           bigint,
  tmdb_media_type   text check (tmdb_media_type in ('movie', 'tv')),
  imported_at       timestamptz not null default now()
);
create index if not exists watchmode_title_map_tmdb
  on public.watchmode_title_map (tmdb_id, tmdb_media_type)
  where tmdb_id is not null;

-- ---------------------------------------------------------------------------
-- What we've actually checked, and when — separate from the availability
-- rows themselves, so "never checked" (show "checking availability"),
-- "checked, nothing found" (say so honestly), and "checked, N sources"
-- (show them) are three distinct, readable states. Also the 14-day cache
-- clock and the priority job's dedupe key.
-- ---------------------------------------------------------------------------
create table if not exists public.watchmode_fetch_state (
  tmdb_id           bigint not null,
  tmdb_media_type   text not null check (tmdb_media_type in ('movie', 'tv')),
  watchmode_id      bigint,
  last_fetched_at   timestamptz not null default now(),
  last_status       text not null default 'ok' check (last_status in ('ok', 'no_match')),
  source_count      integer not null default 0,
  primary key (tmdb_id, tmdb_media_type)
);

-- ---------------------------------------------------------------------------
-- The availability itself — zero-to-many rows per title. Replaced wholesale
-- for a title on every refetch (see sync.ts), never merged row-by-row, so a
-- service that drops a title simply isn't in the next snapshot.
-- ---------------------------------------------------------------------------
create table if not exists public.watchmode_availability (
  id                uuid primary key default gen_random_uuid(),
  tmdb_id           bigint not null,
  tmdb_media_type   text not null check (tmdb_media_type in ('movie', 'tv')),
  source_name       text not null,
  source_type       text not null check (source_type in ('subscription', 'rent', 'buy', 'free')),
  region            text not null default 'US',
  deeplink          text,
  updated_at        timestamptz not null default now(),
  unique (tmdb_id, tmdb_media_type, source_name, source_type, region)
);
create index if not exists watchmode_availability_title
  on public.watchmode_availability (tmdb_id, tmdb_media_type);

-- ---------------------------------------------------------------------------
-- The budget ledger — one row per real HTTP call to Watchmode (the CSV
-- import counts too). This IS the monthly count the 2,000 hard cap is
-- computed from; see src/lib/viewing/ingest/budget.ts (reused as-is) and the
-- `monthlyCallsUsed`-style query in src/lib/watchmode/sync.ts.
-- ---------------------------------------------------------------------------
create table if not exists public.watchmode_call_ledger (
  id                       uuid primary key default gen_random_uuid(),
  endpoint                 text not null,
  requested_at             timestamptz not null default now(),
  response_status          integer,
  counts_against_allowance boolean not null default true
);
create index if not exists watchmode_call_ledger_month
  on public.watchmode_call_ledger (requested_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.watchmode_title_map    enable row level security;
alter table public.watchmode_fetch_state  enable row level security;
alter table public.watchmode_availability enable row level security;
alter table public.watchmode_call_ledger  enable row level security;

do $$
declare t text;
begin
  -- Public read for what a card needs to show. Writes stay service-role-only
  -- (no INSERT/UPDATE/DELETE policy is created for anon/authenticated).
  foreach t in array array['watchmode_fetch_state', 'watchmode_availability'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_read', t);
  end loop;
  -- watchmode_title_map and watchmode_call_ledger stay private: the id map is
  -- an internal resolution table and the ledger exposes provider usage, same
  -- reasoning as tv_ingestion_runs/tv_call_ledger in 0032. No SELECT policy,
  -- so only the service role can read them.
end $$;

comment on table public.watchmode_availability is
  'Cached Watchmode source snapshot per title. Replaced wholesale on refetch, never merged row-by-row.';
comment on table public.watchmode_fetch_state is
  'Whether/when a title was last checked — distinguishes "never checked" from "checked, nothing found" for the card UI.';
comment on table public.watchmode_call_ledger is
  'One row per real Watchmode HTTP call (including the CSV import), which the monthly 2,000-call budget guard counts against.';
