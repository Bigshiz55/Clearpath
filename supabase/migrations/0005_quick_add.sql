-- WatchVerdict — "Quick Add" personal key so phone shortcuts (Siri / share sheet)
-- can add titles to a user's watchlist without a browser session.
alter table public.profiles add column if not exists quick_add_token text unique;
