# TV schedule providers — evaluation, configuration, migration

WatchVerd1ct's Live TV guide needs a real listings grid. This documents what was
evaluated, what is recommended, how to configure it, and how to move to something
larger later.

## Why this exists

Two sources were carrying Live TV, and neither could do the job.

**TVmaze** was treated as the national schedule. Measured against the live API on
2026-07-26:

```
/schedule?country=US&date=<today>   →  42 rows for the ENTIRE US day
                                       ~20 networks
                                       next 6h window: 1 row
```

TVmaze's country schedule is an **episode-premiere feed**. It carries first-run
episodes on major networks and nothing else — no reruns, no syndication, no
movies, no daytime, no local affiliates, almost no cable. A six-hour US window
covers thousands of airings across hundreds of channels. TVmaze can never supply
that, and treating it as a grid is what produced the single-card guide.

**Gracenote's public grid** (`tvlistings.gracenote.com/api/grid`) is now behind an
AWS WAF bot challenge:

```
GET .../api/grid                 →  405 + "Human Verification" interstitial
GET .../api/grid (browser UA)    →  403 Forbidden
```

That endpoint was never a licensed interface, and it is now actively defended.
Working around a bot challenge would breach the terms and would stay brittle, so
it is **removed from the critical path** rather than patched. It is not replaced
by scraping.

Both failures were invisible because the call sites were `.catch(() => [])`. See
`src/lib/viewing/status.ts` for the typed statuses that replaced that.

## Evaluation

| Source | Coverage | Channels | Movies | Reruns | Local affiliates | Premium | FAST | Auth | Licensing | Cost | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Schedules Direct** | US + CA | Full lineups by ZIP | Yes, typed | Yes | Yes | Yes | Partial | Token (24h) | Explicitly licensed for apps | **$25/yr** | **Recommended** |
| Gracenote/Xperi (direct) | Global | Full | Yes | Yes | Yes | Yes | Yes | Enterprise key | Commercial contract | 5-figure/yr | Right at large scale |
| TMS / Tribune (direct) | Global | Full | Yes | Yes | Yes | Yes | Yes | Enterprise key | Commercial contract | 5-figure/yr | Same tier as Gracenote |
| Gracenote public grid | US | Full | Yes | Yes | Yes | Yes | No | None | **Not licensed; WAF-blocked** | Free | **Rejected** |
| XMLTV (generic) | Varies | Depends on feed | Varies | Varies | Rarely | Rarely | Rarely | Varies | Per-feed | Free–paid | Useful as a secondary adapter only |
| IPTV-Org EPG | Global, uneven | FAST/IPTV skew | Sparse | Sparse | No | No | Yes | None | Mixed, per-source | Free | Not sufficient alone; fine for FAST supplement |
| TVmaze | Global | ~20 US networks | No | No | No | No | No | None | Permissive | Free | Supplement only — **not a grid** |
| Per-network pages | One network each | 1 | Varies | Varies | Sometimes | N/A | N/A | Varies | Usually prohibits scraping | Free | Not viable to maintain |

### Recommendation

**Immediate, low cost: Schedules Direct.** A non-profit that exists to license
North American listings to exactly this kind of application. $25/year, documented
JSON API, full lineups by postal code including local affiliates, cable and
premium, with movies and reruns typed and roughly two weeks of forward guide. It
is lawful, cheap, complete, and stable — everything the public Gracenote grid was
not.

**Scalable commercial: Gracenote/Xperi direct**, once volume or international
coverage justifies a commercial contract. The adapter interface means that is a
new file, not a rewrite.

**Fallback strategy:** Schedules Direct (primary) → cached window (labelled
stale) → TVmaze premieres (clearly supplementary) → honest unavailable state.

**Migration path:** implement `ScheduleAdapter` (`src/lib/viewing/schedule.ts`),
give it a `priority` below the current primary, and register it. No calling code
changes. Nothing else in the product knows which provider answered.

## Configuration

All values are **server-only**. None may take a `NEXT_PUBLIC_` prefix; none are
logged, returned in an error body, or sent to the client. The adapter scrubs
hex-looking substrings from upstream error text before it is surfaced.

| Variable | Provider | Required | Format |
|---|---|---|---|
| `SCHEDULES_DIRECT_USERNAME` | Schedules Direct | Yes, to enable Live TV | Your account username |
| `SCHEDULES_DIRECT_PASSWORD` | Schedules Direct | Yes, to enable Live TV | Account password. Sent as a SHA-1 digest, per their API — never in plaintext, never stored by us |
| `SCHEDULES_DIRECT_LINEUP` | Schedules Direct | Yes | Lineup id, e.g. `USA-NY31534-X` |

With none of these set, the app reports `misconfigured` and says so on screen. It
does **not** show a thin list and imply it is the full schedule.

### Setup, step by step

1. Go to **https://www.schedulesdirect.org** and click **Sign Up**.
2. Create an account. Note the username and password you choose.
3. Pay the **$25** annual membership. (There is a free trial if you want to test
   first.)
