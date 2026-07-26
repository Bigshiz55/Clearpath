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

Either path needs no code change.
