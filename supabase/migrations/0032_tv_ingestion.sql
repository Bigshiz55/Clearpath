-- 0032 — Centralised TV listings ingestion.
--
-- One daily server-side run per lineup writes here; every user reads from
-- these tables. The browser never touches the provider.
--
-- Design notes that matter:
--   * Station identity is SEPARATE from lineup membership. The same station
--     appears on many lineups at different channel numbers, and merging the two
--     would either duplicate stations or lose channel ordering.
--   * Airings store absolute UTC instants only. No stored "on now" flag — that
--     is derived on read, so one nightly run stays correct all day.
--   * `end_at_utc` is nullable and paired with `is_complete`. A provider row
--     with neither an end time nor a duration is stored honestly as incomplete
--     rather than given an invented runtime.
--   * Every table is idempotent (IF NOT EXISTS) so re-running is safe.

-- ---------------------------------------------------------------------------
-- providers
-- ---------------------------------------------------------------------------
create table if not exists public.tv_providers (
  id                   text primary key,             -- 'tv_media'
  name                 text not null,
  adapter_type         text not null,
  enabled              boolean not null default false,
  status               text not null default 'unconfigured',
  last_success_at      timestamptz,
  monthly_call_count   integer not null default 0,
  monthly_call_limit   integer not null default 0,
  call_count_month     text,                          -- 'YYYY-MM', for reset
  retention_days       integer not null default 30,   -- licence retention
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- markets and lineups
-- ---------------------------------------------------------------------------
create table if not exists public.tv_markets (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  postal_code  text,
  country      text not null default 'US',
  timezone     text not null,                          -- IANA, e.g. America/New_York
  created_at   timestamptz not null default now(),
  unique (name, country)
);

create table if not exists public.tv_lineups (
  id                      uuid primary key default gen_random_uuid(),
  provider_id             text not null references public.tv_providers(id) on delete cascade,
  provider_lineup_id      text not null,
  market_id               uuid references public.tv_markets(id) on delete set null,
  name                    text not null,
  lineup_type             text not null default 'cable',  -- antenna|cable|satellite|iptv|generic
  timezone                text not null,
  enabled                 boolean not null default false,
  -- Set when the lineup is defined but the plan does not yet grant access.
  awaiting_plan_access    boolean not null default false,
  last_success_at         timestamptz,
  next_refresh_at         timestamptz,
  coverage_start_utc      timestamptz,
  coverage_end_utc        timestamptz,
  status                  text not null default 'idle',
  last_error              text,
  lifetime_call_count     integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (provider_id, provider_lineup_id)
);

-- ---------------------------------------------------------------------------
-- stations, and their per-lineup channel mapping
-- ---------------------------------------------------------------------------
create table if not exists public.tv_stations (
  id                   uuid primary key default gen_random_uuid(),
  provider_id          text not null references public.tv_providers(id) on delete cascade,
  provider_station_id  text not null,
  call_sign            text,
  name                 text not null,
  network              text,
  logo_url             text,                            -- only where licensed
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (provider_id, provider_station_id)
);

create table if not exists public.tv_lineup_channels (
  id                   uuid primary key default gen_random_uuid(),
  lineup_id            uuid not null references public.tv_lineups(id) on delete cascade,
  station_id           uuid not null references public.tv_stations(id) on delete cascade,
  provider_channel_id  text,
  channel_number       text,
  channel_name         text,
  channel_order        integer,                         -- preserves provider order
  is_hd                boolean,
  enabled              boolean not null default true,
  -- True when the lineup lists the channel but the provider returned no
  -- programming for it. Tracked rather than silently dropped.
  no_listings          boolean not null default false,
  created_at           timestamptz not null default now(),
  unique (lineup_id, station_id, provider_channel_id)
);

-- ---------------------------------------------------------------------------
-- programmes
-- ---------------------------------------------------------------------------
create table if not exists public.tv_programmes (
  id                    uuid primary key default gen_random_uuid(),
  provider_id           text not null references public.tv_providers(id) on delete cascade,
  provider_programme_id text,
  title                 text not null,
  episode_title         text,
  programme_type        text,                            -- movie|series|sports|news|kids|special
  release_year          integer,
  season_number         integer,
  episode_number        integer,
  genres                text[] not null default '{}',
  description           text,                            -- only where licensed
  runtime_minutes       integer,
  content_rating        text,
  artwork_url           text,                            -- only where licensed
  metadata_source       text,
  metadata_updated_at   timestamptz,
  created_at            timestamptz not null default now(),
  unique (provider_id, provider_programme_id)
);

-- ---------------------------------------------------------------------------
-- airings — absolute instants only
-- ---------------------------------------------------------------------------
create table if not exists public.tv_airings (
  id                  uuid primary key default gen_random_uuid(),
  provider_airing_id  text,
  lineup_id           uuid not null references public.tv_lineups(id) on delete cascade,
  station_id          uuid not null references public.tv_stations(id) on delete cascade,
  programme_id        uuid not null references public.tv_programmes(id) on delete cascade,
  start_at_utc        timestamptz not null,
  end_at_utc          timestamptz,
  -- False when the provider gave no end time and no duration. Such rows are
  -- never shown as "on now", because we cannot prove they still are.
  is_complete         boolean not null default true,
  provider_timezone   text,
  lineup_timezone     text,
  -- Only ever set from provider flags. Never inferred.
  is_live             boolean,
  is_premiere         boolean,
  is_repeat           boolean,
  start_confidence    text,                              -- see normalizeTime.ts
  fetched_at          timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  expires_at          timestamptz,                       -- licence retention
  raw_hash            text not null,
  source              text not null default 'provider'   -- provider|fixture
);

-- One airing per station/slot/programme. This is the composite identity from
-- reconcile.ts — deliberately NOT title-based, so the same film at 8pm and 11pm
-- and on two channels all survive as distinct rows.
create unique index if not exists tv_airings_identity
  on public.tv_airings (lineup_id, station_id, start_at_utc, programme_id);
create unique index if not exists tv_airings_provider_id
  on public.tv_airings (lineup_id, provider_airing_id)
  where provider_airing_id is not null;

-- The read path: "what is on this lineup around now".
create index if not exists tv_airings_window
  on public.tv_airings (lineup_id, start_at_utc, end_at_utc);
create index if not exists tv_airings_station_window
  on public.tv_airings (station_id, start_at_utc);
create index if not exists tv_airings_expiry
  on public.tv_airings (expires_at) where expires_at is not null;

-- ---------------------------------------------------------------------------
-- observability
-- ---------------------------------------------------------------------------
create table if not exists public.tv_ingestion_runs (
  id                   uuid primary key default gen_random_uuid(),
  provider_id          text not null,
  lineup_id            uuid references public.tv_lineups(id) on delete cascade,
  started_at           timestamptz not null default now(),
  completed_at         timestamptz,
  status               text not null default 'running',  -- running|success|partial|failed|skipped
  trigger              text not null default 'cron',     -- cron|manual|retry
  requested_start_utc  timestamptz,
  requested_end_utc    timestamptz,
  actual_start_utc     timestamptz,
  actual_end_utc       timestamptz,
  channels_requested   integer not null default 0,
  channels_returned    integer not null default 0,
  channels_no_listings integer not null default 0,
  calls_used           integer not null default 0,
  records_inserted     integer not null default 0,
  records_updated      integer not null default 0,
  records_unchanged    integer not null default 0,
  records_expired      integer not null default 0,
  duration_ms          integer,
  errors               jsonb not null default '[]'::jsonb,
  warnings             jsonb not null default '[]'::jsonb
);
create index if not exists tv_ingestion_runs_recent
  on public.tv_ingestion_runs (lineup_id, started_at desc);

create table if not exists public.tv_call_ledger (
  id               uuid primary key default gen_random_uuid(),
  provider_id      text not null,
  lineup_id        uuid references public.tv_lineups(id) on delete set null,
  run_id           uuid references public.tv_ingestion_runs(id) on delete cascade,
  endpoint         text not null,
  requested_at     timestamptz not null default now(),
  response_status  integer,
  records_returned integer,
  counts_against_allowance boolean not null default true
);
create index if not exists tv_call_ledger_month
  on public.tv_call_ledger (provider_id, requested_at desc);

-- ---------------------------------------------------------------------------
-- RLS — schedule data is shared and world-readable; only the service role
-- writes it. The ingestion job runs server-side with the service key.
-- ---------------------------------------------------------------------------
alter table public.tv_providers       enable row level security;
alter table public.tv_markets         enable row level security;
alter table public.tv_lineups         enable row level security;
alter table public.tv_stations        enable row level security;
alter table public.tv_lineup_channels enable row level security;
alter table public.tv_programmes      enable row level security;
alter table public.tv_airings         enable row level security;
alter table public.tv_ingestion_runs  enable row level security;
alter table public.tv_call_ledger     enable row level security;

do $$
declare t text;
begin
  -- Public read for the schedule itself.
  foreach t in array array[
    'tv_markets','tv_lineups','tv_stations','tv_lineup_channels','tv_programmes','tv_airings'
  ] loop
    execute format(
      'drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select using (true)', t || '_read', t);
  end loop;
end $$;

-- Operational tables stay private: run history and the call ledger expose
-- provider usage, which is not public information. No SELECT policy is created,
-- so only the service role can read them.

comment on table public.tv_airings is
  'Stored schedule. Absolute UTC instants only — On Now / Coming Up are derived on read, never stored.';
comment on column public.tv_airings.is_complete is
  'False when the provider supplied neither an end time nor a duration. Such rows are never rendered as on-air.';
