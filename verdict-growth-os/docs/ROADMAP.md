# Verdict Growth OS — Next-Phase Integration Roadmap

v1 delivered the disciplined foundation: pure decision engine, adapters with
mocks, full schema, seeded command center, approval workflow, and safety
controls. The operating model is now a **frozen candidate** (`docs/DECISION_ENGINE.md`
§13; ADR-001→006). The following phases turn mocks into reality — each
independently gated by credentials + explicit approval.

## Phase 2 — Decision Engine core + persistence (no external providers yet)
Sequenced in `docs/PHASE_2_MIGRATION_PLAN.md §4`. In strict order:
- **Event log + belief store** (`events`, `beliefs`) — the durable substrate.
- **Calibrate the KPI value graph** on WV's real funnel (free-to-paid + LTV) —
  the single highest-leverage task; it dominates every ΔEV.
- **`decisions` ledger** — collapse `recommendations`/`opportunities`; land the
  full envelope including **reversibility, decision class, and a placeholder
  learning value** (ADR-004/005/006). Reversibility penalty + class policies ship
  in this first cut; full EVOI learning value arrives with the calibration loop.
- **Portfolio selector + CEO morning brief** — the composite objective
  (riskAdjEV + learning + option + strategic) under the constraint set + explore
  reserve. One scalar + three constraints + one reserve — no Pareto solver.
- **Growth Science calibration loop** — `measurements` → `attributions` →
  Bayesian `beliefs` update → re-price; this activates real learning value.
- Stand up a **dedicated** Supabase project (separate from WV/RV); run migrations
  `0001`→`0007`; swap `src/lib/store.ts` internals for Supabase (signatures match);
  wire auth + RLS + `roles`/`permissions`; writes stay service-role.
- Promote `src/lib/decision-preview/*` to `src/lib/decision-engine/*`, now reading
  tunable coefficients from `beliefs` instead of hard-coded seed anchors.

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
