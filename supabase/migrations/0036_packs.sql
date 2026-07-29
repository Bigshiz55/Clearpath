-- 0036 — Pack data model: shared schema for the Hallmark & Lifetime Pack and
-- the true crime Pack (and any Pack added after).
--
-- Design notes that matter:
--   * Pack is a plain data row with a fixed set of feature-flag booleans.
--     Turning a feature on for a Pack is an UPDATE, not a code change, and no
--     application code should ever branch on `packs.slug`.
--   * Station membership is many-to-many (`pack_stations`) on top of the
--     existing 0032 `tv_stations` table — a station is not owned by a Pack,
--     so the same station (e.g. Lifetime) can sit in two Packs with one row
--     per pairing, never a duplicated station.
--   * Premiere semantics build on what 0032 already tracks: `tv_airings`
--     already has `is_premiere` (see tvmazeIngest.ts). This migration adds
--     `tv_programmes.premiere_date`, kept in sync by a trigger (declarative,
--     not an ingest job) so a premiere calendar is one indexed date-range
--     query away, scoped to a Pack purely by joining through
--     pack_stations — no Pack-specific logic anywhere in application code.
--   * Case identity is keyed on `tv_programmes.id`, which is itself keyed on
--     (provider_id, provider_programme_id) — not on title. A provider that
--     retitles the same real-world broadcast updates that programme row's
--     `title` in place; the programme's row identity, and therefore its
--     `case_programmes` membership, never changes. `case_aliases` records the
--     alternate titles a programme has aired under as queryable history (and
--     as the place a different provider's row for the same content can later
--     be linked); it does not itself carry the Case relationship.
--   * Person is one shared table with a free-text `role`, not an enum split
--     by Pack — a Hallmark actor and a true-crime correspondent are the same
--     shape (a person credited on a programme) with different vocabularies.
--   * UserSeen is polymorphic (`subject_type` programme|case). Marking a Case
--     seen is a single row; "does that make programme X seen" is answered by
--     `user_seen_programmes`, which unions direct programme marks with every
--     programme implied by a seen Case. Marking a programme seen never writes
--     a case-scoped row, so the reverse implication never holds.
--   * UserTracking is one table for all four subscription types. Person,
--     Case, and Pack subscriptions carry a `subject_uuid` (their own primary
--     key); franchise has no uuid-keyed entity of its own, so it carries a
--     `subject_text` matched against the new `tv_programmes.franchise`
--     column (kept as a separate text field, deliberately not touching
--     `catalog_titles.franchise` — a different identity space with no
--     existing bridge to TV schedule data). `user_tracking_matches` resolves
--     all four types to matching airings in one view.
--
-- Every table and index is idempotent (IF NOT EXISTS) so re-running is safe.

-- ---------------------------------------------------------------------------
-- packs
-- ---------------------------------------------------------------------------
create table if not exists public.packs (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  display_name          text not null,
  description           text,
  is_premium            boolean not null default false,
  sort_order            integer not null default 0,
  -- Feature flags. Enabling one is a data operation (UPDATE), never a code
  -- change.
  premiere_calendar     boolean not null default false,
  case_tracking         boolean not null default false,
  person_tracking       boolean not null default false,
  franchise_continuity  boolean not null default false,
  completion_stats      boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint packs_slug_format check (slug ~ '^[a-z0-9-]{2,60}$')
);

create index if not exists packs_sort_order_idx on public.packs (sort_order);

drop trigger if exists packs_updated_at on public.packs;
create trigger packs_updated_at
  before update on public.packs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- pack_stations — many-to-many, built on the 0032 tv_stations table
