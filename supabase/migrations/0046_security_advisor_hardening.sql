-- ===========================================================================
-- 0046 — security-advisor remediation.  (idempotent, guarded)
--
-- Follows 0045 (user-view RLS, already applied). This migration fixes the two
-- findings that are REAL vulnerabilities; everything else was classified as an
-- intentional interface (proved), a service-only table (correctly denied), or
-- a false positive — see docs/SECURITY-ADVISOR-0046.md for the full audit.
--
-- Deliberately NOT touched:
--   • Court RPCs (court_join/vote/state/chat/…) keep anon EXECUTE — guest Live
--     Court needs anonymous participation and each RPC gates on a room code +
--     participant/host token. Category B.
--   • growth_click(text,text,text) keeps anon EXECUTE — it is the public click
--     tracker by design. Category B.
--   • public_canon_titles / public_dist_offers / public_linear_airings /
--     public_source_health keep anon SELECT — definer views that expose only
--     filtered, non-user catalog columns. Category B.
--   • Every SECURITY DEFINER function already sets `search_path = public`
--     (verified across all 13 migration files). No mutable-search-path finding
--     remains. Category D.
-- ===========================================================================

-- FINDING 1 (real): the pack-ingest lock RPCs are SERVER-ONLY but were granted
-- to anon + authenticated in 0038. They are SECURITY DEFINER and take an
-- advisory lock / write pack_ingest_runs — a client must never call them. They
-- are also dead in the current codebase (the synchronous lazy-ingest path that
-- used them was removed), so revoking client EXECUTE changes no product
-- behavior and closes an unnecessary privileged surface.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'pack_try_start_ingest') then
    revoke all on function public.pack_try_start_ingest(uuid, int) from anon, authenticated, public;
    grant execute on function public.pack_try_start_ingest(uuid, int) to service_role;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'pack_finish_ingest') then
    revoke all on function public.pack_finish_ingest(uuid, text, int, text) from anon, authenticated, public;
    grant execute on function public.pack_finish_ingest(uuid, text, int, text) to service_role;
  end if;
end $$;

-- FINDING 2 (real): the migration ledger must not be client-readable. Enabling
-- RLS with NO policy denies anon + authenticated entirely while service_role
-- (which bypasses RLS) and the migration tooling keep full access. Guarded so
-- it is a no-op where the table is absent (some environments track migrations
-- elsewhere).
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'schema_migrations') then
    execute 'alter table public.schema_migrations enable row level security';
    revoke all on public.schema_migrations from anon, authenticated;
  end if;
end $$;
