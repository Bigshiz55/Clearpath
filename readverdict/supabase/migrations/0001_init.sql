-- ReadVerdict initial schema (Phase 3).
-- Incremental & additive: later phases add migrations, never destructively
-- replace this one. Every user-owned table is RLS-protected. Book catalog data
-- is world-readable (public reference data); user data is private by default.
--
-- Design note: this schema is written to be shareable across the Verdict family
-- (accounts, consent, provenance, taste vectors) while keeping book-specific
-- data (works, editions, reader_dna) in its own tables.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Shared: accounts & consent
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  region       text default 'US',
  ui_language  text default 'en',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists consent_records (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  scope       text not null,          -- 'analytics' | 'personalization' | 'email_receipts' | ...
  granted     boolean not null,
  updated_at  timestamptz not null default now(),
  unique (user_id, scope)
);

-- ---------------------------------------------------------------------------
-- Book catalog (public reference data)
-- ---------------------------------------------------------------------------
create table if not exists works (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  subtitle          text,
  original_title    text,
  original_language text,
  first_publish_year int,
  series_id         uuid,
  series_position   numeric,
  subjects          text[] not null default '{}',
  -- Interpreted Book DNA (numeric axes, moods, tropes, content warnings) with
  -- per-axis salience/confidence, stored as JSONB for schema flexibility.
  book_dna          jsonb not null default '{}'::jsonb,
  identifiers       jsonb not null default '[]'::jsonb,   -- [{scheme,value}]
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists persons (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  alternate_names text[] not null default '{}',
  alt_ids         jsonb not null default '[]'::jsonb
);

create table if not exists work_contributors (
  work_id   uuid not null references works (id) on delete cascade,
  person_id uuid not null references persons (id) on delete cascade,
  role      text not null,      -- 'author' | 'translator' | 'narrator' | ...
  ord       int  not null default 0,
  primary key (work_id, person_id, role)
);

create table if not exists editions (
  id                uuid primary key default gen_random_uuid(),
  work_id           uuid not null references works (id) on delete cascade,
  format            text not null,       -- 'hardcover' | 'ebook' | 'audiobook' | ...
  isbn13            text,
  isbn10            text,
  alt_ids           jsonb not null default '[]'::jsonb,
  language          text,
  region            text,
  -- Sourced attributes carry {value,status,confidence,provenance,conflicts}.
  publisher         jsonb,
  published_date    jsonb,
  page_count        jsonb,
  audio_duration_min jsonb,
  narrators         text[] not null default '{}',
  cover_url         text,
  rating            jsonb,
  availability      jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists editions_isbn13_uniq on editions (isbn13) where isbn13 is not null;
create index if not exists editions_work_idx on editions (work_id);

-- ---------------------------------------------------------------------------
-- Reader DNA (private per user)
-- ---------------------------------------------------------------------------
create table if not exists reader_dna (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  -- Map of dimension_key -> {value,confidence,evidenceCount,supporting,...}.
  dimensions  jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- User library, imports, appeals, feedback
-- ---------------------------------------------------------------------------
create table if not exists user_books (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  work_id      uuid references works (id) on delete set null,
  edition_id   uuid references editions (id) on delete set null,
  status       text not null,            -- 'saved'|'interested'|'reading'|'finished'|'dnf'|'paused'|'reread'
  rating       numeric,                  -- user's 0..5 rating
  dnf_reason   text,
  dnf_page     int,
  started_at   timestamptz,
  finished_at  timestamptz,
  notes        text,
  provenance   jsonb not null default '{}'::jsonb,   -- how this row was created
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists user_books_user_idx on user_books (user_id);

create table if not exists imports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         text not null,            -- 'goodreads_csv'|'storygraph_csv'|'generic_csv'|'isbn_list'|'title_list'|'screenshot'
  status       text not null default 'pending',  -- 'pending'|'previewing'|'committed'|'failed'|'undone'
  raw_rows     jsonb not null default '[]'::jsonb,  -- original uploaded rows, preserved
  summary      jsonb not null default '{}'::jsonb,
  file_expires_at timestamptz,           -- uploads are not retained indefinitely
  created_at   timestamptz not null default now()
);
create index if not exists imports_user_idx on imports (user_id);

create table if not exists appeals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  user_book_id uuid references user_books (id) on delete cascade,
  progress_pct numeric,
  page         int,
  reason       text,
  decision     text,                     -- 'continue'|'switch_audio'|'pause'|'dismiss'|...
  verdict_was_accurate boolean,
  created_at   timestamptz not null default now()
);

create table if not exists feedback_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  event_name   text not null,
  event_version int not null default 1,
  props        jsonb not null default '{}'::jsonb,
  consent_state jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists feedback_events_user_idx on feedback_events (user_id);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table profiles          enable row level security;
alter table consent_records   enable row level security;
alter table reader_dna        enable row level security;
alter table user_books        enable row level security;
alter table imports           enable row level security;
alter table appeals           enable row level security;
alter table feedback_events   enable row level security;

-- Owner-only policies for every user-owned table.
do $$
declare t text;
begin
  foreach t in array array['profiles','consent_records','reader_dna','user_books','imports','appeals','feedback_events']
  loop
    execute format($f$
      create policy %1$s_select on %1$s for select using (
        (%1$s.user_id = auth.uid()) or (%1$s.%2$s = auth.uid())
      );
    $f$, t, case when t = 'profiles' then 'id' else 'user_id' end);
  exception when duplicate_object then null;
  end loop;
end $$;

-- Catalog tables are world-readable reference data; writes are service-role only.
alter table works              enable row level security;
alter table editions           enable row level security;
alter table persons            enable row level security;
alter table work_contributors  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['works','editions','persons','work_contributors']
  loop
    execute format('create policy %1$s_public_read on %1$s for select using (true);', t);
  exception when duplicate_object then null;
  end loop;
end $$;
