-- =====================================================================
-- WatchVerdict — initial schema, RLS, indexes, and secure share lookup.
-- Reproducible from a fresh Supabase project.
-- =====================================================================

-- Postgres 13+ provides gen_random_uuid() natively.

-- ---------------------------------------------------------------------
-- Clean slate (initial setup only)
-- ---------------------------------------------------------------------
-- Drops any pre-existing versions of these app tables so the schema below is
-- applied cleanly, even if an earlier/partial schema exists in the project.
-- SAFE for initial setup (no live data yet). CASCADE removes dependent policies
-- and constraints. If you ever have real data you want to keep, remove this
-- block and reconcile the schema manually instead.
drop table if exists public.feedback        cascade;
drop table if exists public.watchlist_items cascade;
drop table if exists public.watchlists      cascade;
drop table if exists public.shares          cascade;
drop table if exists public.verdicts        cascade;
drop table if exists public.preference_rules cascade;
drop table if exists public.profiles        cascade;
drop function if exists public.get_public_share(text);
drop function if exists public.username_available(text);
drop function if exists public.set_updated_at() cascade;

-- ---------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  username            text unique,
  display_name        text,
  region              text not null default 'US',
  personal_label      text,                       -- e.g. "Scott Match"
  onboarding_complete boolean not null default false,
  liked_franchise_ids bigint[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint username_format check (
    username is null or username ~ '^[a-z0-9_]{3,24}$'
  )
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- preference_rules
-- ---------------------------------------------------------------------
create table if not exists public.preference_rules (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  trait             text not null,
  weight            integer not null check (weight between -40 and 40),
  requires_defining boolean not null default true,
  label             text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_preference_rules_user on public.preference_rules(user_id);

-- ---------------------------------------------------------------------
-- verdicts (cached per-user verdict history)
-- ---------------------------------------------------------------------
create table if not exists public.verdicts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  tmdb_id        bigint not null,
  media_type     text not null check (media_type in ('movie','tv')),
  title          text not null,
  year           integer,
  poster_path    text,
  general_score  integer not null check (general_score between 0 and 100),
  personal_score integer not null check (personal_score between 0 and 100),
  tier           text not null,
  disposition    text not null,
  report         jsonb not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);

create index if not exists idx_verdicts_user on public.verdicts(user_id);
create index if not exists idx_verdicts_user_created on public.verdicts(user_id, created_at desc);

drop trigger if exists verdicts_updated_at on public.verdicts;
create trigger verdicts_updated_at
  before update on public.verdicts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- watchlists
-- ---------------------------------------------------------------------
create table if not exists public.watchlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_watchlists_user on public.watchlists(user_id);

-- ---------------------------------------------------------------------
-- watchlist_items
-- ---------------------------------------------------------------------
create table if not exists public.watchlist_items (
  id            uuid primary key default gen_random_uuid(),
  watchlist_id  uuid not null references public.watchlists(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  tmdb_id       bigint not null,
  media_type    text not null check (media_type in ('movie','tv')),
  title         text not null,
  year          integer,
  poster_path   text,
  status        text not null default 'possible'
                 check (status in ('strict','possible','watching','watched','paused','dropped')),
  priority      integer not null default 0,
  rating        integer check (rating is null or rating between 1 and 10),
  notes         text,
  added_at      timestamptz not null default now(),
  watched_at    timestamptz,
  unique (watchlist_id, tmdb_id, media_type)
);

create index if not exists idx_watchlist_items_user on public.watchlist_items(user_id);
create index if not exists idx_watchlist_items_list on public.watchlist_items(watchlist_id);
create index if not exists idx_watchlist_items_status on public.watchlist_items(user_id, status);

-- ---------------------------------------------------------------------
-- shares
-- ---------------------------------------------------------------------
create table if not exists public.shares (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  token            text not null unique,
  kind             text not null check (kind in ('verdict','watchlist')),
  verdict_id       uuid references public.verdicts(id) on delete cascade,
  watchlist_id     uuid references public.watchlists(id) on delete cascade,
  include_personal boolean not null default false,
  is_active        boolean not null default true,
  snapshot         jsonb not null,   -- pre-computed public-safe payload
  expires_at       timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists idx_shares_user on public.shares(user_id);
create index if not exists idx_shares_token on public.shares(token);

-- ---------------------------------------------------------------------
-- feedback
-- ---------------------------------------------------------------------
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tmdb_id     bigint,
  media_type  text check (media_type in ('movie','tv')),
  rating      integer check (rating is null or rating between 1 and 10),
  comment     text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_feedback_user on public.feedback(user_id);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles         enable row level security;
alter table public.preference_rules enable row level security;
alter table public.verdicts         enable row level security;
alter table public.watchlists       enable row level security;
alter table public.watchlist_items  enable row level security;
alter table public.shares           enable row level security;
alter table public.feedback         enable row level security;

-- profiles: users manage only their own row. No public select (public data is
-- exposed through share snapshots only, to prevent profile enumeration).
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- preference_rules
drop policy if exists prefs_all_own on public.preference_rules;
create policy prefs_all_own on public.preference_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- verdicts
drop policy if exists verdicts_all_own on public.verdicts;
create policy verdicts_all_own on public.verdicts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- watchlists
drop policy if exists watchlists_all_own on public.watchlists;
create policy watchlists_all_own on public.watchlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- watchlist_items: owner only, and the item's user_id must match the owning list.
drop policy if exists watchlist_items_all_own on public.watchlist_items;
create policy watchlist_items_all_own on public.watchlist_items
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.watchlists w
      where w.id = watchlist_id and w.user_id = auth.uid()
    )
  );

-- shares: owner-only direct access. Public reads go through the SECURITY
-- DEFINER function below (no broad anon select => no enumeration).
drop policy if exists shares_all_own on public.shares;
create policy shares_all_own on public.shares
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- feedback
drop policy if exists feedback_all_own on public.feedback;
create policy feedback_all_own on public.feedback
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =====================================================================
-- Secure public share lookup (token -> public snapshot only)
-- =====================================================================
create or replace function public.get_public_share(share_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select s.snapshot
  from public.shares s
  where s.token = share_token
    and s.is_active = true
    and (s.expires_at is null or s.expires_at > now())
  limit 1;
$$;

revoke all on function public.get_public_share(text) from public;
grant execute on function public.get_public_share(text) to anon, authenticated;

-- =====================================================================
-- Username availability check (does not expose profile data)
-- =====================================================================
create or replace function public.username_available(candidate text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from public.profiles p where p.username = lower(candidate)
  );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