4. Sign in to their member site and click **Lineups**.
5. Enter your postal code, pick your TV provider from the list (cable, satellite,
   or over-the-air), and **add** that lineup.
6. On the lineup page, copy the **lineup id**. It looks like `USA-NY31534-X`.
7. In Vercel: your Clearpath project → **Settings → Environment Variables**.
8. Add three variables, ticking **Production** and **Preview** for each:
   - `SCHEDULES_DIRECT_USERNAME` → your username
   - `SCHEDULES_DIRECT_PASSWORD` → your password
   - `SCHEDULES_DIRECT_LINEUP` → the lineup id from step 6
9. **Deployments → latest → ⋯ → Redeploy.** Environment variables are read at
   boot, so a redeploy is required.
10. Open `/api/health?probe=schedule`. It reports whether each variable is
    present and whether a token could be obtained — **never the values**.

Do not paste any of these into a chat, an issue, or a commit.

### Validating connectivity safely

`/api/health?probe=schedule` performs a token request and reports only:

```json
{ "configured": true, "tokenOk": true, "lineupStations": 218, "status": "healthy" }
```

No credential, and no listing data, appears in that response.

### Rotating credentials

1. Change the password on schedulesdirect.org.
2. Update `SCHEDULES_DIRECT_PASSWORD` in Vercel (Production + Preview).
3. Redeploy.

The adapter caches its API token in memory for 20 hours; a redeploy discards it,
so rotation takes effect immediately. Tokens are never persisted to disk or DB.

## Region and lineup notes

Schedules Direct is North America only. For other regions, register an XMLTV or
regional adapter with a lower priority — `resolveSchedule` will use whichever is
configured, and report `misconfigured` for regions with no provider rather than
silently returning nothing.

A single national lineup is a reasonable default for a v1; per-user postal codes
can be threaded through `ScheduleRequest.postalCode` without touching the
pipeline, which already carries the field.

---

# TV Media — the chosen production provider

TV Media is WatchVerd1ct's licensed primary listings provider. The architecture
stays provider-agnostic: TV Media is `priority 0` in the registry, and adding
Gracenote, TMS or any future source is a new file implementing `ScheduleAdapter`,
with no change to routes, components, ranking, tests or the result contract.

## Configuration

All server-only. None may take a `NEXT_PUBLIC_` prefix — an architectural test
(`src/lib/viewing/independence.test.ts`) fails the build if one ever does.

| Variable | Required | Format |
|---|---|---|
| `TVMEDIA_API_KEY` | **Yes** | The API key from your TV Media account. Sent as a request header, never a query parameter |
| `TVMEDIA_LINEUP_ID` | Yes (or ZIP) | Your market's lineup id |
| `TVMEDIA_DEFAULT_ZIP` | Yes (or lineup) | 5-digit US ZIP, used when no lineup id is set |
| `TVMEDIA_BASE_URL` | No | Overrides the API host — set only if TV Media gives you a sandbox endpoint |

With none set, `/api/health/schedule` reports `"No TV Media credentials
configured."` and the app runs in partial mode with an on-screen banner. It never
implies a complete schedule.

## Verifying the field mapping

The adapter was written before we held API access, so its field names are an
informed mapping (`FIELD_MAP` in `src/lib/viewing/adapters/tvMedia.ts`). It
accepts several aliases per field, which covers most naming differences. If the
first live call returns rows but maps zero, the adapter reports
`CONTRACT_MISMATCH` explicitly rather than looking like an empty schedule — then:

1. Save a sample response from TV Media to a file.
2. Run `validateContract(payload)` from that module.
3. It prints which fields resolved and which did not.
4. Correct `FIELD_MAP` accordingly. Nothing else changes.

## Migration to another provider

Implement `ScheduleAdapter`, give it a priority, add it to `adapters()` in
`src/lib/viewing/liveTv.ts`. That is the entire integration surface.

## Cron scheduling constraint

`/api/cron/tv-ingest` is deliberately **not** registered in `vercel.json`.

Vercel's Hobby plan allows two cron jobs, and those two are already taken by
`daily-scan` and `classify`. Registering a third fails the deployment outright —
which is exactly what happened, and it silently blocked two commits from
reaching production until the cause was traced.

Hobby also restricts cron frequency to once per day, so the hourly schedule this
route needs (each lineup runs at its own local 2 AM) is unavailable there
regardless.

The route itself is deployed and works. To schedule it:

* **On Vercel Pro** — add to `vercel.json` and redeploy:
  ```json
  { "path": "/api/cron/tv-ingest", "schedule": "0 * * * *" }
  ```
