-- =====================================================================
-- WatchVerdict — daily new-release digest.
-- Additive migration; safe to run after 0001_init.sql.
-- =====================================================================

-- Notification preferences on the profile.
alter table public.profiles
  add column if not exists daily_digest boolean not null default true;
alter table public.profiles
  add column if not exists digest_min_score integer not null default 72;
alter table public.profiles
  add column if not exists notify_email boolean not null default false;

-- Matches surfaced by the daily scan.
create table if not exists public.digest_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  tmdb_id        bigint not null,
  media_type     text not null check (media_type in ('movie','tv')),
  title          text not null,
  year           integer,
  poster_path    text,
  personal_score integer not null check (personal_score between 0 and 100),
  tier           text not null,
  primary_call   text not null,
  reason         text,
  release_date   text,
  dismissed      boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);

create index if not exists idx_digest_user on public.digest_items(user_id, dismissed, created_at desc);

alter table public.digest_items enable row level security;

drop policy if exists digest_all_own on public.digest_items;
create policy digest_all_own on public.digest_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
