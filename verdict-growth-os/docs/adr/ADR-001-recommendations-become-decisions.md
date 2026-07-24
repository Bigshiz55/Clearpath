# ADR-001 — Recommendations become Decisions flowing through one engine

- **Status:** Accepted
- **Date:** 2026-07-24
- **Deciders:** Founder + CTO (Verdict Growth OS)
- **Supersedes:** the v1 `recommendations` model
- **Related:** ADR-002 (dollar currency), ADR-003 (executives), `docs/DECISION_ENGINE.md`

## Context

v1 shipped a `recommendations` table and a separate `opportunities` table. Two
problems make them unfit for the target architecture:

1. **Two incomparable scales.** Opportunities score 0–100 on one heuristic;
   recommendations rank on a *different* `priorityScore`. There is no way to ask
   "is this opportunity worth more than that recommendation?"
2. **Recommendations are authored, not derived.** They are records someone
   writes, not the output of a pipeline. Nothing forces every department's signal
   through a single decision path, which is exactly the "isolated dashboard"
   failure mode we are trying to kill.

## Decision

Introduce a single first-class entity, **Decision**, produced by the **Decision
Engine** from normalized **Signals** (which are themselves normalized
Observations). `recommendations` and `opportunities` are reframed:

- **Observation** — a raw typed fact emitted by a department/sensor.
- **Signal** — a normalized, deduped Observation bound to a KPI-graph node.
- **Decision** — the unit the engine produces and ranks: a proposed action with
  the full ROI envelope (ΔEV, confidence, effort, cost, risk, KPI, evidence,
  dependencies, automatable, requires-approval, reversibility, time-to-impact).

Every Decision is created by a **Reasoner** selecting a **Play** from a
data-driven Playbook. No department writes a Decision directly; departments only
submit Observations (they may attach a *suggested* play as a non-authoritative
hint).

## Consequences

- **Positive:** one ranked ledger; every action comparable; the pipeline
  (Observe→…→Learn) is enforced by data shape, not convention; adding a
  department = adding sensors, not a new decision surface.
- **Positive:** the ledger is the substrate for approvals, audit, measurement,
  and learning — all keyed to a Decision id.
- **Cost / migration:** `recommendations` is retained during Phase 2 as a
  read-through/backfill source, then deprecated once `decisions` is populated by
  the engine. `opportunities` becomes a *source type* of observations. See
  `docs/PHASE_2_MIGRATION_PLAN.md`.
- **Invariant:** a Signal that cannot be bound to a KPI node is **quarantined**
  ("insufficient evidence"), never silently ranked.

## Alternatives considered

- *Keep two tables, add a shared score.* Rejected: still two authoring paths, no
  single pipeline, and the shared score would have no principled unit (ADR-002).
- *Only opportunities.* Rejected: opportunities model inbound signals well but not
  internal work (a product fix is not an "opportunity"); Decision generalizes both.
