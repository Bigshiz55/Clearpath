# Verdict Growth OS — Architecture

## 1. Purpose & boundaries

Verdict Growth OS exists to grow two products — WatchVerdict and ReadVerdict —
along the funnel from qualified visitor to retained, paying user, at a
sustainable CAC and a low AI/infra cost per active user.

It is **not** WatchVerdict or ReadVerdict, does not reimplement them, and does
not modify their code. It observes them (via adapters), reasons about them, and
proposes/gates actions on their behalf.

## 2. The daily operating loop

The entire system is organized around one loop:

```
1. Observe    — adapters pull raw signals (funnel, revenue, PRs, community…)
2. Normalize  — everything becomes an Observation/Opportunity with provenance
3. Analyze    — pure domain engine computes scores, conversions, health
4. Identify   — surface problems (declines, incidents) and opportunities
5. Rank       — one comparable business-impact axis (0–100)
6. Propose    — Recommendations with evidence, effort, impact, metric affected
7. Approve    — externally-visible / financial actions gated by a human
8. Execute    — through an adapter (v1: mock/manual only)
9. Measure    — compare outcome to expected impact
10. Learn      — feed results back into future ranking
```

Steps 3–7 are implemented as **pure, tested functions** so the loop's judgment
is deterministic and auditable. Steps 1 and 8 are the only I/O boundaries and
live entirely behind adapters.

## 3. Layers

```
┌─────────────────────────────────────────────────────────────┐
│ UI (Next.js App Router, server components)                   │
│   /  /opportunities  /campaigns  /conversion  /engineering   │
│   /revenue  /approvals  /integrations  /audit                │
├─────────────────────────────────────────────────────────────┤
│ Store (v1: in-memory; next: Supabase repository)             │
│   read passthroughs + the one interactive write: approvals   │
├─────────────────────────────────────────────────────────────┤
│ PURE DOMAIN ENGINE  (src/lib/domain/*  — no I/O, unit-tested)│
│   scoring · ranking · approvals · funnel · revenue · cost    │
│   jobs · audit · separation · briefing                       │
├─────────────────────────────────────────────────────────────┤
│ Provider adapters (src/lib/adapters/*)                       │
│   AnalyticsAdapter · GitHubAdapter · RevenueAdapter · Social │
│   v1: mock implementations only (read/draft, never write)    │
└─────────────────────────────────────────────────────────────┘
```

### Why a pure engine

Following the discipline already used in WatchVerdict's scoring: the parts that
make business judgments must be **pure and deterministic** so they can be tested
exhaustively and can never be silently changed by a flaky provider or an LLM.
LLMs, when introduced (later phases), only *draft content* and *summarize*; they
never decide whether an action is approved or how an opportunity ranks.

## 4. Adapters (rule 3: providers are replaceable)

Interfaces are defined in `src/lib/adapters/types.ts`:

- `AnalyticsAdapter.getFunnelDays()` — daily funnel counts.
- `GitHubAdapter.listPullRequests/Deployments/Incidents()`.
- `RevenueAdapter.getRevenueSnapshot/getCostSnapshot()`.
- `SocialAdapter.discoverOpportunities()` — **read/draft only; there is
  deliberately no `publish()` method.**

Every adapter returns data already stamped with **Provenance**
(`source, sourceUrl, product, collectedAt, confidence, isDemo`). `resolveAdapters()`
returns the mock bundle in v1 and **fails safe to mocks** rather than pretending
to be connected.

## 5. Data honesty (rule 7 & 9)

- Every collected fact carries source, timestamp, product, confidence, and an
  `isDemo` flag.
- Seed data has `isDemo: true`; the UI renders a `DEMO` badge wherever it
  appears. Nothing seeded is ever presented as production truth.
- The Engineering page explicitly states repository/deploy data is mock and
  makes no claim about real production state.

## 6. Safety architecture

- **Approvals are default-deny** (`src/lib/domain/approvals.ts`): unknown and all
  externally-visible action types require approval; only a short allowlist of
  internal, reversible, non-financial actions is auto-safe. Execution is only
  permitted from the `approved` state, exactly once (a strict state machine).
- **Audit everywhere** (`src/lib/domain/audit.ts`): every automated action and
  human decision constructs a validated `AuditEvent`.
- **Cost ceilings** (`src/lib/domain/cost.ts`) + **duplicate-run prevention and
  emergency stop** (`src/lib/domain/jobs.ts`) bound every scheduled job.
- **Product separation** (`src/lib/domain/separation.ts`): WatchVerdict and
  ReadVerdict data never cross; enforced in tests and defensively at read time.
- **Secrets are server-only**; only two `NEXT_PUBLIC_` Supabase values are
  client-safe.

## 7. Persistence

v1 uses an in-memory store (`src/lib/store.ts`) so the whole app runs with zero
external dependencies. Its function signatures mirror the Supabase schema
(`supabase/migrations/0001_init.sql`) 1:1, so the next phase swaps the store's
body for Supabase queries without touching the domain engine or UI. RLS is
enabled on every table; writes are service-role-only until human auth is wired.

## 8. Extending the system

- **Add a real provider:** implement the adapter interface, stamp provenance,
  set `mode: 'live'`, and register it in `resolveAdapters()` behind a
  credential check. The UI health badge flips automatically.
- **Add an action type:** add it to the enum; if it's externally visible, it is
  already default-denied by `requiresApproval` — you must *opt it into*
  auto-safe, never the reverse.
- **Add a metric/opportunity source:** emit `Observation`/`Opportunity` records
  with provenance; ranking and the briefing pick them up automatically.
