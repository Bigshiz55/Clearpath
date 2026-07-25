# Migration audit — 0026 … 0031

Verified on PostgreSQL 16.13 with the Supabase prerequisites bootstrapped
(`auth` schema, `anon` / `authenticated` / `service_role` roles, `pgcrypto`).
The whole 31-migration chain was applied to **three separate fresh disposable
databases**: 0 failures each time. It was additionally re-applied 3× in place to
confirm idempotency with data preserved.

**None of these have been applied to production.**

## Ordering and dependencies

They are **not independent**. Apply in numeric order.

| # | Purpose | Depends on | Destructive | Reversible | Rollback script |
|---|---|---|---|---|---|
| 0026 | Court v2: `court_messages`, tonight prefs, reactions, `court_state_v2` | 0004 (`court_rooms`, `court_participants`), 0014 | **Yes** — one `drop policy` (policy only, no data) | Yes | `rollback/0026_court_v2_rollback.sql` |
| 0027 | Discovery content: published pages + overrides | 0001 (`profiles`) | No | Yes (drop 2 tables) | **none** |
| 0028 | Verdict OS: 7 tables (missions, approvals, activity…) | 0001, `auth.users` | No | Yes (drop 7 tables) | **none** |
| 0029 | Court voting: ballots, veto tokens, jury | 0004, 0026 | No | Yes | **none** |
| 0030 | Host-controlled court size | 0004 only (**not** 0026 — it patches `court_state_v2` conditionally) | No | Partly — dropping `court_size` loses host choices | **none** |
| 0031 | Reco engine: catalog, features, embeddings, availability, sessions | 0001 (`auth.uid()`), `pgcrypto`, `pg_trgm` | No | Yes (drop 10 tables) | **none** |

### Answering the question directly

**0031 cannot be applied alone.** It does not reference 0026–0030 objects, but
the chain has never been validated with gaps, and 0026/0029/0030 all patch the
same `court_*` surface. Apply 0026 → 0027 → 0028 → 0029 → 0030 → 0031.

## Locks and storage

All six are **additive DDL**: `create table if not exists`, `add column if not
exists`, `create index if not exists`, `create or replace function`.

- New tables and new nullable columns take a brief `ACCESS EXCLUSIVE` lock on
  the table being altered, held for milliseconds — no table rewrite, because
  every added column is nullable or has a constant default (PG11+ stores those
  in the catalog).
- **The one to watch is 0031's `search_doc` generated column.** It is added at
  `create table` time on an empty table here, so it costs nothing — but if
  `catalog_titles` already exists with rows, adding a stored generated column
  **does** rewrite the table. On a fresh install this is a non-issue.
- Index builds are **not** `CONCURRENTLY`. On empty tables that is correct and
  faster. If you ever apply 0031 to a populated catalog, convert the 19 index
  statements to `CREATE INDEX CONCURRENTLY` and run them outside a transaction.

Measured storage for the reco tables at 5,000 synthetic titles: **~14 MB**
including indexes (dominated by `title_embeddings` at 3 views × 32 floats).
Extrapolating linearly to 50,000 titles gives ~140 MB — but real embeddings at
1536 dims are **48× larger per vector**, so a real 50k catalog with one
1536-dim view is on the order of **1.2 GB** for embeddings alone. That is a
sizing input for you, not a measurement.

## Application-code compatibility

| Migration | Before applying | After applying |
|---|---|---|
| 0026 | Court falls back to `court_state` v1 (no chat/tonight/reactions) | Full v2 |
| 0027–0029 | Features 404 / return empty; no crash | Live |
| 0030 | Court uses Standard 12; host picker writes fail and the UI self-corrects | Host control live |
| 0031 | **No application code reads these tables.** The engine is not wired in. | Still nothing reads them — the lab uses synthetic data in memory |

Every one is **forward- and backward-compatible with the currently deployed
code**: the app degrades to the older path rather than erroring.

## Verified ordered command for a future staging environment

```bash
# Against a STAGING connection string. Never production.
export PGURI='postgresql://…staging…'

for f in 0026_court_v2 0027_discovery_content 0028_verdict_os \
         0029_court_voting 0030_court_size 0031_reco_engine; do
  echo "--- applying $f"
  psql "$PGURI" -v ON_ERROR_STOP=1 -f "supabase/migrations/${f}.sql" || {
    echo "FAILED at $f — stopping"; exit 1; }
done

# Verify without credentials afterwards:
curl -s "https://<staging-host>/api/health?probe=schema" | jq .
```

Rollback for 0026 only:
`psql "$PGURI" -f supabase/migrations/rollback/0026_court_v2_rollback.sql`

**Gap:** 0027–0031 have no rollback scripts. For 0031 the reversal is
mechanical (drop 10 tables + 9 functions, all additive), but it is not written
and therefore not tested.
