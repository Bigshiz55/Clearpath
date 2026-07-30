-- 0039 — Packs expansion: split Hallmark & Lifetime into two real Packs
-- (Hallmark Universe, Lifetime Movie Vault), rebrand the crime Pack (Crime
-- Case Files), and add the schema needed for sourced case facts, verified
-- franchise relationships, and a real TMDB bridge for actor tracking and
-- Pack DNA. This migration adds STRUCTURE ONLY — no case facts, franchise
-- orders, or actor links are seeded here. Every fact-bearing table below
-- carries its own `source_url` + `confidence`, and stays empty until a real,
-- cited source populates it. The shared Pack architecture rule from 0036
-- still holds: application code branches on feature-flag booleans, never on
-- `packs.slug`.
--
-- Design notes:
--   * Renaming a Pack's slug/display_name is an UPDATE on the existing row,
--     not a delete+insert — this preserves its id, so any pack_stations or
--     user_tracking rows already pointing at it stay intact.
--   * `case_subjects` deliberately does NOT collapse a person into one label.
--     Role-at-the-time (suspect, charged, defendant) and eventual outcome
--     (convicted, acquitted, exonerated) are different facts that must not be
--     inferred from each other — a charged person is not a convicted person.
--   * `case_timeline_events` requires a `headline` but allows a null
--     `event_date` (a real but undated development) and always carries a
--     `disputed` flag so contested claims can be shown as contested rather
--     than either omitted or stated as fact.
--   * `franchise_entries` is a real table precisely so franchise order can
--     never be inferred from title-string similarity — every row needs a
--     `source_url` and a `confidence`, same discipline as case facts.
--   * `persons.tmdb_person_id` and `tv_programmes.tmdb_id` are bridge
--     columns only. Nothing in this migration populates them; resolving TV
--     schedule content to a real TMDB id (for actor credits and the existing
--     title_dimensions DNA pipeline) is a separate enrichment step, and an
--     imperfect one (title+year search) that must stay disclosed as such.

-- ---------------------------------------------------------------------------
-- Split hallmark-lifetime -> hallmark-universe + lifetime-vault. Rebrand
-- true-crime -> crime-case-files. UPDATEs preserve existing row ids.
-- ---------------------------------------------------------------------------
update public.packs
set slug = 'hallmark-universe',
    display_name = 'Hallmark Universe',
    description = 'Your personal Hallmark command center — tonight''s lineup, your checklist, and franchise order, all in one place.',
    person_tracking = true,
    completion_stats = true
where slug = 'hallmark-lifetime';

insert into public.packs
  (slug, display_name, description, is_premium, sort_order,
   premiere_calendar, case_tracking, person_tracking, franchise_continuity, completion_stats)
values
  ('lifetime-vault', 'Lifetime Movie Vault',
   'Track every thriller, true story, sequel, and remake before they start blending together.',
   false, 2, true, false, true, true, true)
on conflict (slug) do nothing;

update public.packs
set slug = 'crime-case-files',
    display_name = 'Crime Case Files',
    description = 'Know when you''ve already seen the case — even under a completely different title.',
    sort_order = 3,
    person_tracking = false
where slug = 'true-crime';

-- ---------------------------------------------------------------------------
-- Sourced case facts — victim(s)/suspect(s)/legal status, precisely typed.
-- ---------------------------------------------------------------------------
alter table public.cases add column if not exists location text;
alter table public.cases add column if not exists incident_date date;
-- A short, honest one-line summary shown on the case card. Deliberately
-- free text rather than a computed rollup of case_subjects, so it can say
-- "Not yet documented" instead of an empty/misleading blank.
alter table public.cases add column if not exists status_summary text;

