-- WatchVerd1ct — Quick Taste Quiz provenance.
--
-- One row per ANSWER, not per belief. The DNA itself already lives in
-- `preference_events` (there is exactly one model of the user, and this is not
-- a second one); what is kept here is the audit trail that makes a DNA line
-- explainable and a correction possible:
--
--   which question, in which version of the bank, answered how, priced at what,
--   narrowed by which conditions, producing which claim ids, and when.
--
-- Append-only. A correction is a NEW row with a higher `revision`, never an
-- update of the old one — otherwise "why does it think this?" loses its answer
-- the moment someone changes their mind.
--
-- Idempotent.

create table if not exists public.taste_quiz_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  -- The bank version the question came from. Answers from an older bank stay
  -- readable and are never silently re-interpreted under new wording.
  bank_version text not null,
  section text not null,
  question_type text not null check (question_type in ('attribute', 'tradeoff', 'tolerance')),
  response text not null check (response in ('exactly', 'mostly', 'depends', 'not_me')),
  -- The signed weight the response was priced at, recorded so a later change to
  -- the price list cannot rewrite history.
  response_weight numeric not null,
  -- Chip ids picked on "Depends", and the condition text each one carries.
  chips jsonb not null default '[]'::jsonb,
  conditions jsonb not null default '[]'::jsonb,
  -- [{ key, polarity, weight }] — exactly what this answer moved.
  attributes jsonb not null default '[]'::jsonb,
  -- Only ever true because the user picked a chip that says so.
  hard_exclusion boolean not null default false,
  confidence numeric not null default 0,
  durability text not null default 'durable' check (durability in ('durable', 'temporary', 'unknown')),
  -- 0 for the first answer to this question, 1 for the first correction, …
  revision integer not null default 0,
  claim_ids jsonb not null default '[]'::jsonb,
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists taste_quiz_answers_user_idx
  on public.taste_quiz_answers (user_id, answered_at desc);

create index if not exists taste_quiz_answers_question_idx
  on public.taste_quiz_answers (user_id, question_id, revision desc);

alter table public.taste_quiz_answers enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'taste_quiz_answers'
      and policyname = 'taste_quiz_answers_own_select'
  ) then
    create policy taste_quiz_answers_own_select on public.taste_quiz_answers
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'taste_quiz_answers'
      and policyname = 'taste_quiz_answers_own_insert'
  ) then
    create policy taste_quiz_answers_own_insert on public.taste_quiz_answers
      for insert with check (auth.uid() = user_id);
  end if;

  -- No update policy: the log is append-only by construction, not by
  -- convention. Corrections arrive as new rows.

  -- Deletion is the user's own unconditional right — the quiz says the answers
  -- are theirs, so the database has to mean it.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'taste_quiz_answers'
      and policyname = 'taste_quiz_answers_own_delete'
  ) then
    create policy taste_quiz_answers_own_delete on public.taste_quiz_answers
      for delete using (auth.uid() = user_id);
  end if;
end $$;
