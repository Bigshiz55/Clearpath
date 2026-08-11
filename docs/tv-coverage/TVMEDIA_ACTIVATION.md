# TV Media — activation runbook

**Status: BLOCKED on one licensing answer. Do not set any variable below until
§1 is answered in writing.**

Everything in code is ready. What is missing is not engineering.

---

## 0. Why this document exists

The previous integration "consumed allowance from three trigger paths with
nothing able to answer whether a call was permitted" (`tv/sources/feasibility.ts`).
The spend was not caused by a bug in a request — it was caused by permission
never being a single answerable question. It is now: `evaluatePaidCall()` in
`src/lib/tv/paidCallSafety.ts`, which refuses unless **all six** of licensing,
not-dry-run, activation, credentials, budget and lock agree. A test sweeps all
64 combinations and proves exactly one of them spends.

---

## 1. THE CONTRACT QUESTION — send this, verbatim

> We license TV Media listings for **WatchVerd1ct**, a publicly accessible
> consumer web product (free and paid tiers) at `clearpath-pearl-chi.vercel.app`.
> Please confirm in writing whether our current agreement permits:
>
> 1. **Public display** of your listings data to unauthenticated end users on a
>    commercial consumer product — not internal or personal use.
> 2. **Storage and caching** of listings in our database for up to 14 days, and
>    serving them from that cache rather than calling the API per page view.
> 3. **Derived data** — computing and displaying our own values from your
>    listings (a per-user recommendation score, "on now" state, reminders,
>    channel groupings) alongside the listing itself.
> 4. **Redistribution surface** — the same listings appearing in our public
>    web app, and in future in a mobile app and in shareable links.
> 5. **Attribution**: whether a visible credit is contractually required; and
>    if so, the exact approved wording and placement.
> 6. **Allowance**: our monthly request limit, how a request is counted (per
>    HTTP call or per listing returned), overage behaviour (hard refusal vs.
>    billed overage), and the rate limit per minute/hour.
> 7. **Termination/rollback**: what we must delete if the agreement ends.

Record the answer in `SOURCE_RIGHTS_REGISTRY.md` and set
`licensing: 'confirmed'` in `src/lib/tv/providerRegistry.ts`. **That constant is
the only thing that unblocks a paid call**, and it deliberately has no
environment variable — flipping it is a decision with a document behind it.

### Why attribution is currently `null`

The code carried `attributionRequired: false` while the UI printed "Full channel
listings from TV Media" described in a comment as "required by their terms".
Both cannot be true. Until §1.5 is answered, attribution status is
**`unconfirmed`**, and the credit does not display — printing a legal claim we
cannot evidence is worse than omitting one we may owe. It returns automatically
once the registry records a documented duty.

---

## 2. Required Vercel variables — names only

| Name | Purpose |
|---|---|
| `TVMEDIA_API_KEY` | The account key. Server-only; never `NEXT_PUBLIC_`. |
| `TVMEDIA_ENABLED` | Explicit per-adapter activation. `1` to enable. |
| `DATA_MODE` | Must be `paid_live`. Currently `free_live`. |
| `TVMEDIA_LINEUP_ID` | Lineup to ingest. Decides which channels exist. |
| `TVMEDIA_DEFAULT_ZIP` | Postal code used to resolve a lineup. |
| `TVMEDIA_MONTHLY_CALL_LIMIT` | The allowance from §1.6. **Set this first.** |

Never set these locally or in preview. Preview deployments are refused by the
egress gate (`non_production_environment`) by design.

---

## 3. Safe activation order

Each step is verifiable before the next spends anything.

1. **Baseline.** `npx tsx scripts/tv/dayCoverageAudit.ts --json > before.json`
   Expect all five mandatory channels FAIL at 0/1440. This is the comparison.
2. **Record the licence.** Update `SOURCE_RIGHTS_REGISTRY.md`, set
   `licensing: 'confirmed'` and the real `attributionRequired`. Ship it.
3. **Set the ceiling.** `TVMEDIA_MONTHLY_CALL_LIMIT` from §1.6 — before the key
   is enabled, so the budget gate is armed when it turns on.
4. **Set `TVMEDIA_API_KEY`** and `TVMEDIA_LINEUP_ID` / `TVMEDIA_DEFAULT_ZIP`.
   Nothing calls yet: `DATA_MODE` is still `free_live`.
5. **Dry run.** Trigger the ingest with dry-run set. `evaluatePaidCall` returns
   `dry_run` and makes **zero** paid calls; the plan is logged.
   Verify `/api/health/providers` shows `tv_media` with
   `licensing: "confirmed"`, `enabled: false`, `egressPermitted: false`.
6. **Flip `DATA_MODE=paid_live`.** Still nothing calls — `TVMEDIA_ENABLED` is
   unset. Verify the denial code changes to `paid_adapter_disabled`.
7. **Set `TVMEDIA_ENABLED=1`.** ONE controlled ingestion (§4).
8. **Verify (§5), then compare** against `before.json`.

---

## 4. The one controlled ingestion command

```
curl -X POST "https://clearpath-pearl-chi.vercel.app/api/cron/tv-ingest" \
  -H "Authorization: Bearer $CRON_SECRET"
```

One authoritative path. The distributed lock (`tv_try_acquire_ingest_lock`)
means a second caller — a retry, a manual trigger, a concurrent cron — is
refused with `concurrent_run` and spends nothing. The idempotency key floors the
window to the hour, so a cron at `:00` and a retry at `:07` are the same unit of
work rather than two bills.

**Maximum expected calls.** Activation: **1 lineup resolution + 1 listings call
per ingest window** — with a 3-day horizon fetched daily, ~2 calls/day, ~60/month.
If §1.6 says requests are counted per listing rather than per HTTP call, STOP and
recompute before enabling: ~2,800 listings/day would be a different order of
magnitude entirely.

---

## 5. Verification

```
curl -s .../api/health/providers | jq '.claim, .providers[] | select(.providerId=="tv_media")'
```
Expect `claim: "full_grid"`, `fullGridHealthy: true`, `licensing: "confirmed"`,
`degradedReason: null`, `uniqueLinearChannels` ≈ 66.

```
curl -s .../api/health/tv | jq '.providers[] | select(.providerId=="tv_media")'
```
Expect `lastRunStatus: "success"` and a `lockLastFinishAt` — proof the lock was
in the path, not merely defined.

```
npx tsx scripts/tv/dayCoverageAudit.ts --json > after.json
```
Expect the five mandatory channels to PASS near 1440/1440 with a real programme
mix (movies, reruns, paid programming — not only first-run). **If coverage is
high but the mix is all first-run, the ingest is still reading TVmaze.**

Finally, the guide itself must stop saying "Partial listings" on its own.

---

## 6. Rollback

1. `TVMEDIA_ENABLED=0` — stops all spend immediately; the guide degrades to
   TVmaze and the coverage notice returns automatically.
2. `DATA_MODE=free_live` — belt and braces.
3. Stored rows age out with the coverage window; nothing needs deleting for
   correctness. If §1.7 requires deletion on termination, delete
   `tv_airings`/`tv_stations` rows with `provider_id='tv_media'`.
4. Revert `licensing: 'confirmed'` so no later deploy silently re-enables.

Rollback needs no deploy. That is deliberate.
