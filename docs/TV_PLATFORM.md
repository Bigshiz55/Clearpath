# The television & streaming platform

How this deployment decides what it may call, what it may store, and what it
may show a user. Read the first section before deploying — production will not
serve listings without it.

---

## 1. `DATA_MODE` is REQUIRED in production

There is no production default. A production deployment with `DATA_MODE`
unset or set to anything unrecognised is a **`CONFIGURATION_ERROR`** and fails
closed:

- zero external provider requests, free adapters included;
- every ingestion adapter disabled — no lease taken, no run row written;
- `/api/health/tv` reports `verdict: "configuration_error"` naming the
  variable and its valid values;
- stored data keeps being served with its own freshness labelling;
- fixture rows still never reach an ordinary production user.

| Value | What it permits |
|---|---|
| `fixture` | Nothing leaves the box. Every adapter reads generated data. |
| `free_live` | Free, official, permitted sources may be called. Metered adapters still cannot spend. |
| `paid_live` | Metered adapters may spend — and only those whose own enable flag is also set. |

Outside production (local, tests, CI, preview) an unset value resolves to
`fixture`, because there the safe default is also the useful one.

**Why there is no production default.** An earlier revision defaulted
production to `free_live` so the free pipeline would keep running. That made an
unconfigured deployment indistinguishable from a deliberately configured one:
"nobody set this" and "somebody chose free_live" behaved identically, so a
missing variable — after an env wipe, a project migration, a new deployment
target — would silently start calling providers with nobody having decided
that it should.

### Metered adapters need a second key

`DATA_MODE=paid_live` alone is never enough. Each metered adapter also needs
its own flag set to exactly `"1"`:

| Adapter | Flag | Status |
|---|---|---|
| `tv_media` | `TVMEDIA_ENABLED` | Not set. TV Media makes zero requests. |

A metered adapter that reaches the egress guard while unauthorised is logged
as `[CRITICAL]` naming the caller, because an adapter arriving at a door it
may not pass means some caller believed otherwise.

---

## 2. One door to the outside world

Every adapter calls `requestEgress` before its first `fetch`.
`src/lib/viewing/adapters/egressContract.test.ts` enforces this by reading the
source, because the failure it guards against is the *next* adapter, written
by someone who has not read `dataMode.ts`.

The rules, in the order applied:

1. Preview deployments and `NODE_ENV=test` reach nothing.
2. An unconfigured production deployment reaches nothing.
3. `fixture` mode reaches nothing.
4. A `free` adapter needs `free_live` or `paid_live`.
5. A `metered` adapter needs `paid_live` **and** its own enable flag.

The one escape hatch is `__stubTransportForTest`, used by adapter suites that
replace `global.fetch`. A test asserts no non-test file references it.

---

## 3. Support stages

Nine rungs. A normal user sees data from a source only at `verified` or
`production_supported`.

`discovered → evaluated → fixture_tested → live_prototype → ingesting →
verified → production_supported`, plus `degraded` and `disabled` as states.

Promotion requires **three consecutive successful runs** plus thirteen other
conditions (`evaluatePromotion` in `supportStage.ts`). One successful scrape is
not sufficient, and that is enforced by a function, not remembered.

`degraded` stops a source CONTRIBUTING but its last valid dataset stays
readable — deleting the only listings we have because a refresh failed is a
worse answer than serving them with an honest freshness label.

---

## 4. Fixture mode

Deterministic from one seed. No network, no clock, no database.

```
npx tsx scripts/fixtureCorpus.ts count            # full scale, exact counts
npx tsx scripts/fixtureCorpus.ts count --small    # fast profile for iteration
npx tsx scripts/fixtureCorpus.ts simulate --days=30
```

Measured at the full profile: 50,000 titles · 250,000 episodes · 500,000
offers · 250 networks · 1,248,724 airings across 1,686 channels · 30 days,
generated in ~16 seconds.

Edge cases are generated deliberately and counted, because a corpus that
happens to contain no DST transition tests nothing about DST: stale offers,
dual-route offers, ambiguous title names, both DST transitions,
midnight-crossing programmes, undated episodes, and true-crime cases shared
across different series.

