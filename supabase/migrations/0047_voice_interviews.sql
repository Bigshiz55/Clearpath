-- WatchVerd1ct — Verd1ct Voice DNA Interview session store.
--
-- One row per interview. The full, resumable `InterviewState` (the pure engine's
-- single source of truth) is kept verbatim in `state` jsonb so a session can be
-- resumed exactly where it left off; `status` and `overall_confidence` are
-- mirrored into their own columns purely so the resume query and any founder
-- diagnostics can filter/sort without cracking the JSON open.
--
-- NOTE ON THE PRIMARY KEY: `id` is TEXT, not uuid. The conversation engine mints
-- its own stable id (`interview:<userId>:<startedAtMs>`) inside the state, and
-- that same string is what the client hands back on every turn. Keeping the row
-- PK identical to `state.id` means one id space, no mapping table, and an upsert
-- that round-trips the engine's own value untouched.
--
-- This is a fresh table; migration 0033 (voice_dna_sessions) is a DIFFERENT,
-- retired design that was never applied and is deliberately excluded — this does
-- not touch it.
--
-- RLS: a user may only ever read or write their OWN interview rows (mirrors the
-- per-user policies on taste_quiz_answers / preference tables). Deletion is the
-- user's own unconditional right.
--
-- Idempotent.

create table if not exists public.voice_interviews (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'complete', 'abandoned')),
  -- The full InterviewState, verbatim. The engine owns its shape; the DB just
  -- stores it.
  state jsonb not null default '{}'::jsonb,
  -- Mirrored from the JSON so the resume query can sort/filter cheaply.
  overall_confidence numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- "Most recent active interview for this user" — the resume lookup.
create index if not exists voice_interviews_user_active_idx
  on public.voice_interviews (user_id, status, updated_at desc);

alter table public.voice_interviews enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voice_interviews'
      and policyname = 'voice_interviews_own_select'
  ) then
    create policy voice_interviews_own_select on public.voice_interviews
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voice_interviews'
      and policyname = 'voice_interviews_own_insert'
  ) then
    create policy voice_interviews_own_insert on public.voice_interviews
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voice_interviews'
      and policyname = 'voice_interviews_own_update'
  ) then
    create policy voice_interviews_own_update on public.voice_interviews
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  -- The interview transcript is the user's own words — deletion is their right.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voice_interviews'
      and policyname = 'voice_interviews_own_delete'
  ) then
    create policy voice_interviews_own_delete on public.voice_interviews
      for delete using (auth.uid() = user_id);
  end if;
end $$;
