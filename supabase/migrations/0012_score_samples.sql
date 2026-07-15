-- ---------------------------------------------------------------------
-- score_samples — training rows for the Standard Score calibration brain.
-- Each row snapshots the rating-source readings for a title at the moment a
-- user rated it, paired with that rating. The offline calibrator (admin-only,
-- service role) fits the source weights to these; inference stays deterministic.
-- ---------------------------------------------------------------------
create table if not exists public.score_samples (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tmdb_id     bigint not null,
  media_type  text not null check (media_type in ('movie','tv')),
  readings    jsonb not null default '[]',  -- [{key,value,sampleSize}]
  rating      integer not null check (rating between 1 and 10),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);

create index if not exists idx_score_samples_created on public.score_samples(created_at desc);

alter table public.score_samples enable row level security;

-- Users manage only their own rows. Cross-user reads for calibration happen
-- through the service-role key (admin only), which bypasses RLS.
drop policy if exists score_samples_select_own on public.score_samples;
create policy score_samples_select_own on public.score_samples
  for select using (user_id = auth.uid());

drop policy if exists score_samples_insert_own on public.score_samples;
create policy score_samples_insert_own on public.score_samples
  for insert with check (user_id = auth.uid());

drop policy if exists score_samples_update_own on public.score_samples;
create policy score_samples_update_own on public.score_samples
  for update using (user_id = auth.uid());

drop trigger if exists score_samples_updated_at on public.score_samples;
create trigger score_samples_updated_at
  before update on public.score_samples
  for each row execute function public.set_updated_at();
