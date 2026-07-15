-- 0006_services.sql
-- "My Services": the streaming subscriptions a user has, so verdicts can flag
-- what's actually included with their plan vs. what needs a rental.
-- Stored as TMDB watch-provider ids (see src/lib/services.ts for the catalog).

alter table public.profiles
  add column if not exists my_services bigint[] not null default '{}';
