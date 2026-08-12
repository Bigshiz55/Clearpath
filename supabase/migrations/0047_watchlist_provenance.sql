-- WatchVerdict — watchlist provenance.
--
-- WHY. A real account showed ~525 watchlist titles with ~518 marked WATCHED,
-- most of which the owner did not recognise. `watchlist_items` stores two
-- different claims in one table: LIST MEMBERSHIP ("I want to watch this") and
-- RATING EVIDENCE ("here is what I think of it"). Every rating from the endless
-- Docket game therefore became a watched list entry.
--
-- This migration does NOT delete or reclassify a single row. It adds the column
-- that makes the distinction expressible, defaults existing rows to
-- `unknown_legacy` — which means "we genuinely do not know", not "junk" — and
-- lets the application present the rows a user actually curated while keeping
-- every rating the recommendation engine has always had.
--
-- Deleting the 518 rows would have been a one-line migration and irreversible.

alter table public.watchlist_items
  add column if not exists provenance text;

-- Backfill is explicit rather than a column default, so a row written by an old
-- build (which does not know the column exists) is still distinguishable from a
-- row written before the column existed at all.
update public.watchlist_items
   set provenance = 'unknown_legacy'
 where provenance is null;

alter table public.watchlist_items
  alter column provenance set default 'unknown_legacy';

-- Constrained AFTER the backfill: adding a check constraint to a table with
-- nulls in the checked column fails, and doing it in the other order would make
-- this migration succeed on an empty database and fail on a real one.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'watchlist_items_provenance_check'
  ) then
    alter table public.watchlist_items
      add constraint watchlist_items_provenance_check
      check (provenance in (
        'explicit_user_save',
        'explicit_mark_seen',
        'user_import',
        'pack_checklist',
        'taste_game_rating',
        'onboarding_seed',
        'account_merge',
        'migration',
        'test_fixture',
        'unknown_legacy'
      ));
  end if;
end $$;

-- The watchlist page filters on this on every load.
create index if not exists idx_watchlist_items_provenance
  on public.watchlist_items(user_id, provenance);
