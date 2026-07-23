-- 0022_tv_grid.sql
-- Cached national TV grid (Gracenote), refreshed hourly by /api/cron/tv-grid so
-- the app reads listings from our own DB and never hits Gracenote on the request
-- path. Public, non-sensitive listing data — service-role (admin) access only.

create table if not exists public.tv_grid (
  id           bigint generated always as identity primary key,
  call_sign    text        not null,
  network      text        not null,        -- friendly display name
  network_key  text,                         -- canonical key for filtering (e.g. 'amc')
  show_name    text        not null,
  airstamp     timestamptz not null,         -- UTC start
  runtime      integer,                      -- minutes
  is_movie     boolean     not null default false,
  image        text,                         -- poster art (TMS/Gracenote CDN)
  summary      text,                         -- short synopsis
  refreshed_at timestamptz not null default now(),
  unique (call_sign, airstamp)
);

-- Re-run safe: add the art/synopsis columns if an earlier version of this table
-- already exists without them.
alter table public.tv_grid add column if not exists image   text;
alter table public.tv_grid add column if not exists summary text;

create index if not exists tv_grid_airstamp_idx    on public.tv_grid (airstamp);
create index if not exists tv_grid_network_key_idx on public.tv_grid (network_key);
create index if not exists tv_grid_movie_idx       on public.tv_grid (is_movie);

-- Only the service-role client touches this table (see src/lib/tvGrid.ts).
alter table public.tv_grid enable row level security;

comment on table public.tv_grid is
  'Cached Gracenote national TV grid; refreshed hourly by /api/cron/tv-grid. Public listings, service-role access only.';
