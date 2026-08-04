-- Canonical availability states — ADDITIVE AND BACKWARD COMPATIBLE.
--
-- Design rule: `source_type` is NOT altered, dropped, or re-typed. Every
-- existing value stays exactly where it is, so code deployed before this
-- migration keeps working unchanged and a rollback is a single DROP COLUMN
-- with zero data loss. New code reads `availability_state`; old code reads
-- `source_type`; both are correct during the overlap.
--
-- The title-level status (unconfirmed | none | available) lives in
-- application code, not here, and is deliberately untouched: it is the honest
-- "we have no confirmed answer" state and must not be weakened by this work.

alter table public.watchmode_availability
  add column if not exists availability_state text,
  add column if not exists addon_name         text,
  add column if not exists service_name       text,
  add column if not exists source_key         text,
  add column if not exists source_url         text,
  add column if not exists retrieved_at       timestamptz,
  add column if not exists last_verified_at   timestamptz,
  add column if not exists confidence         numeric(3,2),
  add column if not exists evidence_trace     text,
  add column if not exists watch_link         text;

-- The twelve canonical states. Enforced as a CHECK rather than a Postgres enum
-- so adding a state later is an ALTER of the constraint, not a type migration.
alter table public.watchmode_availability
  drop constraint if exists watchmode_availability_state_check;
alter table public.watchmode_availability
  add constraint watchmode_availability_state_check
  check (availability_state is null or availability_state in (
    'included_with_base_subscription',
    'included_with_premium_tier',
    'included_with_prime',
    'included_with_addon',
    'free_with_ads',
    'library_access',
    'rent',
    'buy',
    'coming_soon',
    'leaving_soon',
    'unavailable',
    'unverified'
  ));

-- Backfill from the four legacy values. Each mapping is stated explicitly
-- because each is a claim:
--   subscription -> included_with_base_subscription
--       Watchmode does not tell us the TIER, so this asserts base only. It
--       never asserts premium, add-on, or Prime inclusion — those require
--       positive evidence and are set by adapters, not by this backfill.
--   free         -> free_with_ads   (Watchmode's 'free' is ad-supported)
--   rent / buy   -> rent / buy      (exact)
-- Anything unrecognised becomes 'unverified' rather than a guess.
update public.watchmode_availability
set availability_state = case source_type
      when 'subscription' then 'included_with_base_subscription'
      when 'free'         then 'free_with_ads'
      when 'rent'         then 'rent'
      when 'buy'          then 'buy'
      else 'unverified'
    end,
    -- Provenance for pre-existing rows: they came from the Watchmode sync job.
    -- retrieved_at is left NULL rather than invented — we do not know when.
    source_key   = coalesce(source_key, 'watchmode'),
    service_name = coalesce(service_name, source_name),
    watch_link   = coalesce(watch_link, deeplink)
where availability_state is null;

-- Safe default for anything inserted without an explicit state.
alter table public.watchmode_availability
  alter column availability_state set default 'unverified';

create index if not exists watchmode_availability_state_idx
  on public.watchmode_availability (availability_state);

-- ROLLBACK (see supabase/migrations/rollback/):
--   drop index if exists public.watchmode_availability_state_idx;
--   alter table public.watchmode_availability
--     drop constraint if exists watchmode_availability_state_check;
--   alter table public.watchmode_availability
--     drop column if exists availability_state, drop column if exists addon_name,
--     drop column if exists service_name, drop column if exists source_key,
--     drop column if exists source_url, drop column if exists retrieved_at,
--     drop column if exists last_verified_at, drop column if exists confidence,
--     drop column if exists evidence_trace, drop column if exists watch_link;
-- source_type is never touched, so rollback loses nothing.
