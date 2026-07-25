# Court v2 (0026) — Production Migration Runbook

**Status: code deployed, migration NOT applied.** Production runs commit
`00cc031` (verified from the deployed build metadata). The database migration
`0026_court_v2.sql` requires a credential that does not exist in the agent
sandbox, so it must be applied by the project owner.

## What was verified (against a real PostgreSQL 16.13 instance)

The full 27-migration chain, ending with 0026, was replayed on a clean database:

| Check | Result |
| --- | --- |
| Full chain applies in order | ✅ 0 failures |
| Tables created | ✅ `court_messages` (+ existing `court_rooms`, `court_participants`) |
| Columns added | ✅ `court_participants.ready` / `.tonight` / `.reactions` |
| Indexes | ✅ `idx_court_messages_room`, `court_messages_pkey` |
| Functions | ✅ `court_chat_send`, `court_set_tonight`, `court_react`, `court_state_v2`, `court_join` — all `SECURITY DEFINER` |
| RLS enabled on every court table | ✅ `court_rooms`, `court_participants`, `court_messages` |
| Direct table policies | ✅ **0** — access is RPC-only by design |
| `anon` grants | ✅ all five RPCs executable by `anon` + `authenticated` |
| Functional flow | ✅ create → join ×2 → tonight → picks → reactions → **late join** → chat → snapshot → reveal |
| Invalid reaction rejected | ✅ raises `Invalid reaction` |
| Join blocked after Verd1ct | ✅ raises `This Court has already reached its Verd1ct` |
| Idempotency | ✅ applied 3× total, 0 errors, 0 rows lost |
| Data preservation | ✅ participants/messages/tonight/reactions intact across re-runs |
| Rollback | ✅ applies cleanly, idempotent, preserves all pre-existing data |
| Roll-forward after rollback | ✅ re-applies cleanly |

## Who must apply it

The **project owner / Supabase admin** for project `vajgviraxigkwlvysxfz`
(anyone holding the database password, or an account listed in `ADMIN_EMAILS`).

## Option A — Supabase dashboard (no local setup, recommended)

1. Open <https://supabase.com/dashboard/project/vajgviraxigkwlvysxfz/sql/new>
2. Paste the contents of `supabase/migrations/0026_court_v2.sql`
3. Click **Run**

**Expected runtime:** under 2 seconds (DDL only; no table rewrite, no backfill).
**Expected output:** a series of `CREATE`/`ALTER`/`GRANT` success rows, no errors.

## Option B — the app's own migration runner

The endpoint already exists and has the migration embedded (registered in
`PENDING_MIGRATIONS` as `0026_court_v2`).

```bash
curl -X POST https://clearpath-pearl-chi.vercel.app/api/admin/migrate \
  -H "Authorization: Bearer $MIGRATE_SECRET" \
  -H "Content-Type: application/json" -d '{}'
```

Requires the `MIGRATE_SECRET` env var (already configured in Vercel — the
endpoint returns `403 Not authorized` rather than `503`, so it is live).
Alternatively sign in as an `ADMIN_EMAILS` user and visit `/migrate`.

**Expected runtime:** ~2–5 seconds including cold start.
**Expected output:** JSON listing each migration with `ok: true`.

## Option C — psql

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0026_court_v2.sql
```

## Verification command (no credentials needed)

```bash
curl -s https://clearpath-pearl-chi.vercel.app/api/health?probe=schema | jq
```

Before applying, this reports `"courtV2Ready": false`. After applying it must
report:

```json
{ "migrations": { "0026_court_v2": true }, "courtV2Ready": true }
```

Then confirm in the product: open `/court/<code>` in two browsers — Group chat,
Tonight's preferences, reactions and late join all become available.

## Rollback command

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/rollback/0026_court_v2_rollback.sql
```

Drops only what 0026 added and restores the previous `court_join`. It
deliberately **keeps** the three added columns, because dropping them would
destroy tonight-setup and reaction data; an optional destructive block at the
bottom of the file removes them if that loss is acceptable. Verified idempotent,
and 0026 re-applies cleanly afterwards.

## Behaviour until it is applied

`CourtRoom` detects the missing RPC and falls back to the v1 `court_state`
snapshot, so **the Court still loads and does not error**. Unavailable until the
migration runs: Group chat, Tonight's preferences persistence, per-title
reactions, and late joining.
