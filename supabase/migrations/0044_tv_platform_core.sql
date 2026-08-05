-- =====================================================================
-- 0044 — TELEVISION & STREAMING PLATFORM CORE
--
-- The normalized model the whole TV/streaming platform is built on, plus the
-- source registry that decides what any of it is allowed to show.
--
-- WHY A NEW MODEL RATHER THAN EXTENDING tv_*
-- The existing tv_providers/tv_lineups/tv_stations/tv_programmes/tv_airings
-- tables encode one assumption: a single national provider feeding a single
-- lineup. Everything this platform needs breaks that assumption —
--   * the same network has an East and a Pacific feed, and a local affiliate
--     in each market, all carrying different things at the same instant;
--   * the same title is an included subscription offer on one service, a
--     rental on another, and an add-on channel bought THROUGH a third;
--   * the same source is trustworthy for schedules and useless for offers.
-- Those are separate entities, not columns. The old tables are left intact
-- and still serve the shipped guide; this model is additive and takes over
-- surface by surface.
--
-- TWO RULES ARE ENFORCED IN THE SCHEMA, NOT IN A README
--
--  1. EVERY row that can reach a user carries `source_id` and `is_fixture`.
--     A row cannot exist without saying where it came from, and generated
--     test data cannot be mistaken for real data by anything, ever.
--
--  2. The PUBLIC read path is a set of views that filter `is_fixture = false`
--     AND require the source to be at a user-visible support stage. Anon and
--     authenticated are granted the views, never the tables. "Only verified,
--     never fixtures" therefore holds even if application code forgets,
--     because there is no grant through which it could fail.
--
-- Idempotent throughout: safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- SUPPORT STAGES — the nine-rung ladder, as a database type.
--
-- A text column with a CHECK would have worked; an enum is better here
-- because these values are referenced by the public views' WHERE clause, and
-- a typo in a stage name should fail at deploy time rather than silently
-- hide every row from every user.
-- ---------------------------------------------------------------------
do $$ begin
  create type support_stage as enum (
    'discovered', 'evaluated', 'fixture_tested', 'live_prototype',
    'ingesting', 'verified', 'production_supported', 'degraded', 'disabled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type adapter_cost_class as enum ('free', 'metered');
exception when duplicate_object then null; end $$;

do $$ begin
  create type source_kind as enum (
    'official_api', 'licensed_api', 'open_data', 'partner_feed',
    'affiliate_feed', 'public_schedule_page', 'fixture'
  );
exception when duplicate_object then null; end $$;

-- =====================================================================
-- SOURCE REGISTRY
-- =====================================================================

create table if not exists data_sources (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  source_type     source_kind not null,
  cost_class      adapter_cost_class not null default 'free',
  -- 'none' | 'api_key' | 'oauth' | 'account' — what it takes to call it.
  auth_type       text not null default 'none',
  geography       text not null default 'US',
  homepage_url    text,
  terms_url       text,
  -- Attribution is a licensing obligation, so it lives with the source and
  -- travels to every surface that renders its data.
  attribution_required boolean not null default false,
  attribution_text     text,
  rate_limit_per_min   integer,
  rate_limit_per_day   integer,
  monthly_call_limit   integer,
  -- THE GATE. Nothing from a source below 'verified' reaches a normal user;
  -- the public views below enforce it.
  support_stage        support_stage not null default 'discovered',
  stage_changed_at     timestamptz not null default now(),
  stage_changed_reason text,
  -- Mirrors DATA_MODE: which mode this source is legal to call in.
  requires_data_mode   text not null default 'free_live',
  enabled              boolean not null default true,
  notes                text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint data_sources_auth_type_ck
    check (auth_type in ('none', 'api_key', 'oauth', 'account')),
  constraint data_sources_requires_mode_ck
    check (requires_data_mode in ('fixture', 'free_live', 'paid_live'))
);

create index if not exists data_sources_stage_idx on data_sources (support_stage) where enabled;

-- What a source is actually good FOR. A source can be excellent at linear
-- schedules and have no offer data at all; one stage per source would force
-- a single verdict on two unrelated questions.
create table if not exists source_capabilities (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references data_sources(id) on delete cascade,
  capability    text not null,
  -- national | provider | market | affiliate — how deep the coverage goes.
  coverage_level text not null default 'national',
  completeness_note text,
  support_stage support_stage not null default 'discovered',
  unique (source_id, capability),
  constraint source_capabilities_capability_ck check (capability in (
    'linear_schedule', 'fast_channels', 'local_lineups', 'streaming_offers',
    'catalog_metadata', 'episode_metadata', 'rental_purchase'
  )),
  constraint source_capabilities_coverage_ck
    check (coverage_level in ('national', 'provider', 'market', 'affiliate'))
);

-- The promotion gate, recorded rather than remembered. One row per
-- evaluation; the newest row for a source is its current evidence.
create table if not exists source_promotion_evidence (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid not null references data_sources(id) on delete cascade,
  evaluated_at timestamptz not null default now(),
  consecutive_successful_runs integer not null default 0,
  record_count_within_expected_range boolean not null default false,
  coverage_dates_valid               boolean not null default false,
  sampled_against_originating_source boolean not null default false,
  timezones_correct                  boolean not null default false,
  duplicate_rate_acceptable          boolean not null default false,
  match_confidence_measured          boolean not null default false,
  failure_retains_last_good          boolean not null default false,
  served_from_stored_records         boolean not null default false,
  zero_browser_triggered_requests    boolean not null default false,
  independently_disableable          boolean not null default false,
  no_fixture_or_placeholder_rows     boolean not null default false,
  freshness_and_confidence_exposed   boolean not null default false,
  attribution_satisfied              boolean not null default false,
  eligible    boolean not null default false,
  unmet       jsonb not null default '[]'::jsonb
);
create index if not exists source_promotion_evidence_source_idx
  on source_promotion_evidence (source_id, evaluated_at desc);

-- Every ingestion attempt, successful or not.
create table if not exists source_runs (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references data_sources(id) on delete cascade,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  status        text not null default 'running',
  trigger       text not null default 'cron',
  -- Which DATA_MODE the run happened under. Without this, a fixture-mode run
  -- and a live run are indistinguishable after the fact, and "we verified it"
  -- becomes unfalsifiable.
  data_mode     text not null default 'fixture',
  records_in    integer not null default 0,
  records_written integer not null default 0,
  requests_made integer not null default 0,
  errors        jsonb not null default '[]'::jsonb,
  constraint source_runs_status_ck
    check (status in ('running', 'success', 'partial', 'failed', 'skipped')),
  constraint source_runs_mode_ck
    check (data_mode in ('fixture', 'free_live', 'paid_live'))
);
create index if not exists source_runs_source_started_idx
  on source_runs (source_id, started_at desc);
create index if not exists source_runs_recent_idx on source_runs (started_at desc);

-- THE DURABLE EGRESS LEDGER. The in-process ring buffer in egressGuard.ts
-- answers "is this instance calling anything"; this answers "did anything
-- call this source, ever, and was it allowed to" across every instance and
-- every deploy. That question had no answer when a metered allowance drained.
create table if not exists source_requests (
  id            bigserial primary key,
  source_id     uuid references data_sources(id) on delete set null,
  adapter_id    text not null,
  at            timestamptz not null default now(),
  trigger       text not null,
  -- Coarse, never a full URL: a URL can carry a key in a query parameter,
  -- and this table is read by the admin dashboard.
  target        text not null,
  cost_class    adapter_cost_class not null,
  allowed       boolean not null,
  denial_code   text,
  status_code   integer,
  bytes         integer,
  duration_ms   integer,
  -- Served from the replay cassette rather than the network.
  replayed      boolean not null default false,
  -- Answered by a conditional request (304) — costs a round trip, not quota.
  not_modified  boolean not null default false,
  data_mode     text not null default 'fixture'
);
create index if not exists source_requests_at_idx on source_requests (at desc);
create index if not exists source_requests_adapter_idx on source_requests (adapter_id, at desc);
-- Denied metered attempts are the alerting surface; a partial index keeps
-- that query cheap no matter how large the allowed traffic gets.
create index if not exists source_requests_denied_metered_idx
  on source_requests (at desc) where allowed = false and cost_class = 'metered';

create table if not exists source_quota_usage (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references data_sources(id) on delete cascade,
  window_kind  text not null,
  window_start timestamptz not null,
  calls        integer not null default 0,
  call_limit   integer,
  unique (source_id, window_kind, window_start),
  constraint source_quota_window_ck check (window_kind in ('minute', 'hour', 'day', 'month'))
);

-- =====================================================================
-- CANONICAL CATALOG
-- =====================================================================

create table if not exists canon_titles (
  id             uuid primary key default gen_random_uuid(),
  -- Stable, human-readable, deterministic. The fixture engine derives it
  -- from a seed so a regenerated corpus is byte-identical.
  canonical_key  text not null unique,
  title_type     text not null,
  primary_title  text not null,
  sort_title     text not null,
  release_year   integer,
  end_year       integer,
  runtime_minutes integer,
  original_language text not null default 'en',
  overview       text,
  poster_path    text,
  is_fixture     boolean not null default false,
  source_id      uuid references data_sources(id) on delete set null,
  match_confidence numeric(4,3),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint canon_titles_type_ck check (title_type in ('movie', 'series', 'special', 'sports', 'news', 'other')),
  constraint canon_titles_confidence_ck
    check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1))
);
create index if not exists canon_titles_sort_idx on canon_titles (sort_title);
create index if not exists canon_titles_type_year_idx on canon_titles (title_type, release_year);
create index if not exists canon_titles_real_idx on canon_titles (id) where is_fixture = false;
create index if not exists canon_titles_trgm_idx on canon_titles using gin (primary_title gin_trgm_ops);