-- ---------------------------------------------------------------------------
create table if not exists public.pack_stations (
  pack_id     uuid not null references public.packs(id) on delete cascade,
  station_id  uuid not null references public.tv_stations(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (pack_id, station_id)
);

create index if not exists pack_stations_station_idx on public.pack_stations (station_id);

-- ---------------------------------------------------------------------------
-- premiere semantics — tv_airings.is_premiere already exists (0032 +
-- tvmazeIngest.ts). Add the programme-level date and keep it in sync.
-- ---------------------------------------------------------------------------
alter table public.tv_programmes add column if not exists premiere_date date;

create index if not exists tv_programmes_premiere_date_idx
  on public.tv_programmes (premiere_date) where premiere_date is not null;

create or replace function public.tv_airings_sync_premiere_date()
returns trigger language plpgsql as $$
declare
  earliest date;
begin
  select min(a.start_at_utc)::date into earliest
  from public.tv_airings a
  where a.programme_id = new.programme_id and a.is_premiere = true;

  update public.tv_programmes
  set premiere_date = earliest
  where id = new.programme_id and premiere_date is distinct from earliest;

  return new;
end;
$$;

drop trigger if exists tv_airings_premiere_sync on public.tv_airings;
create trigger tv_airings_premiere_sync
  after insert or update of is_premiere, start_at_utc on public.tv_airings
  for each row execute function public.tv_airings_sync_premiere_date();

-- Premiere calendar, scoped to Pack purely by the pack_stations join. The
-- data access layer filters this view by pack_id and a date range; no Pack
-- identity or branching exists anywhere else.
create or replace view public.pack_premiere_calendar as
select
  ps.pack_id,
  p.id as programme_id,
  p.title,
  p.premiere_date,
  a.id as airing_id,
  a.station_id,
  a.start_at_utc
from public.tv_programmes p
join public.tv_airings a on a.programme_id = p.id and a.is_premiere = true
join public.tv_stations st on st.id = a.station_id
join public.pack_stations ps on ps.station_id = st.id
where p.premiere_date is not null;

comment on view public.pack_premiere_calendar is
  'Premiere calendar scoped to a Pack by joining through pack_stations only. Filter by pack_id and premiere_date — no Pack-specific application code required.';

-- ---------------------------------------------------------------------------
-- franchise — text, deliberately parallel to (not joined with)
-- catalog_titles.franchise. TV schedule programmes and the TMDB catalog are
-- different identity spaces with no existing bridge; do not add one here.
-- ---------------------------------------------------------------------------
alter table public.tv_programmes add column if not exists franchise text;

create index if not exists tv_programmes_franchise_idx
  on public.tv_programmes (franchise) where franchise is not null;

-- ---------------------------------------------------------------------------
-- cases, case_programmes, case_aliases
-- ---------------------------------------------------------------------------
create table if not exists public.cases (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint cases_slug_format check (slug ~ '^[a-z0-9-]{2,80}$')
);

drop trigger if exists cases_updated_at on public.cases;
create trigger cases_updated_at
  before update on public.cases
  for each row execute function public.set_updated_at();

create table if not exists public.case_programmes (
  case_id      uuid not null references public.cases(id) on delete cascade,
  programme_id uuid not null references public.tv_programmes(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (case_id, programme_id)
);

create index if not exists case_programmes_programme_idx on public.case_programmes (programme_id);

-- Alternate titles the SAME programme row has aired under. See the migration
-- header for why this is what makes a retitled airing resolve to the same
-- Case (programme identity doesn't change on a retitle; this table doesn't
-- carry Case membership, `case_programmes` does).
create table if not exists public.case_aliases (
  id           uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.tv_programmes(id) on delete cascade,
  alias_title  text not null,
  created_at   timestamptz not null default now(),
  unique (programme_id, alias_title)
);

create index if not exists case_aliases_programme_idx on public.case_aliases (programme_id);

-- ---------------------------------------------------------------------------
-- persons, person_programmes — one shared table for every Pack's person
-- tracking (Hallmark actors, true-crime correspondents, ...).
-- ---------------------------------------------------------------------------
create table if not exists public.persons (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  full_name   text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint persons_slug_format check (slug ~ '^[a-z0-9-]{2,80}$')
);

drop trigger if exists persons_updated_at on public.persons;
create trigger persons_updated_at
  before update on public.persons
  for each row execute function public.set_updated_at();

create table if not exists public.person_programmes (
  person_id    uuid not null references public.persons(id) on delete cascade,
  programme_id uuid not null references public.tv_programmes(id) on delete cascade,
  -- Free text, not an enum: different Packs use different vocabularies for
  -- the same shape (a person credited on a programme).
  role         text not null,
  created_at   timestamptz not null default now(),
  primary key (person_id, programme_id, role)
);

create index if not exists person_programmes_programme_idx on public.person_programmes (programme_id);

-- ---------------------------------------------------------------------------
-- user_seen — polymorphic across programme and Case
-- ---------------------------------------------------------------------------
create table if not exists public.user_seen (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  subject_type text not null check (subject_type in ('programme', 'case')),
  subject_id   uuid not null,
  seen_at      timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (user_id, subject_type, subject_id)
);

create index if not exists user_seen_user_idx on public.user_seen (user_id, subject_type);

alter table public.user_seen enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_seen' and policyname = 'user_seen_own_select'
  ) then
    create policy user_seen_own_select on public.user_seen
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_seen' and policyname = 'user_seen_own_insert'
  ) then
    create policy user_seen_own_insert on public.user_seen
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_seen' and policyname = 'user_seen_own_delete'
  ) then
    create policy user_seen_own_delete on public.user_seen
      for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Effective seen-programme set: direct programme marks, plus every programme
-- implied by a seen Case. The union only runs one direction — a programme
-- mark never joins back to a case-scoped row — so a seen Case implies its
-- programmes are seen, but a seen programme never implies its Case is seen.
create or replace view public.user_seen_programmes as
select user_id, programme_id, min(seen_at) as seen_at
from (
  select us.user_id, p.id as programme_id, us.seen_at
  from public.user_seen us
  join public.tv_programmes p on p.id = us.subject_id
  where us.subject_type = 'programme'
  union all
  select us.user_id, cp.programme_id, us.seen_at
  from public.user_seen us
  join public.case_programmes cp on cp.case_id = us.subject_id
  where us.subject_type = 'case'
) implied
group by user_id, programme_id;

