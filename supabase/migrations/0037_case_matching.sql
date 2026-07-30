-- 0037 — Case identification and matching pipeline for the true crime Pack.
--
-- Scoped strictly to episode identity, not the real ingest identity space:
-- every table here keys episodes by their real, stable TVmaze episode id
-- (`tvmaze_episode_id`), NOT `tv_programmes.id`. This phase's fixtures are
-- real TVmaze episode data (never invented) but are not run through any
-- ingest job — that stays out of scope — so no `tv_programmes` rows exist
-- for them. The `cases` table from migration 0036 is reused UNCHANGED as the
-- target of an approved match; `case_match_episodes` is the pipeline's own
-- bridge from a Case to the TVmaze episodes that were matched into it, kept
-- separate from `case_programmes` (which is reserved for real ingested
-- programmes) precisely so this migration never has to touch 0036.
--
-- Nothing here auto-merges a Case. Every candidate — however high its
-- confidence — sits in `case_match_candidates` as 'pending' until a human
-- decision (approve/reject) is recorded; see matching.ts for the proposal
-- threshold and reviewQueue.ts for the approve/reject data layer.
--
-- Idempotent (IF NOT EXISTS) so re-running is safe.

-- ---------------------------------------------------------------------------
-- case_match_candidates — the review queue: pending | approved | rejected
-- ---------------------------------------------------------------------------
create table if not exists public.case_match_candidates (
  id             uuid primary key default gen_random_uuid(),
  -- Canonically ordered (episode_a_id < episode_b_id) so a pair has exactly
  -- one row regardless of which episode the matcher visits first.
  episode_a_id   bigint not null,
  episode_b_id   bigint not null,
  confidence     numeric not null check (confidence >= 0 and confidence <= 1),
  reasons        jsonb not null default '[]'::jsonb,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  case_id        uuid references public.cases(id) on delete set null,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  constraint case_match_candidates_pair_order check (episode_a_id < episode_b_id),
  unique (episode_a_id, episode_b_id)
);

-- The read path: "give me the pending queue, most-confident first" and
-- "has this pair already been decided" (so a rejected pair is never
-- re-proposed — the matcher checks this before inserting).
create index if not exists case_match_candidates_status_idx
  on public.case_match_candidates (status, confidence desc);

-- ---------------------------------------------------------------------------
-- case_match_episodes — bridge from an approved match to its Case.
-- Approving a candidate either creates a new Case (neither episode linked
-- yet) or extends an existing one (one side already belongs to a Case).
-- ---------------------------------------------------------------------------
create table if not exists public.case_match_episodes (
  case_id           uuid not null references public.cases(id) on delete cascade,
  tvmaze_episode_id bigint not null,
  created_at        timestamptz not null default now(),
  primary key (case_id, tvmaze_episode_id)
);

create index if not exists case_match_episodes_episode_idx
  on public.case_match_episodes (tvmaze_episode_id);

-- ---------------------------------------------------------------------------
-- case_match_flags — community correction ("same case as X" / "not the same
-- case"). One flag per user per pair (upsert to change your mind). Flags
-- weight the review queue's ordering by agreement count, computed in
-- reviewQueue.ts from this table.
-- ---------------------------------------------------------------------------
create table if not exists public.case_match_flags (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  episode_a_id   bigint not null,
  episode_b_id   bigint not null,
  assertion      text not null check (assertion in ('same', 'different')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint case_match_flags_pair_order check (episode_a_id < episode_b_id),
  unique (user_id, episode_a_id, episode_b_id)
);

create index if not exists case_match_flags_pair_idx
  on public.case_match_flags (episode_a_id, episode_b_id, assertion);

drop trigger if exists case_match_flags_updated_at on public.case_match_flags;
create trigger case_match_flags_updated_at
  before update on public.case_match_flags
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.case_match_candidates enable row level security;
alter table public.case_match_episodes   enable row level security;
alter table public.case_match_flags      enable row level security;

-- case_match_candidates / case_match_episodes are moderation/pipeline state,
-- not user data, and this phase ships no UI for them — same posture as the
-- 0032 tv_ingestion_runs / tv_call_ledger tables: RLS enabled, no select
-- policy, so only the service role (the batch job, the review-queue data
-- layer using the admin client) can read or write them.

-- case_match_flags: a user manages only their own flag.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'case_match_flags' and policyname = 'case_match_flags_own_select'
  ) then
    create policy case_match_flags_own_select on public.case_match_flags
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'case_match_flags' and policyname = 'case_match_flags_own_insert'
  ) then
    create policy case_match_flags_own_insert on public.case_match_flags
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'case_match_flags' and policyname = 'case_match_flags_own_update'
  ) then
    create policy case_match_flags_own_update on public.case_match_flags
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

comment on table public.case_match_candidates is
  'Review queue for proposed Case matches. Nothing auto-merges — every row requires an approve/reject decision (reviewQueue.ts).';
comment on table public.case_match_episodes is
  'Bridge from an approved match to its Case, keyed by tvmaze_episode_id — not case_programmes, which stays reserved for real ingested tv_programmes rows.';
comment on table public.case_match_flags is
  'Community correction: a user asserting two episodes are/are not the same Case. Aggregated agreement counts weight the review queue ordering.';
