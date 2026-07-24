# ADR-003 — Executives are accountability & interpretation layers, not autonomous agents

- **Status:** Accepted
- **Date:** 2026-07-24
- **Deciders:** Founder + CTO
- **Related:** ADR-001, ADR-002, `docs/DECISION_ENGINE.md §4`

## Context

The product vision frames the system as a Fortune-100 executive team (CEO, CGO,
CMO, CPO, CRO, CTO, CCO, CDS, CPRO, CPartO, CFO) where "executives compete for
budget." Taken literally — as 11 autonomous AI agents that negotiate — this buys
us org politics simulation: ~11× cost, emergent non-determinism, unstable
rankings, and a system that demos well but cannot be trusted or tested.

Real executive teams do not vote on every action either. A **capital allocation
process** ranks work; executives are **accountable** for the P&L they own.

## Decision

Model executives as an **accountability and interpretation layer over one
allocator**, defined by three data fields each:

- **Mandate** — the cluster of KPI-graph nodes the executive owns.
- **Team** — the sensors (emit Observations) and executors (perform work) under them.
- **Scorecard** — did their funded proposals deliver predicted ΔEV? (calibration,
  decision yield, realized ROI) — maintained by Growth Science.

Rules:

1. **One company objective, one currency, one allocator.** Executives *propose*
   priced candidates and *own outcomes*; they **never set priority**. A single
   constrained optimizer (the "CEO function") ranks all proposals in ΔEV and
   allocates the scarce-resource pool (cash, capacity, founder attention, risk,
   reputation).
2. **"Compete for budget" = a capital market.** Proposals compete in one
   portfolio. Outcomes update each seat's **credibility weight**; chronic
   over-promisers have future estimates shrunk toward reference-class priors. This
   is the anti-politics mechanism: the track record reprices proposals, so
   executives never "fight."
3. **Capability for 11, headcount for 4.** Phase 2 staffs CPO (activation), CGO
   (acquisition), CDS (Growth Science/value model), and CFO (constraints). The
   other seats are interfaces with default behavior until surface area justifies
   them.
4. **Executives may attach a suggested Play to an Observation** as a
   *non-authoritative hint* — preserving domain expertise without granting any
   department priority authority.

## Consequences

- **Positive:** rankings stay deterministic, testable, and auditable; adding an
  executive is adding a mandate + scorecard, not a new decision-maker.
- **Positive:** thousands of specialists scale *under* a fixed thin executive
  layer via the event log (they route more observations/executions under an
  existing mandate); the org chart is a KPI-ownership tree, not a management chain.
- **Positive:** accountability without authority-over-the-queue is exactly what
  makes "the executives never fight" true by construction.
- **Cost:** a small schema addition (`executives`, `resource_pools`,
  `capital_allocations`, `exec_scorecards`, `credibility_weights`) and an
  `owning_executive_id` on each Decision. ~5 tables + 2 columns — an overlay, not
  a new engine.

## Alternatives considered

- *11 autonomous negotiating agents.* Rejected: cost, non-determinism, emergent
  politics, untestable rankings — optimizing the AI system, not the business.
- *No executives, just the allocator.* Rejected: loses accountability, domain
  ownership, and the human-legible "who owns this KPI / who is on the hook" that
  the founder needs to run the company.