comment on view public.user_seen_programmes is
  'Effective seen-programme set: direct programme marks unioned with every programme implied by a seen Case. One-directional by construction — never the reverse.';

-- ---------------------------------------------------------------------------
-- user_tracking — one table, four subscription types
-- ---------------------------------------------------------------------------
create table if not exists public.user_tracking (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  subscription_type  text not null check (subscription_type in ('person', 'case', 'franchise', 'pack')),
  -- person_id / case_id / pack_id for those three types.
  subject_uuid       uuid,
  -- franchise name for 'franchise' — matched against tv_programmes.franchise.
  subject_text       text,
  created_at         timestamptz not null default now(),
  constraint user_tracking_subject_shape check (
    (subscription_type in ('person', 'case', 'pack') and subject_uuid is not null and subject_text is null)
    or
    (subscription_type = 'franchise' and subject_text is not null and subject_uuid is null)
  )
);

create index if not exists user_tracking_user_idx on public.user_tracking (user_id);

-- Two partial unique indexes rather than one constraint spanning both nullable
-- columns: a plain UNIQUE treats NULLs as distinct, which would let the same
-- person/case/pack subscription be inserted twice (subject_text is always
-- NULL for those rows).
create unique index if not exists user_tracking_uuid_uniq
  on public.user_tracking (user_id, subscription_type, subject_uuid)
  where subject_uuid is not null;

create unique index if not exists user_tracking_text_uniq
  on public.user_tracking (user_id, subscription_type, subject_text)
  where subject_text is not null;

alter table public.user_tracking enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_tracking' and policyname = 'user_tracking_own_select'
  ) then
    create policy user_tracking_own_select on public.user_tracking
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_tracking' and policyname = 'user_tracking_own_insert'
  ) then
    create policy user_tracking_own_insert on public.user_tracking
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_tracking' and policyname = 'user_tracking_own_delete'
  ) then
    create policy user_tracking_own_delete on public.user_tracking
      for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Resolves all four subscription types to matching airings in one place, so
-- no per-type branching is needed in application code.
create or replace view public.user_tracking_matches as
select
  ut.id as tracking_id,
  ut.user_id,
  ut.subscription_type,
  a.id as airing_id,
  a.programme_id,
  a.station_id,
  a.start_at_utc
from public.user_tracking ut
join public.tv_airings a on (
  (ut.subscription_type = 'person' and exists (
    select 1 from public.person_programmes pp
    where pp.person_id = ut.subject_uuid and pp.programme_id = a.programme_id
  ))
  or (ut.subscription_type = 'case' and exists (
    select 1 from public.case_programmes cp
    where cp.case_id = ut.subject_uuid and cp.programme_id = a.programme_id
  ))
  or (ut.subscription_type = 'franchise' and exists (
    select 1 from public.tv_programmes p
    where p.id = a.programme_id and p.franchise = ut.subject_text
  ))
  or (ut.subscription_type = 'pack' and exists (
    select 1 from public.pack_stations ps
    where ps.pack_id = ut.subject_uuid and ps.station_id = a.station_id
  ))
);

comment on view public.user_tracking_matches is
  'Resolves all four UserTracking subscription types (person/case/franchise/pack) to matching tv_airings rows in one view.';

-- ---------------------------------------------------------------------------
-- RLS — Pack/Case/Person catalog data is shared and world-readable, written
-- only by the service role, same pattern as the 0032 tv_* tables.
-- ---------------------------------------------------------------------------
alter table public.packs             enable row level security;
alter table public.pack_stations     enable row level security;
alter table public.cases             enable row level security;
alter table public.case_programmes   enable row level security;
alter table public.case_aliases      enable row level security;
alter table public.persons           enable row level security;
alter table public.person_programmes enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'packs', 'pack_stations', 'cases', 'case_programmes', 'case_aliases', 'persons', 'person_programmes'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_read', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Seed — two Packs, data only, no content. Enabling a feature is the
-- boolean column; nothing here or in application code branches on slug.
-- ---------------------------------------------------------------------------
insert into public.packs
  (slug, display_name, description, is_premium, sort_order,
   premiere_calendar, case_tracking, person_tracking, franchise_continuity, completion_stats)
values
  ('hallmark-lifetime', 'Hallmark & Lifetime',
   'Premiere calendar and cast tracking across Hallmark and Lifetime movies.',
   false, 1, true, false, true, false, false),
  ('true-crime', 'True Crime',
   'Case tracking and completion stats across true crime coverage.',
   false, 2, false, true, false, false, true)
on conflict (slug) do nothing;

comment on table public.packs is
  'A Pack is a themed collection of stations plus a fixed set of feature flags. Enabling a feature is a data operation; application code must never branch on slug.';
comment on table public.case_programmes is
  'Many-to-many: a Case (a real-world subject) links every tv_programmes row that covers it, across any number of networks.';
comment on column public.tv_programmes.premiere_date is
  'Kept in sync by tv_airings_premiere_sync — the earliest date among this programme''s is_premiere=true airings, or null.';