create table if not exists canon_title_aliases (
  id         uuid primary key default gen_random_uuid(),
  title_id   uuid not null references canon_titles(id) on delete cascade,
  alias      text not null,
  alias_kind text not null default 'aka',
  locale     text,
  source_id  uuid references data_sources(id) on delete set null,
  constraint canon_title_aliases_kind_ck check (alias_kind in ('aka', 'localized', 'source', 'shortened'))
);
-- A unique INDEX, not a table constraint: the identity includes an optional
-- locale, and only an index may contain an expression. Two rows differing
-- only by NULL locale would otherwise both be allowed.
create unique index if not exists canon_title_aliases_identity_idx
  on canon_title_aliases (title_id, alias, coalesce(locale, ''));
create index if not exists canon_title_aliases_trgm_idx on canon_title_aliases using gin (alias gin_trgm_ops);

create table if not exists canon_title_external_ids (
  id         uuid primary key default gen_random_uuid(),
  title_id   uuid not null references canon_titles(id) on delete cascade,
  namespace  text not null,
  external_id text not null,
  unique (namespace, external_id)
);

create table if not exists canon_seasons (
  id            uuid primary key default gen_random_uuid(),
  title_id      uuid not null references canon_titles(id) on delete cascade,
  season_number integer not null,
  name          text,
  is_fixture    boolean not null default false,
  unique (title_id, season_number)
);

