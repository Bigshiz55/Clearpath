-- 0009_feedback.sql
-- The post-watch interview: a few honest answers after you finish or abandon a
-- title. This is proprietary, user-generated signal that powers the Taste Brain
-- and (aggregated) an honest Content DNA — data no scraper can copy.

create table if not exists public.title_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tmdb_id     bigint not null,
  media_type  text not null check (media_type in ('movie','tv')),
  disposition text,                       -- 'finished' | 'abandoned' | null
  answers     jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);
create index if not exists idx_feedback_title on public.title_feedback(media_type, tmdb_id);

alter table public.title_feedback enable row level security;

drop policy if exists feedback_select_own on public.title_feedback;
create policy feedback_select_own on public.title_feedback
  for select using (user_id = auth.uid());

drop policy if exists feedback_insert_own on public.title_feedback;
create policy feedback_insert_own on public.title_feedback
  for insert with check (user_id = auth.uid());

drop policy if exists feedback_update_own on public.title_feedback;
create policy feedback_update_own on public.title_feedback
  for update using (user_id = auth.uid());