* **Staying on Hobby** — trigger it hourly from an external scheduler
  (GitHub Actions on a `schedule:` trigger, or Supabase's `pg_cron`) with the
  `CRON_SECRET` bearer token. The route's auth check is the same either way.

Either path needs no code change. As of the change that added TV Media
ingestion, this route runs BOTH writers on every tick: TVmaze at most once
per UTC calendar day, TV Media at most once every two hours (see "Cost
control" below). Both checks live in `tv_ingestion_runs`, so an hourly
external ping is a safe no-op in between either provider's own cadence.

## Full guide ingestion — how TV Media becomes the primary

`/api/cron/tv-ingest` → `src/lib/viewing/ingest/tvMediaWriter.ts` writes into
the same 0032 tables (`tv_stations`, `tv_programmes`, `tv_airings`) that the
pre-existing TVmaze writer already used — no new tables. The full guide's
read path (`src/lib/tv/ingestedGuide.ts`) queries `tv_airings` by time window
only, with no provider filter, so it was already provider-agnostic: once TV
Media rows exist, the guide is a merge of both writers automatically, no
route or component change required.

**Stations are discovered, not configured.** Unlike the TVmaze writer, which
matches against a hand-maintained ~30-channel list (`tvmazeChannels.ts`)
because TVmaze's feed carries no channel list of its own, TV Media's
`/listings` response IS the channel list — every station in the fetch becomes
a `tv_stations` row via `stationsFrom()`
(`src/lib/viewing/ingest/tvMediaIngest.ts`). A real key immediately yields
however many channels the lineup carries; nothing to hand-configure.

**Lineup handling (CHANGES §3).** One national default lineup, keyed off
whichever of `TVMEDIA_LINEUP_ID` / `TVMEDIA_DEFAULT_ZIP` is set — the same
default the query-time chain in `liveTv.ts` already used. A real per-user
lineup selector would need: (1) a `postal_code` (or provider account) column
on the user profile, collected once at signup or in settings; (2) the ingest
job parameterized to run once per DISTINCT lineup in use, not once globally —
straightforward with the existing `provider_lineup_id` key, just more rows in
`tv_lineups` and more calls, scaling with the number of distinct markets
actually in use, not the user count; (3) `getIngestedGuideAirings` filtered
by the viewer's `lineup_id` instead of reading across all lineups. None of
this is built — the "sensible default" acceptance criterion only asked for a
working single national lineup, which is what's here.

**Fallback behavior (CHANGES §7).** `runTvMediaIngest()` is a complete no-op
— zero DB writes, zero HTTP calls — whenever `TVMEDIA_API_KEY` is unset or
neither `TVMEDIA_LINEUP_ID` nor `TVMEDIA_DEFAULT_ZIP` is set. TVmaze's own
writer is unaffected and keeps running on its own daily schedule regardless,
so the full guide never goes blank: with no TV Media key it shows exactly
what it showed before this change (TVmaze's narrow Hallmark/Lifetime/crime
set), and the on-page coverage banner (`gridLive` in
`src/app/app/tv/page.tsx`) already reflects that narrowness from the real
row count, not a flag.

### Cost control (CHANGES §6)

TV Media's data refreshes upstream every two hours, so nothing here polls
faster than that. Two independent guards, both real code, not just policy:

1. **Cadence.** The cron route checks the most recent `tv_ingestion_runs` row
   for `provider_id='tv_media'` and skips the run entirely if one succeeded
   or partially succeeded within the last two hours.
2. **Monthly budget.** `TVMEDIA_MONTHLY_CALL_LIMIT` (optional, default
   unset/0 = unenforced — the real plan limit isn't known yet). When set,
   `evaluateBudget()` (`src/lib/viewing/ingest/budget.ts`, previously written
   but unused until this change) checks usage from `tv_call_ledger` before
   the run starts, and again before each individual call, so a run stops —
   never mid-call — the moment it would breach 90% of the configured limit.

**Expected call volume.** Each run fetches the lineup one calendar day at a
time — a conservative assumption, not a verified one (see "Verifying the
field mapping" above: TV Media's real pagination behavior is unconfirmed).
One call covers every channel in the lineup for that day, so **cost is
independent of lineup size** — a 40-channel market and a 400-channel market
both cost the same number of calls:

| Ingest scope | Calls per run | Runs/day (as shipped) | Calls/day | Calls/month |
|---|---:|---:|---:|---:|
| 14-day forward window (default `TVMEDIA_INGEST_DAYS`) | 14 | 1 (once daily) | 14 | ~420 |
| Same, if run at the maximum allowed cadence (every 2h) | 14 | 12 | 168 | ~5,040 |

As shipped, the cron route runs the full 14-day window once per day (well
under the 2-hour floor) — **~420 calls/month** is the number to size a plan
against. Every call is logged to `tv_call_ledger` regardless of budget
enforcement, so once real usage exists `SELECT count(*) FROM tv_call_ledger
WHERE provider_id='tv_media' AND requested_at >= date_trunc('month', now())`
gives the actual figure, not an estimate.

### Attribution (CHANGES §5)

A text credit + link to tvmedia.ca appears on `/app/tv`, next to the
existing TVmaze credit, gated on `isTvMediaConfigured()` — it only renders
once their data is actually in use. No logo: their brand-kit asset URL isn't
verified, and hotlinking a guessed one would be fabricating a resource that
doesn't exist. Add the real logo URL to the credit block in
`src/app/app/tv/page.tsx` once it's confirmed from their docs — everything
else about the credit's placement and gating stays the same.