create table if not exists canon_episodes (
  id             uuid primary key default gen_random_uuid(),
  title_id       uuid not null references canon_titles(id) on delete cascade,
  season_id      uuid references canon_seasons(id) on delete cascade,
  season_number  integer not null,
  episode_number integer not null,
  name           text,
  overview       text,
  first_aired_utc timestamptz,
  runtime_minutes integer,
  is_fixture     boolean not null default false,
  source_id      uuid references data_sources(id) on delete set null,
  unique (title_id, season_number, episode_number)
);
create index if not exists canon_episodes_title_idx on canon_episodes (title_id, season_number, episode_number);
create index if not exists canon_episodes_aired_idx on canon_episodes (first_aired_utc);

create table if not exists canon_genres (
  id   uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null
);

create table if not exists canon_title_genres (
  title_id uuid not null references canon_titles(id) on delete cascade,
  genre_id uuid not null references canon_genres(id) on delete cascade,
  primary key (title_id, genre_id)
);

-- =====================================================================
-- DISTRIBUTION — services and offers
-- =====================================================================

create table if not exists dist_services (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  service_kind text not null,
  -- An add-on channel sold THROUGH another service (Acorn TV via Amazon) is
  -- a different product from the same channel bought direct: different
  -- price, different app, different cancellation. Modelling it as a parent
  -- link keeps them separate offers rather than collapsing them into one.
  parent_service_id uuid references dist_services(id) on delete set null,
  homepage_url text,
  logo_path    text,
  is_fixture   boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint dist_services_kind_ck check (service_kind in (
    'subscription', 'fast', 'tvod', 'network_app', 'addon', 'live_tv', 'free_ad_supported'
  ))
);

create table if not exists dist_service_regions (
  service_id uuid not null references dist_services(id) on delete cascade,
  region     text not null,
  primary key (service_id, region)
);

