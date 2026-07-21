-- WatchVerdict — profile avatar.
--   avatar : a short emoji the user picks for their account (null = use initial).
-- On the existing per-user profiles row (already RLS-scoped to the owner), read
-- and written through guarded paths so the app works before this is applied.

alter table public.profiles add column if not exists avatar text;
