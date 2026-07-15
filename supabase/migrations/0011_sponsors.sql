-- 0011_sponsors.sql
-- Sponsored Judges: a brand can "preside" over the courtroom — presence + a
-- coupon ("settlement") — WITHOUT touching the verdict. The scoring engine is
-- never consulted about sponsors; they're purely a branded frame and an offer.
-- Selected by location (local) or region, else national.

create table if not exists public.sponsors (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  judge_name     text not null,
  tagline        text,
  emoji          text,
  accent         text,                         -- brand accent hex, conforms to the UI
  cta_label      text,
  cta_url        text,
  discount_code  text,
  discount_label text,
  scope          text not null default 'national' check (scope in ('national','region','local')),
  region         text,                         -- ISO country for scope='region'
  lat            double precision,
  lng            double precision,
  radius_km      double precision,
  active         boolean not null default true,
  starts_at      timestamptz,
  ends_at        timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.sponsors enable row level security;

-- Active sponsors are ad inventory — readable by any signed-in user.
drop policy if exists sponsors_read on public.sponsors;
create policy sponsors_read on public.sponsors
  for select using (active = true);
-- No user write policy: inserting/editing sponsors requires the service role.

-- Conversion tracking: a row per coupon claim (the metric a sponsor pays for).
create table if not exists public.sponsor_events (
  id         uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  kind       text not null check (kind in ('impression','claim')),
  created_at timestamptz not null default now()
);
create index if not exists idx_sponsor_events_sponsor on public.sponsor_events(sponsor_id);

alter table public.sponsor_events enable row level security;

drop policy if exists sponsor_events_insert on public.sponsor_events;
create policy sponsor_events_insert on public.sponsor_events
  for insert with check (user_id = auth.uid() or user_id is null);
-- No select policy: conversion analytics are read with the service role only.

-- A clearly-fictional demo sponsor so the mechanic is visible. Replace or remove
-- for a real deal. (Idempotent.)
insert into public.sponsors
  (name, judge_name, tagline, emoji, accent, cta_label, cta_url, discount_code, discount_label, scope, active)
select
  'Corner Slice (demo sponsor)', 'The Corner Slice Judge',
  'Court is in session — a great verdict pairs with a great slice.', '🍕', '#e11d48',
  'Order a pizza', 'https://example.com', 'COURTROOM5', '5% off your order tonight', 'national', true
where not exists (select 1 from public.sponsors where name = 'Corner Slice (demo sponsor)');
