-- ═══════════════════════════════════════════════════════════════════════════
-- 0047 — DECISION RUNS: graph-native execution provenance (Phase 2).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- One row per user-triggered decision (an /api/ask execution, a State Your
-- Case submission). The row IS the run's evidence graph: the raw utterance,
-- the classification, the constraint/candidate/outcome/write edges the route
-- actually computed — captured at execution time, never reconstructed.
-- jsonb-first by design (the graph model owns semantics; relational
-- projections come later if they earn their keep).
--
-- PRIVACY / RETENTION: raw_text is the user's own phrasing. Rows are
-- debugging truth, not analytics — owner-scoped by RLS, no cross-user read,
-- and prunable: nothing derives durable state from this table, so deleting
-- old rows loses only inspectability. A scheduled 90-day cleanup is the
-- intended policy (documented in docs/architecture/GRAPH_NATIVE_WATCHVERDICT.md);
-- enforcement lands with the ops cron, not this migration.
--
-- Additive only; safe on a live database. Rollback: 0047 in rollback/.

create table if not exists public.decision_runs (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_point text not null check (entry_point in ('build-case', 'ask', 'search', 'finder', 'watch-now', 'tv', 'browse')),
  raw_text text not null,
  intent_kind text not null,
  persistence text not null check (persistence in ('durable', 'session', 'request_only')),
  edges jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.decision_runs is
  'Graph-native execution evidence: one row per user-triggered decision, edges captured from the route''s own state.';

create index if not exists decision_runs_user_created_idx
  on public.decision_runs (user_id, created_at desc);

alter table public.decision_runs enable row level security;

-- Owner-only. Runs are personal debugging truth; inserts come from the
-- user's own authenticated request. No update/delete policies: a run is
-- immutable evidence (retention pruning runs as service_role).
create policy decision_runs_select_own on public.decision_runs
  for select using (auth.uid() = user_id);
create policy decision_runs_insert_own on public.decision_runs
  for insert with check (auth.uid() = user_id);
create policy decision_runs_service_all on public.decision_runs
  for all to service_role using (true) with check (true);
