# Phase 2 Migration Plan — Decision Engine contract

Turns the agreed architecture (`docs/DECISION_ENGINE.md`, ADR-001/002/003) into a
concrete, **additive, non-destructive** schema evolution from the current
34-table v1 schema (`supabase/migrations/0001_init.sql`).

**Principles:** additive first → dual-write → backfill → cut over reads →
deprecate. Every migration is idempotent and RLS-on; writes stay service-role.
No existing table is dropped in Phase 2; the current tests stay green throughout.

---

## 1. Schema review — current 34 tables vs the new contract

| Current table | Verdict | Notes |
| --- | --- | --- |
| organizations, users, roles, permissions | **keep** | RBAC; wire real auth in Phase 2. |
| products, product_goals | **keep** | Registry. Add `north_star_metric`, `enterprise_value_multiplier`. |
| integrations, data_sources | **keep** | Adapter registry. |
| observations | **keep + extend** | Add `kpi_node_id`, `assumptions`, `uncertainty`. Now the sensor input. |
| opportunities | **reframe** | Becomes a *source type* of observations; kept as a view/legacy during cutover (ADR-001). |
| recommendations | **replace** | Superseded by `decisions`; retained read-only for backfill, then deprecated (ADR-001). |
| actions | **reframe → execution_tasks** | Rename/relink to decisions; keep old rows. |
| approvals | **keep + link** | Add `decision_id` FK. Already the human gate. |
| campaigns, campaign_assets, audiences | **keep** | Campaign Factory; a campaign becomes an executor target of a Decision. |
| funnels, funnel_steps | **keep** | Feed the KPI graph. |
| metric_definitions, metric_values | **keep** | Feed KPI-node calibration. |
| experiments, experiment_variants | **keep + link** | Add `decision_id`, `kpi_node_id`, `verdict` enum (`worked/failed/inconclusive/never_repeat`). Owned by Growth Science. |
| repositories, pull_requests, deployments, incidents, customer_feedback | **keep** | Engineering sensors. |
| plans, subscriptions, revenue_metrics, cost_metrics | **keep** | Revenue/cost sensors + LTV/free-to-paid calibration source. |
| scheduled_jobs, job_runs | **keep** | Job runner substrate; `job_runs` already has idempotency + cost. |
| audit_events | **keep → projection** | Becomes a read projection of the new `events` log. |

### Net-new tables required (16)

Event core: **events**, **outbox**.
Value model: **kpi_nodes**, **kpi_edges**, **beliefs**.
Decisioning: **signals**, **plays**, **decisions**, **decision_dependencies**.
Executives/allocation: **executives**, **resource_pools**, **budget_cycles**, **capital_allocations**, **exec_scorecards**, **credibility_weights**.
Execution/learning: **execution_tasks**, **measurements**, **attributions**, **engine_runs**.

### Columns added to existing tables
- `decisions` (new) carries the full envelope: `ev_conservative/ev_base/ev_optimistic`,
  `confidence`, `effort_eng_days`, `cash_cost_usd`, `risk`, `kpi_node_id`,
  `time_to_impact_days`, `impact_half_life_days`, `automatable`,
  `requires_approval`, `reversibility`, `pathway_acquisition/retention/revenue`
  (check: sum = 1), `option_value_usd`, `strategic_uncertainty_resolved`,
  `owning_executive_id`, `resource_pool_id`, `evidence jsonb`, `assumptions jsonb`,
  `provenance jsonb`, `status`, `play_id`, `signal_id`.
- `approvals.decision_id`, `experiments.decision_id`/`kpi_node_id`/`verdict`,
  `observations.kpi_node_id`, `products.north_star_metric`/`enterprise_value_multiplier`.

---

## 2. Migration sequence

Each file is one reviewable, idempotent step. Ship in order; each is safe to
deploy alone.

**0002_event_log.sql** — `events` (append-only source of truth) + `outbox` +
indexes (`aggregate_type,aggregate_id`, `occurred_at`, `correlation_id`). Start
**dual-writing**: existing mutations also append an event. `audit_events` becomes
a projection.

**0003_kpi_graph.sql** — `kpi_nodes`, `kpi_edges` (conversion prob + CI),
`beliefs` (versioned priors: node values, LTV, free-to-paid anchor, play
base-rates, per-channel CAC). Seed WV nodes from the funnel; port the preview
value model (`src/lib/decision-preview/kpiGraph.ts`) into the real graph.

**0004_decisions.sql** — `plays` (Playbook), `signals`, `decisions` (full
envelope), `decision_dependencies`. Backfill `decisions` from `recommendations` +
`opportunities`. Point the Decision Engine at real signals. `opportunities`
becomes a source-type; keep as legacy view.

**0005_executives.sql** — `executives` (mandate = KPI-node set, team, scorecard),
`resource_pools`, `budget_cycles`, `capital_allocations`, `exec_scorecards`,
`credibility_weights`. Add `owning_executive_id`/`resource_pool_id` to `decisions`.
Seed the four live seats (CPO, CGO, CDS, CFO-as-constraint).

**0006_execution_measurement.sql** — `execution_tasks` (link/relabel `actions`),
`measurements` (predicted vs observed per decision + KPI node), `attributions`,
`engine_runs` (input hash + config version for reproducibility). Add
`approvals.decision_id`, `experiments.decision_id/kpi_node_id/verdict`.

**0007_deprecate_recommendations.sql** — once the engine populates `decisions`
and reads are cut over, mark `recommendations`/`opportunities` legacy (revoke
writes, keep for history). No drop in Phase 2.

**RLS:** every new table `enable row level security` in its own migration; no
anon/authenticated write policies (service-role only), matching v1.

---

## 3. Application cutover (in lockstep with the SQL)

1. `src/lib/store.ts` internals swap from in-memory to Supabase queries — **function
   signatures already match the schema**, so the UI/engine don't change.
2. Promote `src/lib/decision-preview/*` from labeled preview to the real
   `src/lib/decision-engine/*` (kpi-graph, roi, portfolio, ledger), now reading
   `beliefs` for its calibrated inputs instead of hard-coded seed anchors.
3. The Executive/Approval/Audit pages become views over `decisions` + `events`.
4. Keep the DEMO labeling until an adapter flips to `mode = live`.

---

## 4. What to build FIRST (strict order)

1. **`events` log + `beliefs` store** — the durable core; everything keys to it.
2. **KPI value graph on WV's real funnel** — calibrate `free_to_paid` and `LTV`
   from `revenue_metrics`; this is the single highest-leverage task (it dominates
   every ΔEV, per the mock's risk section).
3. **`decisions` + collapse `recommendations`/`opportunities`** — one ranked ledger.
4. **Portfolio selector + the CEO morning brief** — replace the naive top-5 sort.
5. **Growth Science calibration loop** — `measurements` → `attributions` →
   `beliefs` update → ledger re-price. This is what makes the system compound.

Async execution, live provider adapters, and additional executive seats come
**after** the loop is closed and calibrated (Phase 3+, see `docs/ROADMAP.md`).

---

## 5. Guardrails preserved through the migration

- Approvals stay default-deny; `approvals.decision_id` links the gate to the ledger.
- Every automated action appends an `events` row (audit by construction).
- Decisions retain evidence, provenance, assumptions, uncertainty (JSON columns).
- The engine can persist an **"insufficient evidence"** decision status and a
  **`kill`** decision that halts/reverses a measured-bad initiative.
- Product separation (WV vs RV) enforced by `product` scoping on every new table.
