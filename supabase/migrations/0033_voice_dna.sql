-- WatchVerd1ct — Verd1ct Voice DNA.
--
-- Stores taste interviews as an append-only transcript plus the claims derived
-- from it. The claims are kept alongside the answers rather than only in the
-- user's DNA because the whole feature rests on being able to show someone
-- exactly which sentence of theirs produced which belief — and to drop one
-- claim and rebuild without re-interviewing them.
--
-- Nothing here reaches the recommender until `applied_at` is set: that column
-- IS the mandatory-review gate, in the database rather than only in the UI.
--
-- Idempotent.

create table if not exists public.voice_dna_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'quick' check (mode in ('quick', 'full')),
  stage text not null default 'interview' check (stage in ('interview', 'review', 'applied')),
  -- The transcript: [{ questionId, value, at }]
  answers jsonb not null default '[]'::jsonb,
  -- Derived beliefs, each carrying the verbatim span it came from.
  claims jsonb not null default '[]'::jsonb,
  -- Question ids already put to the user, so the adaptive engine never repeats.
  asked jsonb not null default '[]'::jsonb,
  -- Was this typed or spoken? Recorded so evidence quality stays traceable.
  input_mode text not null default 'typed' check (input_mode in ('typed', 'voice')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Null until the user has reviewed and confirmed. The gate.
  applied_at timestamptz
);

create index if not exists voice_dna_sessions_user_idx
  on public.voice_dna_sessions (user_id, updated_at desc);

alter table public.voice_dna_sessions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voice_dna_sessions'
      and policyname = 'voice_dna_sessions_own_select'
  ) then
    create policy voice_dna_sessions_own_select on public.voice_dna_sessions
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voice_dna_sessions'
      and policyname = 'voice_dna_sessions_own_insert'
  ) then
    create policy voice_dna_sessions_own_insert on public.voice_dna_sessions
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voice_dna_sessions'
      and policyname = 'voice_dna_sessions_own_update'
  ) then
    create policy voice_dna_sessions_own_update on public.voice_dna_sessions
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  -- Deletion has to be the user's own, unconditional right: the privacy copy on
  -- the interview screen promises it.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voice_dna_sessions'
      and policyname = 'voice_dna_sessions_own_delete'
  ) then
    create policy voice_dna_sessions_own_delete on public.voice_dna_sessions
      for delete using (auth.uid() = user_id);
  end if;
end $$;
