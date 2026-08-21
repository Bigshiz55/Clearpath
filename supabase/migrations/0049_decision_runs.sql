-- ═══════════════════════════════════════════════════════════════════════════
-- 0049 — DECISION RUNS: graph-native execution provenance (Phase 2).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- IDENTITY NOTE: this migration was originally authored as 0047_decision_runs
-- and was NEVER applied anywhere under that name. The number 0047 is already
-- taken twice over in the production CLI ledger (0047_voice_interviews at
-- version 20260808180259, 0047_watchlist_provenance at 20260812164511 — both
-- applied from outside this repository), so the identity was retired and the
-- SQL re-issued here as 0049. The name+checksum ledger discipline keys on the
-- NAME; reusing a number that production's history already owns would make
-- two different DDLs answer to one identity.
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
-- Additive only; safe on a live database. Rollback: 0049 in rollback/.

create table if not exists public.decision_runs (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The full EntryPoint vocabulary (src/lib/graph/types.ts). The original
  -- 0047 draft predated Phase 8 and omitted court/verdict/subscriptions —
  -- inserts from those three live surfaces would have violated this check.
  -- Caught in forensic review before first application; pinned by
  -- src/lib/migrationSequence.test.ts so the two lists cannot drift again.
  entry_point text not null check (entry_point in ('build-case', 'ask', 'search', 'finder', 'watch-now', 'tv', 'browse', 'court', 'verdict', 'subscriptions')),
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
--
-- Guarded like 0048's policies so the migration is truly idempotent: the
-- 0047 draft used bare `create policy`, which fails on re-apply — proven by
-- scripts/proveMigration.ts (double-apply) before first application. A
-- crash between commit and ledger write retries the whole file; every
-- statement must survive that.
do $$ begin
  create policy decision_runs_select_own on public.decision_runs
    for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy decision_runs_insert_own on public.decision_runs
    for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy decision_runs_service_all on public.decision_runs
    for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;
