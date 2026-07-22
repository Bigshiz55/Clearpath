-- 0020_recommendation_feedback.sql
-- Structured "why did you pass?" feedback on recommendation cards, plus a
-- lightweight analytics event stream. This is the decision-data that powers
-- "WatchVerdict doesn't just learn what you choose. It learns WHY."
--
-- One current row per (user, title): a changed response supersedes the prior
-- one in place (updated_at moves), with the full history preserved in
-- recommendation_feedback_events.

create table if not exists public.recommendation_feedback (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  tmdb_id                   bigint not null,
  media_type                text not null check (media_type in ('movie','tv')),
  feedback_type             text not null check (feedback_type in ('seen','not_right_now','not_for_me','didnt_like','removed_without_reason')),
  rating_1_to_10            int check (rating_1_to_10 between 1 and 10),
  watched                   boolean not null default false,
  temporary_signal          boolean not null default false,
  selected_reason_codes     text[] not null default '{}',
  free_text_reason          text,
  recommendation_session_id text,
  recommendation_source     text,
  recommendation_position   int,
  match_score               int,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);
create index if not exists idx_recfeedback_user on public.recommendation_feedback(user_id);
create index if not exists idx_recfeedback_title on public.recommendation_feedback(media_type, tmdb_id);

alter table public.recommendation_feedback enable row level security;
drop policy if exists recfeedback_select_own on public.recommendation_feedback;
create policy recfeedback_select_own on public.recommendation_feedback for select using (user_id = auth.uid());
drop policy if exists recfeedback_insert_own on public.recommendation_feedback;
create policy recfeedback_insert_own on public.recommendation_feedback for insert with check (user_id = auth.uid());
drop policy if exists recfeedback_update_own on public.recommendation_feedback;
create policy recfeedback_update_own on public.recommendation_feedback for update using (user_id = auth.uid());
drop policy if exists recfeedback_delete_own on public.recommendation_feedback;
create policy recfeedback_delete_own on public.recommendation_feedback for delete using (user_id = auth.uid());

-- Append-only history so a superseded response stays traceable.
create table if not exists public.recommendation_feedback_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  tmdb_id       bigint not null,
  media_type    text not null,
  feedback_type text not null,
  payload       jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists idx_recfeedback_events_user on public.recommendation_feedback_events(user_id, created_at desc);
alter table public.recommendation_feedback_events enable row level security;
drop policy if exists recfeedback_events_select_own on public.recommendation_feedback_events;
create policy recfeedback_events_select_own on public.recommendation_feedback_events for select using (user_id = auth.uid());
drop policy if exists recfeedback_events_insert_own on public.recommendation_feedback_events;
create policy recfeedback_events_insert_own on public.recommendation_feedback_events for insert with check (user_id = auth.uid());

-- Lightweight product analytics — no PII in the payload, just interaction shape.
create table if not exists public.analytics_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  name       text not null,
  props      jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_analytics_name on public.analytics_events(name, created_at desc);
alter table public.analytics_events enable row level security;
drop policy if exists analytics_insert_own on public.analytics_events;
create policy analytics_insert_own on public.analytics_events for insert with check (user_id = auth.uid() or user_id is null);
