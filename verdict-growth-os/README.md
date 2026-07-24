# Verdict Growth OS

The internal operating system that **acquires, activates, retains, and monetizes**
users for **WatchVerdict** and **ReadVerdict**.

It is not a generic founder dashboard. It is a decision engine: it observes the
two products, normalizes signals, ranks opportunities by business impact,
proposes the highest-value actions, and gates every externally-visible or
financial action behind human approval.

> **v1 status — honest labeling.** Everything in this pass runs on **labeled
> mock adapters** with seeded demo data. Nothing is connected to a live
> analytics, GitHub, billing, or social provider. Nothing auto-posts. No money
> is spent. Every demo record renders a `DEMO` badge.

---

## Where this lives

This app is a **self-contained product** in the `verdict-growth-os/` directory.
It has its own `package.json`, dependencies, tests, and build. It **does not
import from or modify** the WatchVerdict app in the parent repo. It is designed
to be extracted into its own `verdict-growth-os` repository later (e.g. with
`git filter-repo --subdirectory-filter verdict-growth-os`); it was scaffolded
here because this working session is scoped to a single repository/branch.

## Quick start

```bash
cd verdict-growth-os
npm ci                 # or: npm install
npm run dev            # http://localhost:3100
```

No environment variables are required to run, test, or build v1 — the mock
adapters need no secrets. To prepare for real integrations later, copy the
template:

```bash
cp .env.example .env.local
```

## Gates before committing

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

All four must pass. Current status: **typecheck ✓ · lint ✓ · 65 tests ✓ · build ✓**.

## What's in the box

| Module | Route | Purpose |
| --- | --- | --- |
| Executive Briefing | `/` | 5 highest-value actions + what grew/declined/broke |
| Growth Opportunity Inbox | `/opportunities` | Normalized signals ranked on one 0–100 impact axis |
| Campaign Factory | `/campaigns` | Draft → review → approve workflow (no auto-publish) |
| Conversion Laboratory | `/conversion` | Funnel, drop-off analysis, experiments |
| Engineering Command | `/engineering` | PRs, deploys, incidents, feedback (GitHub adapter) |
| Revenue Engine | `/revenue` | MRR/ARR, LTV:CAC, cost per active user |
| Approval Center | `/approvals` | Unified human-in-the-loop queue |
| Integrations | `/integrations` | Adapter health, product registry, job ceilings |
| Audit Log | `/audit` | Every automated action + human decision |

Use the **product switcher** (top-right) to scope any page to WatchVerdict,
ReadVerdict, or All.

## Architecture at a glance

```
Observe → Normalize → Analyze → Rank → Propose → Approve → Execute → Measure → Learn
```

- **Pure domain engine** (`src/lib/domain/*`) — no I/O, fully unit-tested. All
  scoring, ranking, approval enforcement, funnel/revenue/cost math lives here.
- **Provider adapters** (`src/lib/adapters/*`) — swappable interfaces; v1 ships
  mock implementations only. No adapter performs an external or financial write.
- **Data model** (`supabase/migrations/0001_init.sql`) — full Postgres schema
  with enums, FKs, indexes, provenance, confidence, and RLS enabled everywhere.
- **In-memory store** (`src/lib/store.ts`) — v1 persistence, shapes identical to
  the schema so the Supabase swap is a drop-in.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/PRD.md`](docs/PRD.md) for the full picture, and
[`docs/COST_CONTROL.md`](docs/COST_CONTROL.md) / [`docs/ROADMAP.md`](docs/ROADMAP.md)
for the safety and next-phase plans.

## Safety posture

- Default-deny approvals: any externally-visible or financial action requires a
  human decision before it could ever execute.
- Every automated action creates an audit event.
- Scheduled jobs are idempotent (duplicate-run prevention) and cost-capped, with
  a manual emergency stop.
- Secrets are server-only; the two `NEXT_PUBLIC_` Supabase values are the only
  client-safe env vars.
