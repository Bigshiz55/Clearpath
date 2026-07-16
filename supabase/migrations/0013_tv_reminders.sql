-- Live-TV reminders: a user asks to be pinged before a broadcast starts. A cron
-- (/api/cron/tv-reminders) sends a web push 60 minutes and 5 minutes before the
-- airtime. RLS-scoped to the owner; the cron reads with the service-role client.

create table if not exists public.tv_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  airing_id bigint not null,          -- TVmaze episode id (unique per airing)
  show_name text not null,
  network text,
  airstamp timestamptz not null,      -- broadcast start (UTC)
  url text,
  notify_60 boolean not null default false,
  notify_5 boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, airing_id)
);

alter table public.tv_reminders enable row level security;

drop policy if exists "own tv reminders" on public.tv_reminders;
create policy "own tv reminders" on public.tv_reminders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The cron scans by due time; index it.
create index if not exists tv_reminders_airstamp_idx on public.tv_reminders (airstamp);
