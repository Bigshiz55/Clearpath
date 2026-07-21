-- WatchVerdict — profile avatar + chosen charity.
--   avatar : a short emoji the user picks for their account (null = use initial).
--   charity: the id of the cause a member directs their membership pledge to.
-- Both are on the existing per-user profiles row (already RLS-scoped to the owner),
-- and read/written through guarded paths so the app works before this is applied.

alter table public.profiles add column if not exists avatar  text;
alter table public.profiles add column if not exists charity text;
