-- WatchVerdict — AI content fingerprint. Every title gets classified once across
-- ~18 interpretable taste axes (pacing, darkness, gore, dialogue, …). This is
-- global, user-agnostic content metadata: computed by the server (service role),
-- readable by everyone. Cached forever — a title's fingerprint doesn't change.

create table if not exists public.title_dimensions (
  tmdb_id    bigint not null,
  media_type text not null check (media_type in ('movie','tv')),
  dims       jsonb not null,     -- { pacing:0..100, darkness:0..100, ... }
  model      text,               -- classifier model id, for future re-scoring
  created_at timestamptz not null default now(),
  primary key (tmdb_id, media_type)
);

alter table public.title_dimensions enable row level security;

-- Content metadata, not user data: any signed-in user may read it. Writes are
-- service-role only (the classifier), so no write policy is defined.
drop policy if exists title_dimensions_select on public.title_dimensions;
create policy title_dimensions_select on public.title_dimensions
  for select using (true);
