-- =====================================================================
-- RLS verification queries for WatchVerdict.
-- Run these in the Supabase SQL editor after applying 0001_init.sql.
-- Every row in the first result MUST show rls_enabled = true.
-- =====================================================================

-- 1) RLS must be enabled on every application table.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'profiles','preference_rules','verdicts',
    'watchlists','watchlist_items','shares','feedback'
  )
order by c.relname;

-- 2) List all policies so you can confirm each table restricts to auth.uid().
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3) There must be NO broad anon SELECT policy on shares
--    (public reads go only through the SECURITY DEFINER RPC).
select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'shares';

-- 4) Confirm the public share RPC exists and is SECURITY DEFINER.
select p.proname, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_public_share', 'username_available');

-- 5) Manual cross-user check (run as two different signed-in users in the app,
--    or with two JWTs): user B must get zero rows for user A's data, e.g.
--    set request.jwt.claim.sub to user B, then:
--      select count(*) from verdicts;              -- only B's rows
--      select count(*) from watchlist_items;       -- only B's rows
--      update watchlist_items set notes = 'x';     -- affects 0 of A's rows