**Fixture rows can never reach a production user.** Two independent guards:
the public database views filter `is_fixture = false` and require a
user-visible stage (anon is granted the VIEWS, never the tables), and the read
layer filters again. They fail differently, which is the point.

---

## 5. Simulation clock

240 three-hourly cycles over 30 simulated days, in under a second.

Outages are injected as correlated **windows**, not independent coin flips: at
an independent 5% rate, three consecutive failures across 240 cycles is ~3%
likely, so the degradation and recovery paths reported "true" having never once
been exercised. Real provider failures are bursty.

Invariants checked every run: coverage never regresses, a failed cycle writes
nothing and does not advance coverage, a failed cycle still costs requests, the
source degrades after consecutive failures and recovers, the 14-day retention
floor holds, and `production_supported` is re-earned rather than restored.

---

## 6. Time handling

UTC is authoritative. Every airing also stores the source's own timezone and
its wall-clock string verbatim, so a DST-ambiguous hour can be re-derived
rather than guessed twice.

- **Repeated hour** (fall back): flagged `dst_ambiguous`; resolved to the
  earlier instant, which is what a broadcaster means by "1:30am" that night.
- **Skipped hour** (spring forward): flagged `dst_nonexistent`; resolved
  forward. The *label* is impossible, the broadcast is not.
- **Zones without DST** (Phoenix, Honolulu): never flagged.

Nothing is ever assumed to be Eastern.

---

## 7. Source feasibility

`src/lib/tv/sources/feasibility.ts`, served at `/api/tv/sources`.

Lawfulness ranks above convenience. Search-engine result pages, community
XMLTV grabbers, broadcaster page scraping and provider lineup lookups are all
recorded as `no_go` **with their reasons**, so the decisions stay visible
instead of being rediscovered later as clever ideas.

Usable today with no credentials: `fixture`, `tvmaze`, `tmdb`.

Blocked on something outside the codebase:

| Source | Needs |
|---|---|
| `schedules_direct` | an account and its credentials (~$25/year) |
| `tv_media` | a commercial licensing decision |
| `watchmode` | a commercial licensing decision (free tier is non-commercial only) |
| `gracenote` | a commercial licensing decision |

---

## 8. Free-live recording and replay

`src/lib/tv/sources/cassette.ts`. Record once, replay forever.

A cassette miss in `replay` mode **throws** rather than falling through to a
live request. Recording requires a deliberate ingestion run in an explicitly
configured live mode; tests, previews, fixture mode and page loads all resolve
to `replay` or `offline`.

Credentials never reach storage: TV Media authenticates with an `api_key`
*query parameter*, so URLs are redacted before hashing and before writing,
request headers are never stored, and the cassette key is stable across a
credential rotation because it identifies the resource, not the secret.

Conditional requests carry `ETag` / `Last-Modified`; a 304 keeps the recorded
body and is counted separately from a full response, because "400 requests"
and "400 requests of which 380 were 304s" are very different facts about a
rate limit.

---

## 9. Surfaces

| Route | Auth | Purpose |
|---|---|---|
| `/app/what-to-watch` | signed in | Streaming and linear in one list, every row stating its provenance |
| `/admin/tv` | — | Coverage and source-health dashboard, read-only |
| `/api/tv/watch-now` | public | The unified read |
| `/api/tv/sources` | public | Feasibility matrix |
| `/api/tv/coverage` | public | What this deployment can answer, and from where |
| `/api/health/tv` | public | Pipeline health, data mode, egress counts |
| `/api/admin/tv/sources` | admin | Stage evidence evaluation (never applies a stage) |
| `/api/admin/tv/simulate` | admin | Run the sync simulation on demand |
| `/api/admin/tv/egress` | admin | Did anything call out, and was it allowed |

Admin routes fail closed: an empty allowlist authorises nobody.

A normal user session generates **zero** requests to any provider. Reads come
from stored rows or generated fixtures; the egress guard enforces it rather
than leaving it to care.