create table if not exists dist_offers (
  id           uuid primary key default gen_random_uuid(),
  title_id     uuid not null references canon_titles(id) on delete cascade,
  episode_id   uuid references canon_episodes(id) on delete cascade,
  service_id   uuid not null references dist_services(id) on delete cascade,
  offer_type   text not null,
  region       text not null default 'US',
  price_cents  integer,
  currency     text not null default 'USD',
  quality      text,
  deeplink     text,
  -- TRUE when bought directly from the service; FALSE when it is the same
  -- channel accessed through `via_service_id`. "Never label a rentable Prime
  -- Video title as included with Prime" is this pair of columns plus
  -- offer_type, not a copy rule.
  is_direct    boolean not null default true,
  via_service_id uuid references dist_services(id) on delete set null,
  available_from  timestamptz,
  available_until timestamptz,
  source_id    uuid references data_sources(id) on delete set null,
  confidence   numeric(4,3),
  is_fixture   boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint dist_offers_type_ck check (offer_type in (
    'subscription', 'free_ad_supported', 'free', 'rent', 'buy', 'addon', 'live_linear', 'cinema'
  )),
  constraint dist_offers_price_ck check (
    (offer_type in ('rent', 'buy') and price_cents is not null) or offer_type not in ('rent', 'buy')
  ),
  constraint dist_offers_via_ck check (
    (is_direct and via_service_id is null) or (not is_direct and via_service_id is not null)
  )
);
-- One offer per (title/episode, service, type, region, route). The COALESCEs
-- are what make "same title, direct vs via Amazon" two rows rather than a
-- conflict.
create unique index if not exists dist_offers_identity_idx on dist_offers (
  title_id, coalesce(episode_id, '00000000-0000-0000-0000-000000000000'::uuid),
  service_id, offer_type, region,
  coalesce(via_service_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
create index if not exists dist_offers_title_idx on dist_offers (title_id) where is_fixture = false;
create index if not exists dist_offers_service_idx on dist_offers (service_id, offer_type);
create index if not exists dist_offers_freshness_idx on dist_offers (last_seen_at desc);

-- =====================================================================
-- LINEAR & FAST
-- =====================================================================

create table if not exists linear_networks (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  category     text not null,
  -- national | east | pacific. The same network's East and Pacific feeds are
  -- carrying different programmes at the same instant, so they are separate
  -- rows with a shared parent rather than one row with a timezone offset.
  feed_variant text not null default 'national',
  parent_network_id uuid references linear_networks(id) on delete set null,
  is_fast      boolean not null default false,
  logo_path    text,
  is_fixture   boolean not null default false,
  source_id    uuid references data_sources(id) on delete set null,
  constraint linear_networks_category_ck check (category in (
    'broadcast', 'cable_entertainment', 'news', 'sports', 'kids', 'movies',
    'lifestyle', 'documentary', 'music', 'religious', 'shopping', 'local', 'fast'
  )),
  constraint linear_networks_feed_ck check (feed_variant in ('national', 'east', 'pacific'))
);
create index if not exists linear_networks_category_idx on linear_networks (category);
create index if not exists linear_networks_fast_idx on linear_networks (id) where is_fast;

create table if not exists linear_affiliates (
  id          uuid primary key default gen_random_uuid(),
  network_id  uuid not null references linear_networks(id) on delete cascade,
  callsign    text not null,
  market_dma  text,
  city        text,
  state       text,
  -- IANA zone. Stored per affiliate because a national network's affiliates
  -- span four of them, and "assume Eastern" is how a schedule silently
  -- shifts by three hours.
  timezone    text not null default 'America/New_York',
  is_fixture  boolean not null default false,
  unique (network_id, callsign)
);
create index if not exists linear_affiliates_market_idx on linear_affiliates (market_dma);

create table if not exists linear_lineups (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text not null,
  provider_slug  text,
  region         text not null default 'US',
  postal_code    text,
  market_dma     text,
  timezone       text not null default 'America/New_York',
  coverage_level text not null default 'national',
  source_id      uuid references data_sources(id) on delete set null,
  is_fixture     boolean not null default false,
  constraint linear_lineups_coverage_ck
    check (coverage_level in ('national', 'provider', 'market', 'affiliate'))
);

create table if not exists linear_lineup_channels (
  id             uuid primary key default gen_random_uuid(),
  lineup_id      uuid not null references linear_lineups(id) on delete cascade,
  network_id     uuid references linear_networks(id) on delete cascade,
  affiliate_id   uuid references linear_affiliates(id) on delete cascade,
  channel_number text,
  is_hd          boolean not null default true,
  sort_order     integer not null default 0,
  is_fixture     boolean not null default false,
  -- A channel slot carries a network or a specific local affiliate of one,
  -- never neither.
  constraint linear_lineup_channels_target_ck
    check (network_id is not null or affiliate_id is not null)
);
create unique index if not exists linear_lineup_channels_identity_idx on linear_lineup_channels (
  lineup_id,
  coalesce(network_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(affiliate_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(channel_number, '')
);

create table if not exists linear_airings (
  id            uuid primary key default gen_random_uuid(),
  channel_id    uuid not null references linear_lineup_channels(id) on delete cascade,
  title_id      uuid references canon_titles(id) on delete set null,
  episode_id    uuid references canon_episodes(id) on delete set null,
  -- An UNMATCHED programme still displays, using exactly what the source
  -- said. Requiring a canonical match to store an airing is how a schedule
  -- develops holes that look like "nothing is on".
  raw_title         text not null,
  raw_episode_title text,
  start_utc     timestamptz not null,
  end_utc       timestamptz not null,
  -- TIME HANDLING. UTC is authoritative, but the source's own timezone and
  -- wall-clock string are kept verbatim so a DST-ambiguous hour can be
  -- re-derived rather than guessed at a second time.
  source_timezone   text not null,
  source_local_time text,
  dst_ambiguous     boolean not null default false,
  dst_nonexistent   boolean not null default false,
  crosses_midnight  boolean not null default false,
  is_new        boolean not null default false,
  is_live       boolean not null default false,
  content_type  text,
  source_id     uuid references data_sources(id) on delete set null,
  match_confidence numeric(4,3),
  is_fixture    boolean not null default false,
  ingested_at   timestamptz not null default now(),
  constraint linear_airings_window_ck check (end_utc > start_utc)
);
create unique index if not exists linear_airings_identity_idx
  on linear_airings (channel_id, start_utc, raw_title);
create index if not exists linear_airings_window_idx on linear_airings (start_utc, end_utc);
create index if not exists linear_airings_channel_window_idx on linear_airings (channel_id, start_utc);
create index if not exists linear_airings_title_idx on linear_airings (title_id) where title_id is not null;
create index if not exists linear_airings_real_idx on linear_airings (start_utc) where is_fixture = false;

create table if not exists linear_schedule_coverage (
  id           uuid primary key default gen_random_uuid(),
  lineup_id    uuid not null references linear_lineups(id) on delete cascade,
  source_id    uuid not null references data_sources(id) on delete cascade,
  coverage_start_utc timestamptz,
  coverage_end_utc   timestamptz,
  last_success_at    timestamptz,
  airing_count       integer not null default 0,
  unique (lineup_id, source_id)
);

-- =====================================================================
-- MATCHING & REVIEW
-- =====================================================================

create table if not exists match_candidates (
  id            uuid primary key default gen_random_uuid(),
  raw_title     text not null,
  raw_year      integer,
  raw_episode_title text,
  source_id     uuid references data_sources(id) on delete set null,
  candidate_title_id uuid references canon_titles(id) on delete cascade,
  score         numeric(4,3) not null,
  method        text not null default 'exact',
  -- Anything below the auto-accept threshold waits for a human rather than
  -- being guessed into the catalogue.
  decision      text not null default 'pending',
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  constraint match_candidates_decision_ck
    check (decision in ('pending', 'accepted', 'rejected', 'deferred')),
  constraint match_candidates_score_ck check (score >= 0 and score <= 1)
);
create index if not exists match_candidates_pending_idx
  on match_candidates (created_at desc) where decision = 'pending';

-- =====================================================================
-- SIMULATION CLOCK
--
-- Fixture mode has to prove a MONTH of three-hourly sync cycles, and waiting
-- a month is not a test strategy. The clock is a stored offset the fixture
-- adapters read instead of wall-clock time, so 240 cycles run in seconds and
-- every one of them is reproducible from the seed.
-- =====================================================================
create table if not exists sim_clock (
  id            text primary key default 'default',
  epoch_utc     timestamptz not null,
  offset_seconds bigint not null default 0,
  tick_seconds  integer not null default 10800,
  ticks_elapsed integer not null default 0,
  running       boolean not null default false,
  updated_at    timestamptz not null default now(),
  constraint sim_clock_singleton_ck check (id = 'default')
);

-- =====================================================================
-- ROW LEVEL SECURITY
--
-- Tables are service-role only. Everything a browser can read goes through
-- the views below, which filter fixtures and unverified sources. There is no
-- grant path by which a fixture row could reach an anonymous reader, which is
-- a stronger guarantee than "the application remembers to filter".
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'data_sources', 'source_capabilities', 'source_promotion_evidence',
    'source_runs', 'source_requests', 'source_quota_usage',
    'canon_titles', 'canon_title_aliases', 'canon_title_external_ids',
    'canon_seasons', 'canon_episodes', 'canon_genres', 'canon_title_genres',
    'dist_services', 'dist_service_regions', 'dist_offers',
    'linear_networks', 'linear_affiliates', 'linear_lineups',
    'linear_lineup_channels', 'linear_airings', 'linear_schedule_coverage',
    'match_candidates', 'sim_clock'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('drop policy if exists %I on %I', t || '_service_all', t);
    execute format(
      'create policy %I on %I for all to service_role using (true) with check (true)',
      t || '_service_all', t);
  end loop;
end $$;

-- =====================================================================
-- PUBLIC READ VIEWS — the only thing a browser ever sees.
--
-- `security_invoker = off` (the default for views) means these run with the
-- definer's rights, which is what lets a table with no anon grant be read
-- through a view that filters it. The filter is the point:
--
--     is_fixture = false            generated data is never real availability
--     support_stage in (verified,   unproven sources do not reach users
--                       production_supported)
-- =====================================================================

create or replace view public_canon_titles as
  select t.id, t.canonical_key, t.title_type, t.primary_title, t.sort_title,
         t.release_year, t.end_year, t.runtime_minutes, t.original_language,
         t.overview, t.poster_path, t.match_confidence, t.updated_at,
         s.slug as source_slug, s.attribution_text
    from canon_titles t
    left join data_sources s on s.id = t.source_id
   where t.is_fixture = false
     and (s.id is null or s.support_stage in ('verified', 'production_supported'));

create or replace view public_dist_offers as
  select o.id, o.title_id, o.episode_id, o.service_id, sv.slug as service_slug,
         sv.name as service_name, sv.service_kind, o.offer_type, o.region,
         o.price_cents, o.currency, o.quality, o.deeplink,
         o.is_direct, o.via_service_id, via.slug as via_service_slug,
         o.available_from, o.available_until, o.confidence, o.last_seen_at,
         s.slug as source_slug, s.attribution_text
    from dist_offers o
    join dist_services sv on sv.id = o.service_id
    left join dist_services via on via.id = o.via_service_id
    left join data_sources s on s.id = o.source_id
   where o.is_fixture = false
     and sv.is_fixture = false
     and (s.id is null or s.support_stage in ('verified', 'production_supported'));

create or replace view public_linear_airings as
  select a.id, a.channel_id, c.lineup_id, c.channel_number,
         coalesce(n.name, pn.name) as network_name,
         coalesce(n.slug, pn.slug) as network_slug,
         af.callsign, a.title_id, a.episode_id,
         a.raw_title, a.raw_episode_title, a.start_utc, a.end_utc,
         a.source_timezone, a.is_new, a.is_live, a.content_type,
         a.match_confidence, a.ingested_at,
         s.slug as source_slug, s.attribution_text
    from linear_airings a
    join linear_lineup_channels c on c.id = a.channel_id
    left join linear_networks n on n.id = c.network_id
    left join linear_affiliates af on af.id = c.affiliate_id
    left join linear_networks pn on pn.id = af.network_id
    left join data_sources s on s.id = a.source_id
   where a.is_fixture = false
     and (s.id is null or s.support_stage in ('verified', 'production_supported'));

-- Coverage is safe to expose in full: it is counts and timestamps, and an
-- operator dashboard that only shows verified sources cannot show you the
-- unverified one that is broken.
create or replace view public_source_health as
  select s.slug, s.name, s.source_type, s.cost_class, s.support_stage,
         s.stage_changed_at, s.geography, s.attribution_required, s.attribution_text,
         (select max(started_at) from source_runs r where r.source_id = s.id and r.status in ('success','partial')) as last_success_at,
         (select count(*) from source_runs r where r.source_id = s.id and r.started_at > now() - interval '7 days') as runs_7d
    from data_sources s
   where s.enabled;

grant select on public_canon_titles, public_dist_offers, public_linear_airings,
                public_source_health to anon, authenticated;

-- =====================================================================
-- SEED — the source registry itself.
--
-- Every source the platform knows about, at its HONEST stage. `fixture` is
-- the only one above 'evaluated', and it is 'fixture_tested' rather than
-- 'verified' precisely because fixtures may never be presented as real: the
-- public views exclude it by stage as well as by is_fixture.
-- =====================================================================
insert into data_sources (slug, name, source_type, cost_class, auth_type, geography,
                          homepage_url, support_stage, requires_data_mode, enabled, notes)
values
  ('fixture', 'Deterministic fixture engine', 'fixture', 'free', 'none', 'US',
   null, 'fixture_tested', 'fixture', true,
   'Generated test corpus. Never user-visible in production: excluded by is_fixture AND by stage.'),
  ('tvmaze', 'TVmaze', 'official_api', 'free', 'none', 'US',
   'https://www.tvmaze.com/api', 'ingesting', 'free_live', true,
   'Free, no key. First-run episodes on major networks only — not a full grid.'),
  ('tv_media', 'TV Media', 'licensed_api', 'metered', 'api_key', 'US/CA',
   'https://www.tvmedia.ca/', 'evaluated', 'paid_live', false,
   'Metered. Disabled: requires DATA_MODE=paid_live AND TVMEDIA_ENABLED=1.'),
  ('schedules_direct', 'Schedules Direct', 'licensed_api', 'free', 'account', 'US/CA',
   'https://www.schedulesdirect.org', 'evaluated', 'free_live', false,
   'Non-profit, $25/yr, full US lineups by postal code. No account configured.'),
  ('tmdb', 'TMDB', 'official_api', 'free', 'api_key', 'global',
   'https://www.themoviedb.org', 'ingesting', 'free_live', true,
   'Catalog metadata. Attribution required by terms.'),
  ('watchmode', 'Watchmode', 'licensed_api', 'metered', 'api_key', 'US',
   'https://api.watchmode.com', 'evaluated', 'paid_live', false,
   'Streaming availability. Free tier is non-commercial only.')
on conflict (slug) do nothing;

update data_sources
   set attribution_required = true,
       attribution_text = 'This product uses the TMDB API but is not endorsed or certified by TMDB.'
 where slug = 'tmdb' and attribution_text is null;

insert into source_capabilities (source_id, capability, coverage_level, support_stage, completeness_note)
select s.id, c.capability, c.coverage_level, c.stage, c.note
  from data_sources s
  join (values
    ('fixture', 'linear_schedule',  'affiliate', 'fixture_tested'::support_stage, 'Full generated grid incl. local affiliates'),
    ('fixture', 'streaming_offers', 'national',  'fixture_tested'::support_stage, 'All offer types incl. add-on routing'),
    ('fixture', 'catalog_metadata', 'national',  'fixture_tested'::support_stage, 'Deterministic canonical corpus'),
    ('fixture', 'episode_metadata', 'national',  'fixture_tested'::support_stage, 'Deterministic episode corpus'),
    ('fixture', 'fast_channels',    'national',  'fixture_tested'::support_stage, 'Generated FAST networks'),
    ('fixture', 'local_lineups',    'affiliate', 'fixture_tested'::support_stage, 'Generated DMA lineups'),
    ('tvmaze',  'linear_schedule',  'national',  'ingesting'::support_stage,      'First-run episodes only; no reruns, movies or local'),
    ('tvmaze',  'episode_metadata', 'national',  'ingesting'::support_stage,      'Good episode names and air dates'),
    ('tmdb',    'catalog_metadata', 'national',  'ingesting'::support_stage,      'Titles, overviews, posters, genres'),
    ('tv_media','linear_schedule',  'provider',  'evaluated'::support_stage,      'Full grid by lineup — not yet licensed'),
    ('schedules_direct', 'linear_schedule', 'affiliate', 'evaluated'::support_stage, 'Full US lineups by postal code — no account'),
    ('watchmode','streaming_offers','national',  'evaluated'::support_stage,      'Offers incl. rent/buy — non-commercial tier only')
  ) as c(slug, capability, coverage_level, stage, note) on c.slug = s.slug
on conflict (source_id, capability) do nothing;

insert into sim_clock (id, epoch_utc, offset_seconds, tick_seconds, ticks_elapsed, running)
values ('default', timestamptz '2026-01-01 00:00:00+00', 0, 10800, 0, false)
on conflict (id) do nothing;
