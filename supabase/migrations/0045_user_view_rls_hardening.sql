-- ===========================================================================
-- 0045 — user-specific views must NOT bypass row-level security.  (idempotent)
--
-- P0 STRUCTURAL RISK.  Two views join per-user tables:
--
--   user_seen_programmes   → user_seen        (RLS: auth.uid() = user_id)
--   user_tracking_matches  → user_tracking    (RLS: auth.uid() = user_id)
--
-- A view in Postgres defaults to `security_invoker = off`, i.e. it runs with
-- the VIEW OWNER's rights and the base-table RLS is NEVER evaluated for the
-- caller.  So a signed-in user querying `select * from user_seen_programmes`
-- with no `user_id` filter would read EVERY user's seen history, and the
-- anon role — if the view is reachable — could read all of it too.  The
-- application always adds `.eq('user_id', …)`, but an application filter is
-- not a security boundary; the database must enforce isolation itself.
--
-- FIX: turn on `security_invoker` so the caller's own RLS on user_seen /
-- user_tracking applies through the view.  With it on, an anon caller
-- (auth.uid() IS NULL) matches no rows, and user A can never read user B.
--
-- The 0044 catalog views (public_canon_titles, public_dist_offers,
-- public_linear_airings, public_source_health) are deliberately left
-- definer-side: they expose NON-user, filtered catalog data and carry no
-- user_id, so invoker semantics there would only break the intended public
-- read.  This migration touches ONLY the two user-scoped views.
--
-- Postgres 15+ (Supabase runs 15/16) supports ALTER VIEW … SET
-- (security_invoker = true).  Guarded so it is a no-op on an older engine
-- rather than a hard failure.
-- ===========================================================================

do $$
begin
  if current_setting('server_version_num')::int >= 150000 then
    if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'user_seen_programmes') then
      execute 'alter view public.user_seen_programmes set (security_invoker = true)';
    end if;
    if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'user_tracking_matches') then
      execute 'alter view public.user_tracking_matches set (security_invoker = true)';
    end if;
  else
    raise notice '0045: server_version < 15; security_invoker unsupported. Revoke anon reach instead.';
  end if;
end $$;

-- Belt and braces regardless of engine version: anon must never read either
-- user-scoped view.  (With security_invoker on this is already true via RLS;
-- the explicit revoke also protects an older engine that ignored the ALTER.)
revoke all on public.user_seen_programmes from anon;
revoke all on public.user_tracking_matches from anon;

-- Authenticated callers keep SELECT — RLS on the base tables scopes them to
-- their own rows.  (Grant is idempotent.)
grant select on public.user_seen_programmes to authenticated;
grant select on public.user_tracking_matches to authenticated;

comment on view public.user_seen_programmes is
  'Effective seen-programme set (direct + Case-implied). security_invoker=on: base-table RLS (auth.uid()=user_id) applies through the view. See migration 0045.';
comment on view public.user_tracking_matches is
  'Subscription→airing matches. security_invoker=on: base-table RLS (auth.uid()=user_id) applies through the view. See migration 0045.';
