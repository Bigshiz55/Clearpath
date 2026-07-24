# Verdict Growth OS — Next-Phase Integration Roadmap

v1 delivered the disciplined foundation: pure decision engine, adapters with
mocks, full schema, seeded command center, approval workflow, and safety
controls. The following phases turn mocks into reality — each independently
gated by credentials + explicit approval.

## Phase 2 — Persistence & auth (no external providers yet)
- Stand up a **dedicated** Supabase project (separate from WV/RV).
- Run `0001_init.sql`; swap `src/lib/store.ts` internals for Supabase queries
  (function signatures already match — UI/engine untouched).
- Wire authentication (`supabase.auth.getUser()`), RLS policies, and the
  `roles`/`permissions` model. Writes remain service-role for OS jobs.
- Seed the DB from `src/lib/seed` with `is_demo = true`.

## Phase 3 — Read-only real signals
- **Analytics adapter (live)**: real funnel events for both products. Flip mode
  to `live`; the funnel/leak analysis already consumes the interface.
- **GitHub adapter (live)**: real PRs, deploys, incidents (read-only PAT).
- **Billing adapter (live, read-only)**: real MRR/subscription snapshots. No
  charge/refund capability is added.
- Observations now generated from real deltas; briefing reflects reality.

## Phase 4 — The scheduled operating loop
- Implement the job runner (cron / Vercel Cron / Supabase scheduled functions)
  around `evaluateJobStart`: resumable, idempotent, cost-capped, observable,
  honoring the emergency stop. Persist `job_runs`.
- Nightly: observe → normalize → analyze → rank → propose. Each run writes
  recommendations + audit events; ceilings enforced per run.

## Phase 5 — Assisted content (LLM, drafting only)
- Introduce an LLM adapter for **drafting** campaign copy, PR pitches, and
  opportunity summaries — never for ranking/approval.
- Cache derived artifacts; meter every call against cost ceilings; keep cost per
  active user under the registry limit.

## Phase 6 — Guarded execution
- Add execution adapters **only** behind the Approval Center: a human-approved
  action is executed through an audited adapter, result recorded, outcome
  measured against expected impact (closing the loop's step 9–10).
- Social publishing, if ever added, gets a dedicated, separately-approved,
  rate-limited path with a `publish()` method that does not exist today.
- Still no automatic advertising spend or money movement without explicit,
  per-action human approval.

## Phase 7 — Learning
- Feed measured outcomes back into scoring/ranking weights (offline, reviewed —
  the engine stays deterministic; weight changes are versioned, not silent).
- Add experiment auto-analysis with guardrail enforcement.

## Guardrails that never relax
- Approvals stay default-deny; new externally-visible actions are gated by
  default.
- Every automated action creates an audit event.
- Product separation (WV vs RV) is never removed.
- Secrets stay server-only; no public unauthenticated deployment.
- We never present mock data as real, never fabricate integrations, and stop to
  flag anything that would violate platform terms, privacy, or anti-spam rules.