create table if not exists public.case_subjects (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases(id) on delete cascade,
  full_name    text not null,
  -- Role at the time of the case. NOT the eventual outcome — see `outcome`.
  role         text not null check (role in (
                 'victim', 'person_of_interest', 'suspect', 'charged',
                 'defendant', 'convicted', 'acquitted', 'exonerated',
                 'witness', 'other'
               )),
  -- Free text, e.g. "Convicted of second-degree murder, 2019 — sentence
  -- under appeal." Only ever set from a cited source; never inferred.
  outcome      text,
  source_url   text,
  confidence   text not null default 'unconfirmed' check (confidence in ('verified', 'reported', 'unconfirmed')),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists case_subjects_case_idx on public.case_subjects (case_id, sort_order);

create table if not exists public.case_timeline_events (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases(id) on delete cascade,
  event_type   text not null check (event_type in (
                 'incident', 'investigation', 'arrest', 'charges', 'trial',
                 'verdict', 'sentencing', 'appeal', 'development'
               )),
  -- Nullable: a real, sourced development can predate a known exact date.
  event_date   date,
  headline     text not null,
  detail       text,
  source_url   text,
  confidence   text not null default 'unconfirmed' check (confidence in ('verified', 'reported', 'unconfirmed')),
  disputed     boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists case_timeline_case_idx on public.case_timeline_events (case_id, sort_order);

-- ---------------------------------------------------------------------------
-- Verified franchise relationships — a real table so viewing order can never
-- be inferred from title-string similarity (explicitly forbidden). Keys on
-- EITHER a tv_programmes row (schedule content) or a bare TMDB id (catalog
-- content not in the schedule pipeline) — a franchise entry doesn't require
-- both.
-- ---------------------------------------------------------------------------
create table if not exists public.franchise_entries (
  id               uuid primary key default gen_random_uuid(),
  -- Matches tv_programmes.franchise (0036) — free text, same identity space.
  franchise        text not null,
  programme_id     uuid references public.tv_programmes(id) on delete cascade,
  tmdb_id          integer,
  tmdb_media_type  text check (tmdb_media_type in ('movie', 'tv')),
  title            text not null,
  -- Viewing-order position. Null means "known member, order not yet verified".
  sequence_number  integer,
  connection       text not null default 'unknown' check (connection in (
                     'direct_sequel', 'shared_universe', 'standalone_same_franchise', 'unknown'
                   )),
  source_url       text,
  confidence       text not null default 'unconfirmed' check (confidence in ('verified', 'reported', 'unconfirmed')),
  created_at       timestamptz not null default now(),
  constraint franchise_entries_subject check (programme_id is not null or tmdb_id is not null)
);

create index if not exists franchise_entries_franchise_idx on public.franchise_entries (franchise, sequence_number);

-- ---------------------------------------------------------------------------
-- TMDB bridges. Structure only — nothing here populates these columns.
-- Resolving schedule content to a real TMDB id is a separate, imperfect
-- (title+year search) enrichment step that must stay disclosed as such.
-- ---------------------------------------------------------------------------
alter table public.persons add column if not exists tmdb_person_id integer;

create unique index if not exists persons_tmdb_person_id_idx
  on public.persons (tmdb_person_id) where tmdb_person_id is not null;

alter table public.tv_programmes add column if not exists tmdb_id integer;
alter table public.tv_programmes add column if not exists tmdb_media_type text check (tmdb_media_type in ('movie', 'tv'));

create index if not exists tv_programmes_tmdb_idx
  on public.tv_programmes (tmdb_id, tmdb_media_type) where tmdb_id is not null;

-- ---------------------------------------------------------------------------
-- RLS — same world-readable, service-role-write pattern as every other Pack
-- catalog table (0036).
-- ---------------------------------------------------------------------------
alter table public.case_subjects        enable row level security;
alter table public.case_timeline_events enable row level security;
alter table public.franchise_entries    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['case_subjects', 'case_timeline_events', 'franchise_entries'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_read', t);
  end loop;
end $$;

comment on table public.case_subjects is
  'Sourced people connected to a Case. `role` is the role AT THE TIME (suspect/charged/defendant); `outcome` is the eventual, separately-sourced result. Never collapse the two.';
comment on table public.case_timeline_events is
  'A sourced, dated (or honestly undated) event in a Case''s real-world timeline. `disputed` marks contested claims rather than omitting or asserting them.';
comment on table public.franchise_entries is
  'Verified franchise membership + viewing order, each row individually sourced. Never populated by title-string inference.';
