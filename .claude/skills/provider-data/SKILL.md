---
name: provider-data
description: >-
  Development guidance for WatchVerdict's streaming provider / watch-availability
  data — the Watchmode cache, TMDB watch/providers, honest availability states,
  and the metered sync budget. Use when editing src/lib/watchmode/*,
  src/lib/availability/*, provider filtering in the finder, or anything that
  claims where a title can be watched.
---

# provider-data — changing availability data

## Golden rules (do not violate)
1. **Never fabricate availability.** If we don't have a confirmed answer, say so.
   The card status is `unconfirmed | none | available` — `unconfirmed` means "no
   confirmed answer", NOT "checking…". Most titles are never queued.
2. **Two honest sources, don't blur them.** Watchmode cache
   (`src/lib/watchmode/cardAvailability.ts`, read-only at request time) and TMDB
   watch/providers (`getWatchProviders`, degrades to null). Every call site
   `.catch(() => null)` → "no data", never a guess.
3. **Never call Watchmode from a request path.** The only writer is
   `src/lib/watchmode/sync.ts` (cron), budget-guarded (`MONTHLY_CALL_LIMIT`).
   The single sanctioned on-demand call is `refreshOneTitle` behind same-origin
   + per-title rate limit + the same budget ledger.
4. **Wholesale replace, never merge** a title's snapshot on sync, so a dropped
   service actually disappears. Never write `fetch_state` on a failed fetch (a
   transient failure must not read as "checked, nothing found").
5. **The capability probe must not lie.** `refreshCapability` checks the ledger
   AND both write tables — a readable table can still have a blocked insert.

## Step 1 — Reproduce with the real states
Use `src/lib/availability/states.ts` (the canonical states). Assert the exact
state, not just presence/absence.

## Step 2 — Respect the budget
Any new upstream call must go through `src/lib/viewing/ingest/budget.ts`. Log
what was dropped when a cap is hit — silent truncation reads as full coverage.

## Step 3 — Gates
`npm run typecheck && npm run lint && npx vitest run && npm run build`. Provider
reliability is covered by `WhereToWatch.reliability.test.ts` — keep it green.

## Notes
- Watchmode free tier is non-commercial; a paid tier is required before public
  launch (see `sync.ts` header). Do not remove that caveat.
- Provider filtering in discover uses `with_watch_providers` /
  `with_watch_monetization_types`; region comes from the user profile.
