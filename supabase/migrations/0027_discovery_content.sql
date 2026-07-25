-- WatchVerd1ct — Public Discovery Platform: editorial overrides.
--
-- ADDITIVE ONLY. Creates one new table; touches nothing that exists. Editorial
-- content ships as typed source (so the platform works with an empty database);
-- this table stores CMS overrides on top, keyed by page kind + slug, so an
-- editor can change copy and publication state without a code change.
--
-- No second title database: title facts stay in the canonical records + build
-- cache. This holds editorial text and workflow state only.

create table if not exists public.discovery_overrides (
  id           uuid primary key default gen_random_uuid(),
  page_kind    text not null check (page_kind in ('movie','show','compare','for','discover','guide')),
  slug         text not null,
  -- Any subset of the editable fields; null means "use the source value".
  seo_title    text,
  description  text,
  heading      text,
  standfirst   text,
  status       text check (status in ('draft','needs_review','published','noindex','retired')),
  publish_at   timestamptz,
  sections     jsonb,
  faq          jsonb,
  related      jsonb,
  noindex_reason    text,
  retirement_reason text,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  unique (page_kind, slug)
);

create index if not exists idx_discovery_overrides_kind on public.discovery_overrides(page_kind);

-- Revision history — every save is appended, never overwritten.
create table if not exists public.discovery_revisions (
  id         uuid primary key default gen_random_uuid(),
  page_kind  text not null,
  slug       text not null,
  payload    jsonb not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_discovery_revisions_page on public.discovery_revisions(page_kind, slug, created_at desc);

alter table public.discovery_overrides enable row level security;
alter table public.discovery_revisions enable row level security;

-- Public READ of overrides is required so published pages render for anonymous
-- visitors. Writes are service-role only (the admin server action), so no user
-- can publish content by calling the API directly.
drop policy if exists discovery_overrides_public_read on public.discovery_overrides;
create policy discovery_overrides_public_read
  on public.discovery_overrides for select
  to anon, authenticated
  using (true);

-- Revisions are internal: no anon/authenticated policy at all.
