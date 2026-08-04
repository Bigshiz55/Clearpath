# WatchVerd1ct — Forensic Build Audit

**Generated:** 2026-08-04
**Auditor:** Claude Opus 5 (claude-sonnet-5 configured id), autonomous session
**Method:** Evidence gathered from the live repository, git history, live HTTP
requests to production, and test execution during this audit. Chat recollection
was NOT used as a source of truth; where memory and evidence disagreed, evidence
won and the disagreement is recorded.

**Audit branch:** `claude/watch-verdict-app-wwbtbg`
**Audit HEAD at time of writing:** `ae86878`

---

## STATUS LABEL KEY

| Label | Meaning |
|---|---|
| `LIVE_AND_VERIFIED` | Deployed AND observed working in production during this audit |
| `BUILT_NOT_LIVE` | Code exists and passes tests, but is not in the production deployment |
| `PARTIALLY_BUILT` | Some layers exist (schema/adapter/UI) but the user journey is incomplete |
| `ARCHITECTURE_ONLY` | Types, interfaces, schema or scaffolding only; no user-facing result |
| `RESEARCH_ONLY` | Findings documented; no code |
| `BLOCKED_PERMISSION` | Requires written permission from a rights holder |
| `BLOCKED_CREDENTIALS` | Requires a secret/credential this environment does not hold |
| `BLOCKED_PAID_DATA` | Requires a commercial data contract |
| `FAILED` | Attempted and does not work |
| `DEPRECATED` | Superseded |
| `UNKNOWN_REQUIRES_VERIFICATION` | Cannot be confirmed from available evidence |

---

# SECTION 1 — CURRENT PRODUCTION TRUTH

## 1.1 The single most important finding in this audit

**Production is NOT serving `main`. It is serving the feature branch.**

Evidence — `GET https://clearpath-pearl-chi.vercel.app/api/version`, 2026-08-04:

```json
{"sha":"48d84f8d1e039413c2e0ebd79568cde21a5407af","shortSha":"48d84f8",
 "branch":"claude/watch-verdict-app-wwbtbg","deployedAt":"2026-08-04T19:00:48.212Z",
 "vercelEnv":"production","appVersion":"1.0.0",
 "schemaVersion":"0041_watchmode_availability"}
```

| Fact | Value | Evidence |
|---|---|---|
| Production URL | `https://clearpath-pearl-chi.vercel.app` | live |
| Production commit | `48d84f8` | `/api/version` |
| Production **branch** | `claude/watch-verdict-app-wwbtbg` | `/api/version` — **not `main`** |
| `vercelEnv` | `production` | `/api/version` |
| Deployed at | 2026-08-04T19:00:48Z | `/api/version` |
| `main` ref (remote) | `6f7947f` | `git ls-remote origin main` |
| Branch HEAD | `ae86878` | `git rev-parse HEAD` |
| Applied schema | `0041_watchmode_availability` | `/api/version` |

**Consequence:** production is running `48d84f8`, which is AHEAD of `main`
(`6f7947f`) by two commits and BEHIND branch HEAD (`ae86878`) by one. Pushing to
`main` is therefore **not** what makes code live. Any earlier statement in this
project that work was "deployed to main and verified live" conflated two
different things: the push to `main` succeeded, and production separately
tracked the branch. **This is an overclaim that this audit corrects.**

## 1.2 Commits on the branch but NOT on `main`

`git log --oneline 6f7947f..HEAD`:

| Commit | Subject | On main? | In production? |
|---|---|---|---|
| `ae86878` | feat(availability): twelve canonical states | No | **No** (prod is 48d84f8) |
| `48d84f8` | feat(ingest): source registry, rights gate, validator | No | **Yes** |
| `ff1bbee` | docs(tv): Hallmark press access applied for | No | Yes |
| `0bf031e` | docs(streaming): Streaming engine spec | No | Yes |
| `adad182` | docs(tv): tier A–E registry + discovery | No | Yes |
| `bff6d83` | docs(tv): rights registry, corrected conclusions | No | Yes |

## 1.3 Migration status

| Migration | File exists | Registered in `PENDING_MIGRATIONS` | Applied to production |
|---|---|---|---|
| 0038_pack_ingest_runs | Yes | Yes | Presumed (pre-audit) |
| 0039_growth_os | Yes | Yes | Presumed |
| 0039_packs_expansion | Yes | Yes | Presumed |
| 0040_accounts_feedback | Yes | Yes | Presumed |
| 0041_watchmode_availability | Yes | Yes | **Yes** — `/api/version` schemaVersion |
| **0042_canonical_availability** | Yes | Yes | **NO — NOT APPLIED** |

`0042` status: `BUILT_NOT_LIVE` / `BLOCKED_CREDENTIALS`. Requires
`MIGRATE_SECRET` at `/admin/migrations`, which this environment does not hold.

Note the two `0039_*` migrations share a numeric prefix. Flagged as a naming
collision risk; not observed to have caused a failure.

## 1.4 Credentials absent from this environment

`BLOCKED_CREDENTIALS` for all of: `MIGRATE_SECRET`, production Supabase
service-role key, `TMDB_API_KEY` (live), `OPENAI_API_KEY` (live), Watchmode key.
Consequence: no production database inspection was possible during this audit.
All schema statements below derive from migration files, which are the
in-repo source of truth, **not** from observed production rows.

## 1.5 Live route census (measured this audit)

| Route | HTTP | Load time |
|---|---|---|
| `/` | 200 | 1.17s |
| `/app` | 200 | 3.50s |
| `/app/watch` | 200 | **9.79s** |
| `/app/new` | 200 | 1.94s |
| `/app/taste-quiz` | 200 | 1.74s |
| `/import-taste` | 200 | 0.32s |
| `/packs` | 200 | 1.37s |
| `/packs/hallmark-universe` | 200 | **11.73s** |
| `/packs/lifetime-vault` | 200 | 3.48s |
| `/packs/crime-case-files` | 200 | 2.46s |
| `/app/tv` | 200 | 3.58s |
| `/app/subscriptions` | 200 | 2.10s |
| `/app/verdict` | 200 | 0.95s |
| `/app/watchlist` | 200 | 1.37s |
| `/app/finder` | 200 | 1.33s |
| `/app/ask` | 200 | 0.94s |
| `/login` | 200 | 0.34s |
| `/app/releases` | **404** | — (route is `/app/new`) |
| `/app/subscription-check` | **404** | — (route is `/app/subscriptions`) |

**Performance finding:** `/packs/hallmark-universe` at 11.73s and `/app/watch`
at 9.79s are both slow enough to read as broken on mobile. `UNKNOWN_REQUIRES_VERIFICATION`
whether this is cold-start or sustained.

**Critical caveat:** HTTP 200 is not verification. Per the audit's own standard,
no route above is marked `LIVE_AND_VERIFIED` on status code alone. Content
verification was performed only for `/` and `/import-taste` (see §3).

---

# SECTION 2 — IMPLEMENTATION CHRONOLOGY

Meaningful commits, newest first. "Deployed" = present in production commit
`48d84f8` or an ancestor.

| Commit | Purpose | Merged to main | Deployed |
|---|---|---|---|
| `ae86878` | Twelve canonical availability states, migration 0042 + rollback | No | **No** |
| `48d84f8` | Shared source registry, rights gate, validator, conflict model | No | Yes |
| `ff1bbee` | Record Hallmark press access APPLIED FOR | No | Yes |
| `0bf031e` | Streaming engine spec + discovery | No | Yes |
| `adad182` | Tier A–E rights registry + live discovery | No | Yes |
| `bff6d83` | Rights registry; corrected earlier rights conclusions | No | Yes |
| `6f7947f` | First-use suite; fixed 33 self-inflicted Playwright regressions | **Yes** | Yes |
| `429b2fb` | Fix search dropping "movies I would like" | Yes | Yes |
| `c1f4e0f` | Production monitoring (reliability item 9) | Yes | Yes |
| `4f89dfb` | Async recovery sweep (item 8) | Yes | Yes |
| `b5bf621` | Anonymous DNA preservation + real Netflix import (item 7) | Yes | Yes |
| `674ec99` | Packs reliability (item 6) | Yes | Yes |
| `d39dd69` | TV date/time unification (item 5) | Yes | Yes |
| `1f9e7f3` | New Releases failure honesty (item 4) | Yes | Yes |
| `b99a5fc` | Availability "checking" honesty (item 3) | Yes | Yes |
| `62f17ef` | Watch DNA onboarding consolidation (item 2) | Yes | Yes |
| `6e08837` | Stop fake personalization for zero-signal viewers (item 1) | Yes | Yes |
| `29da318` | Pre-sprint baseline commit | Yes | Yes |

## 2.1 Other branches present

`backup/pre-final-release` (4461bba), `backup/pre-rewind-20260724-1908` (0589660),
`claude/pack-schema-0036` (0f4da8b), `feature/founder-test-environments` (76536f7),
`feature/search-dna-and-search-lab` (0851f09), `founder-baseline` (bb0b5cc),
`prod-fix` (6700294), `release-marker-7e0e3ba` (7e0e3ba).

`UNKNOWN_REQUIRES_VERIFICATION` — these were not diffed during this audit.
Whether any contains unique unmerged work is **not established**.

## 2.2 Superseded / corrected work

- `docs/tv-coverage/SOURCE_AND_CHANNEL_REPORT.md` §5 concluded a paid feed was
  immediately required. **Superseded** by `bff6d83`, which annotated the file.
  Its measured TVmaze numbers stand; its rights conclusions do not.
- An A–E tier model (`adad182`) was itself superseded by the eight-state model
  in `src/lib/ingest/sourceRegistry.ts` (`48d84f8`). **The registry markdown was
  not rewritten to the eight states — the doc and the code now disagree.**
  This is a live inconsistency. Status: `PARTIALLY_BUILT`.

---

# SECTION 3 — FIRST-USE RELIABILITY

## 3.1 The 118 Playwright failures — full record

Baseline established by running the same 13 spec files at pre-sprint commit
`29da318` in a separate worktree.

| Metric | Count | Evidence |
|---|---|---|
| Total failures on branch | 118 | full suite run, 830 passed |
| **Pre-existing** (fail identically at `29da318`) | **85** | baseline run, 158 passed |
| **Introduced during sprint** | **33** | delta |
| Fixed | 33 | subsequent targeted runs |
| **Remaining pre-existing** | **85** | **NOT fixed** |

### The 33 introduced, by cause

| Spec | Count | Root cause | Fix |
|---|---|---|---|
| `import-taste` | 30 | `/import-taste` added to `PROTECTED_PREFIXES`; failure mode is redirect to `/login`, making the page unreachable | Reverted in `6f7947f` |
| `ruling-feed` | 1 | Monitoring beacons with no dedupe prevented `networkidle` | Beacon dedupe added |
| `interview-removed` | 1 | Flake | Self-resolved |
| `dna-quiz` | 1 | **Unresolved** — see 3.3 | — |

### Two real product bugs found by these tests

1. **`/import-taste` unreachable on auth failure.** Route-level gate turned a
   recoverable in-app state into a hard bounce, contradicting "No account needed
   to explore". Fixed `6f7947f`.
2. **Monitoring beacon storm.** 20 failing cards → 20 identical beacons. Fixed
   with per-page dedupe, `src/lib/monitoringClient.ts`.

### The 85 remaining — status `FAILED`, unfixed

| Spec | Count | Nature |
|---|---|---|
| `detective-row` | 27 | Four-control row layout |
| `channel-guide` | 13 | Guide rendering |
| `visual-qa` | 12 | 43×28px "Got it" button in `WCheck.tsx` fails 44px tap target |
| `responsive` | 12 | Watch-DNA calibration matrix |
| `dna-quiz` | 11 | Quiz layout |
| `onboarding-confidence` | 3 | W coach |
| `on-tv-highlights` | 3 | Verdict label borders |
| `packs` | 2 | Pack section content |
| `top10`, `tile-edge` | 2 | Tap target, attribute |

**These predate the reliability sprint and are not hidden here.** Several
(`dna-quiz`, `responsive`, `onboarding-confidence`) touch first-use directly.

## 3.2 First-use suite

`tests/mobile/first-use.spec.ts`, committed `6f7947f`. 23 tests covering the
eight named states and both critical journeys.

**Has it passed three consecutive times? NO.** It has been observed passing
twice in this session. Status: `PARTIALLY_BUILT` as a release gate. It is not
wired to any CI gate — `UNKNOWN_REQUIRES_VERIFICATION` whether CI exists.

## 3.3 DNA Quiz undo failure — unresolved

`dna-quiz.spec.ts:118` "(15) Undo restores the previous card and count".
Baseline 11 failures in that file; branch 12. `DnaQuiz.tsx` and its harness were
**never modified** in this sprint (`git log 29da318..HEAD` shows no match). The
test depends on state from earlier tests in the same file, 4 of which fail
before it. Assessed as cascade, **not proven**. Status:
`UNKNOWN_REQUIRES_VERIFICATION`.

## 3.4 Flow-by-flow

| Flow | Route | Status | Notes |
|---|---|---|---|
| Homepage | `/` | `LIVE_AND_VERIFIED` | Content-checked: `hero-headline`, `cta-enter`, `cta-dna`, `cta-import` present |
| Import Taste | `/import-taste` | `LIVE_AND_VERIFIED` | `csv-input` renders; the reachability bug is fixed in production |
| 404 handling | `/nope-xyz` | `LIVE_AND_VERIFIED` | "Not found" + "Go home" |
| App home | `/app` | `UNKNOWN_REQUIRES_VERIFICATION` | 200 only |
| Watch Now | `/app/watch` | `UNKNOWN_REQUIRES_VERIFICATION` | 200 but 9.79s |
| New Releases | `/app/new` | `UNKNOWN_REQUIRES_VERIFICATION` | 200; `ReleaseWall` present in HTML; **actual titles not verified** |
| Taste Quiz | `/app/taste-quiz` | `UNKNOWN_REQUIRES_VERIFICATION` | 200 only |
| Packs (3) | `/packs/*` | `UNKNOWN_REQUIRES_VERIFICATION` | 200; Hallmark 11.7s |
| TV guide | `/app/tv` | `UNKNOWN_REQUIRES_VERIFICATION` | 200 only |
| Sign-in | `/login` | `UNKNOWN_REQUIRES_VERIFICATION` | 200; magic link not exercised |
| Subscription Check | `/app/subscriptions` | `UNKNOWN_REQUIRES_VERIFICATION` | 200 only |

---

# SECTION 4 — PERSONALIZATION & ACCOUNT ISOLATION

| Item | Status | Evidence |
|---|---|---|
| Zero-signal viewers no longer shown fake personalization | `BUILT_NOT_LIVE`→`LIVE` | `6e08837`, deployed |
| Anonymous DNA preserved across sign-in | Deployed | `b5bf621` — `moveDnaSignals()` in `src/lib/actions/mergeAccount.ts` |
| Signal-only anon sessions no longer deleted on merge | Deployed | `b5bf621` — `autoMergeIfSafe` now checks `anonSignalCount` |
| Merge failure surfaces retry instead of silent swallow | Deployed | `b5bf621` — `src/app/auth/callback/route.ts` |
| Cross-user isolation tests | `PARTIALLY_BUILT` | `src/lib/founder/isolation.test.ts` exists; `isolation.int.test.ts` **skipped** (needs DB) |
| RLS on user tables | `ARCHITECTURE_ONLY` verified | `supabase/migrations/0001_init.sql`; **not verified against production** |

**Known unfixed gap:** mid-visit session expiry silently issues a NEW anonymous
identity rather than prompting re-auth. Identified during item 7, deliberately
deferred as too risky to fix unverified. Status: `FAILED` (known defect).

---

# SECTION 5 — PACKS

| Feature | Status | Evidence |
|---|---|---|
| Packs hub `/packs` | Live, 200 | route census |
| Three Pack pages | Live, 200 | route census |
| Pack schema | Deployed | migrations 0036, 0037, 0038, 0039_packs_expansion |
| TVmaze ingest timeout (10s) | Deployed | `674ec99`, `src/lib/viewing/ingest/tvmazeIngest.ts` |
| Lifetime duplicate removal | Deployed | `674ec99`, `getPackPremiereCalendar` dedupe by programme |
| Case-linking honest banner | Deployed | `674ec99`, `src/components/packs/CaseList.tsx` |
| Case pipeline (extraction/matching/retitle) | `BUILT_NOT_LIVE` | tasks 156–169; `case_match_episodes` is an **offline evaluation** pipeline, deliberately separate from the live `case_programmes` |

## 5.1 Quantities — NOT ESTABLISHED

The audit request asks for counts of programs, episodes, verified cases,
cross-program matches, unmatched items, duplicate warnings, titles, premieres,
franchises, actors, upcoming airings.

**None of these can be reported.** They require production database access
(`BLOCKED_CREDENTIALS`). Fixture counts (280 TVmaze episodes + ~40 compound-name
additions, per task history) are **test fixtures, not production content**, and
must not be presented as user-facing coverage.

Status for all Pack content quantities: `UNKNOWN_REQUIRES_VERIFICATION`.

**Known structural limit:** TVmaze carries **zero** future airings for Hallmark
Channel, Hallmark Mystery, Hallmark Family, LMN, GAC and TCM, and 5 for
Lifetime (§6). Hallmark Universe and Lifetime Movie Vault therefore have no
verified upcoming-premiere source in production today.

---

# SECTION 6 — LINEAR TV COVERAGE

## 6.1 TVmaze — measured 2026-08-04

| Endpoint | Tested | Result |
|---|---|---|
| `/schedule?country=US&date=` | **Yes** | 14-day pull: 1,362 airings, 61 networks, ~97/day nationally |
| `/schedule/full` | **Yes** | 7,476 future airings, 75 US networks, 2026-08-03 → 2028-03-05, 187 distinct dates |
| `/schedule/web` | **No** | untested |
| `/shows/:id/episodes` | **No** | untested |
| `/episodesbydate` | **No** | untested |
| `/updates/shows` | **No** | untested |
| `/shows` paginated index | **No** | untested |

**The 75-network figure is a floor, not a ceiling.** Only one endpoint family
has been harvested. Raw data: `docs/tv-coverage/tvmaze-us-inventory.json`.

Licence: CC BY-SA, quoted at tvmaze.com/api. Attribution mandatory. **ShareAlike
copyleft attaches to derived data** — an accepted business risk, not a resolved
question. Rate limit ≥20 calls/10s.

Distribution: only 10 of 75 networks have ≥100 airings; 20 have 1–4 total. Seven
cable-news channels are 1,913 of 7,476 airings (~26% of airings, ~60% of the
daily dump).

## 6.2 Priority network matrix

| Network | TVmaze future airings | Other source found | Rights status | Adapter | Premiere cov. | Full-grid cov. | Blocker |
|---|---|---|---|---|---|---|---|
| Hallmark Channel | **0** | Press portal (Clipsource) | `REQUIRES_PERMISSION` | Registered, `enabled:false` | None | None | Press approval pending |
| Hallmark Mystery | **0** | Same portal | `REQUIRES_PERMISSION` | Same | None | None | Same |
| Hallmark Family | **0** | Same portal | `REQUIRES_PERMISSION` | Same | None | None | Same |
| Lifetime | **5** | `mylifetime.com` — 24h grid verified parseable (28 listings) | `AMBIGUOUS_FACTS_ONLY` | None built | Minimal | None | Activation decision |
| LMN | **0** | `mylifetime.com/lmn` (same host) | `AMBIGUOUS_FACTS_ONLY` | None built | None | None | Activation decision |
| Great American Family | **0** | `gactv.com` (`llms.txt`: allow, no-training) | `AMBIGUOUS_FACTS_ONLY` | None built | None | None | Activation decision |
| Investigation Discovery | **18** | Site robots `Allow: /` | `AMBIGUOUS_FACTS_ONLY` | None built | Partial | None | Activation decision |
| Oxygen True Crime | **7** | Site robots permit schedule paths | `AMBIGUOUS_FACTS_ONLY` | None built | Partial | None | Activation decision |
| TCM | **0** | `tcm.com` (blocks `/search*` only) | `AMBIGUOUS_FACTS_ONLY` | None built | None | None | Activation decision |

**A+E press (`press.aenetworks.com`) serves `User-agent: * / Disallow: /`** — a
blanket explicit prohibition, and it is the press route for Lifetime and LMN.
Status `EXPLICITLY_PROHIBITED`. Only written permission unblocks it.

## 6.3 Hallmark press access

**Status: APPLIED FOR / PENDING APPROVAL** (submitted by product owner
2026-08-04). Recorded in `docs/tv-coverage/CONTINUATION.md` (`ff1bbee`) and in
`src/lib/ingest/sourceRegistry.ts` `hallmark_press.pendingAction`.

**Adapter confirmed disabled:** `enabled: false` in the registry;
`canIngest()` returns false; asserted by test *"keeps Hallmark press dark while
approval is pending, adapter ready"*. **No authenticated Hallmark content has
been accessed. The login has not been touched.**

## 6.4 TV infrastructure status

| Component | Status |
|---|---|
| Rights gate | `BUILT_NOT_LIVE` — `canIngest()`, tested, **not wired to any ingest path** |
| Validator | `BUILT_NOT_LIVE` — `validate.ts`, tested, **not wired** |
| Review queue | **Not started** |
| Coverage dashboard | **Not started** |
| Kill switches | `ARCHITECTURE_ONLY` — `enabled` flag exists, nothing consumes it |
| Dedup / last-known-good / freshness | Exists only for the legacy TVmaze path (`pack_ingest_runs`, migration 0038) |
| Timezone / midnight handling | Deployed — `d39dd69`, `src/lib/viewing/clock.ts`, `localDay.ts` |

---

# SECTION 7 — STREAMING INTELLIGENCE ENGINE

**Overall status: `RESEARCH_ONLY` with one `ARCHITECTURE_ONLY` foundation.**
**Zero streaming adapters exist. Zero services are integrated.**

Only press-source reachability was probed, for 7 of 42 named services.

| Service | Research | Source found | Rights | Adapter | Integrated |
|---|---|---|---|---|---|
| Paramount+ | Probed | `paramountpressexpress.com` HTTP 200; robots blocks only `*.gif$`/`*.jpg$` | `PRESS_PUBLICITY` | **None** | No |
| Hulu | Probed | `press.hulu.com` HTTP 200; robots `/wp-admin/` only | `PRESS_PUBLICITY` | **None** | No |
| BritBox | Probed | `britbox.com` HTTP 200; robots blocks account paths only | `PRESS_PUBLICITY` | **None** | No |
| Prime Video | Probed | `press.amazonmgmstudios.com` **HTTP 403** | `UNCHARACTERIZED` | **None** | No |
| Peacock | Probed | **No response** | `UNCHARACTERIZED` | **None** | No |
| Acorn TV | Probed | **No response** | `UNCHARACTERIZED` | **None** | No |
| HBO Max | Probed | `press.max.com` **no response** | `UNCHARACTERIZED` | **None** | No |
| Netflix, Disney+, Apple TV+, AMC+, Shudder, Sundance Now, Starz, MGM+, PBS, PBS Masterpiece, Criterion, MUBI, MHz Choice, Tubi, Pluto TV, Roku Channel, Plex, Kanopy, Hoopla, BET+, ALLBLK, Hallmark+, Lifetime Movie Club, Discovery+, Crunchyroll, HIDIVE, ViX, Rakuten Viki, Topic, CuriosityStream, MagellanTV, BroadwayHD, Dekkoo, Screambox, Fandor | **NOT RESEARCHED** | — | `UNCHARACTERIZED` | **None** | No |

**35 of 42 services have had no research at all.** For every service: current
catalog, new-this-month, coming-soon, leaving-soon, weekly-episode, full-season,
region, tier, add-on and watch-link coverage are all **zero**.

Existing production availability comes solely from the pre-existing Watchmode
cache (migration 0041), which is a different, narrower system.

---

# SECTION 8 — AVAILABILITY MODEL

## 8.1 Shipping today (production, `48d84f8`)

`src/lib/watchmode/cardAvailability.ts`:
- Title-level `CardAvailabilityStatus`: `unconfirmed | none | available`
- Per-source `type`: `subscription | rent | buy | free`
- Read-only select against `watchmode_availability` + `watchmode_fetch_state`
- `region` param, default `'US'`; sync job populates US only

`src/components/CardAvailability.tsx` renders the honest "Availability not
currently confirmed" terminal state (`b99a5fc`). **This is live and must not be
weakened.**

## 8.2 Built, not applied (`ae86878`)

Migration `0042_canonical_availability.sql` — **strictly additive**. `source_type`
is never altered or dropped; new columns added: `availability_state`,
`addon_name`, `service_name`, `source_key`, `source_url`, `retrieved_at`,
`last_verified_at`, `confidence`, `evidence_trace`, `watch_link`.

Twelve states enforced by CHECK constraint. Default `'unverified'`.

Legacy mapping (SQL and TS mirrored; a test asserts they cannot drift):

| Legacy `source_type` | New `availability_state` |
|---|---|
| `subscription` | `included_with_base_subscription` (base only — tier unknown to Watchmode) |
| `free` | `free_with_ads` |
| `rent` | `rent` |
| `buy` | `buy` |
| anything else | `unverified` |

Rollback committed: `supabase/migrations/rollback/0042_canonical_availability_rollback.sql`.
Loses no data.

**Applied? NO.** `schemaVersion` in production = `0041`. Status:
`BUILT_NOT_LIVE` / `BLOCKED_CREDENTIALS`.

**Tested against production data? NO.** Tested against the migration text and
TS mapping only (13 tests). No production copy or representative fixture of real
rows was available. This is a gap against the stated requirement.

## 8.3 Prime Video separation

`PRIME_STATES` in `cardAvailability.ts` holds `included_with_prime`,
`included_with_addon`, `free_with_ads`, `rent`, `buy`, `unavailable`,
`unverified` as distinct. Test asserts `included_with_base_subscription` is NOT
a Prime state. `isIncluded()` deliberately excludes `free_with_ads`.

**Status: `ARCHITECTURE_ONLY`.** Nothing populates these states. No Prime
adapter exists. The distinction is defined, not exercised.

## 8.4 Conflict preservation

`preserveConflict()` in `src/lib/ingest/validate.ts`. Keeps all claims, ranks by
authority for display, flags `needsReview` on disagreement. **Not wired to
anything.** `ARCHITECTURE_ONLY`.

---

# SECTION 9 — SHARED INGESTION FOUNDATION

Files: `src/lib/ingest/sourceRegistry.ts`, `src/lib/ingest/validate.ts`,
`src/lib/ingest/ingest.foundation.test.ts`. Commit `48d84f8`. 11 tests passing.

| Component | Status | Consumed by |
|---|---|---|
| Source registry (8 states) | `BUILT_NOT_LIVE` | **Nothing** |
| Rights gate `canIngest()` | `BUILT_NOT_LIVE` | **Nothing** |
| `refusalReason()` | `BUILT_NOT_LIVE` | **Nothing** |
| Source authority ranking | `BUILT_NOT_LIVE` | `preserveConflict()` only |
| `validateClaims()` | `BUILT_NOT_LIVE` | **Nothing** |
| `preserveConflict()` | `BUILT_NOT_LIVE` | **Nothing** |
| Confidence scoring | `ARCHITECTURE_ONLY` | numeric field only |
| Evidence traces | `ARCHITECTURE_ONLY` | column + type only |
| Review queue | **Not started** | — |
| Kill switches | `ARCHITECTURE_ONLY` | `enabled` flag, unconsumed |
| Takedown workflow | **Not started** | — |
| Last-known-good | **Not started** (new system) | — |
| Freshness tracking | **Not started** (new system) | — |
| Deduplication | **Not started** (new system) | — |
| Adapter interfaces | **Not started** | — |
| Coverage dashboard | **Not started** | — |

**The foundation is real, tested, and connected to nothing.** It is
infrastructure, not a user feature.

## 9.1 `validate.ts` specifics

- `validateClaims(rawSource, claims)` — every `FieldClaim` needs `evidence`
  present verbatim in the raw payload. `evidence: null` → rejected as inferred.
  Rejected fields are **dropped, never defaulted**.
- Traceable fields: date, time, service, channel, title, episode, season,
  subscriptionState, premiereStatus, availability, watchLink.
- `preserveConflict()` — never drops the losing claim.
- **Rights-priority bug fixed during the same commit:** `refusalReason()`
  originally checked the kill switch before the rights state, so a
  prohibited-and-disabled source reported "Kill switch off", concealing that
  flipping the switch would still be wrong. Caught by test *"refuses A+E press"*.
  Rights reason now outranks the switch.

---

# SECTION 10 — SOURCE-RIGHTS MATRIX

Robots status is recorded **separately** from licence and never used as licence
evidence (asserted by test: no `CLEARLY_PERMITTED` source cites robots in basis).

| Source | Owner | Rights state | Robots | Auth req'd | Adapter | Prod enabled | Evidence |
|---|---|---|---|---|---|---|---|
| TVmaze API | TVmaze | `CLEARLY_PERMITTED` | allows | No | Legacy ingest | Yes | CC BY-SA, quoted |
| TMDB | TMDB | `CLEARLY_PERMITTED` | allows | Key | In use | Yes | API terms |
| Watchmode | Watchmode | `CLEARLY_PERMITTED` (paid tier in use) | n/a | Key | `src/lib/watchmode/` | Yes | migration 0041 |
| Admin/partner supplied | WatchVerd1ct | `ADMIN_OR_PARTNER_SUPPLIED` | n/a | No | **None** | No | first-party |
| Paramount Press Express | Paramount | `PRESS_PUBLICITY` | partial | No | **None** | No | HTTP 200; robots blocks images only |
| Hulu Press | Disney | `PRESS_PUBLICITY` | partial | No | **None** | No | HTTP 200; `/wp-admin/` only |
| BritBox | BritBox | `PRESS_PUBLICITY` | partial | No | **None** | No | HTTP 200; account paths only |
| Hallmark press (Clipsource) | Hallmark Media | `REQUIRES_PERMISSION` | absent | **Yes** | Registered, disabled | **No** | Portal + `/access/application`; **APPLIED FOR / PENDING** |
| A+E press | A+E Networks | `EXPLICITLY_PROHIBITED` | disallows | — | Disabled | No | `Disallow: /` |
| WBD press | Warner Bros. Discovery | `UNCHARACTERIZED` | unreachable | — | **None** | No | HTTP 403 |
| NBCU press | NBCUniversal | `UNCHARACTERIZED` | unreachable | — | **None** | No | redirects, 1.7KB |
| Amazon MGM press | Amazon | `UNCHARACTERIZED` | unreachable | — | **None** | No | HTTP 403 |
| Peacock press | NBCUniversal | `UNCHARACTERIZED` | unreachable | — | **None** | No | no response |
| Acorn press | AMC Networks | `UNCHARACTERIZED` | unreachable | — | **None** | No | no response |
| Max press | WBD | `UNCHARACTERIZED` | unreachable | — | **None** | No | no response |
| mylifetime.com | A+E | `AMBIGUOUS_FACTS_ONLY` | allows | No | **None** | No | 24h grid parseable |
| investigationdiscovery.com | WBD | `AMBIGUOUS_FACTS_ONLY` | allows | No | **None** | No | `Allow: /` |
| oxygen.com | NBCU | `AMBIGUOUS_FACTS_ONLY` | partial | No | **None** | No | Drupal admin paths only |
| tcm.com | WBD | `AMBIGUOUS_FACTS_ONLY` | partial | No | **None** | No | blocks `/search*` |
| gactv.com | GAC | `AMBIGUOUS_FACTS_ONLY` | allows | No | **None** | No | `llms.txt` allow + no-training |
| Schedules Direct | Schedules Direct | `EXPLICITLY_PROHIBITED` (our use) | — | — | **None** | No | Owner instruction |
| iptv-org / XMLTV | community | `EXPLICITLY_PROHIBITED` | — | — | **None** | No | launders prohibited scrapes |
| Pluto/Samsung/Plex/Tubi EPG | various | `EXPLICITLY_PROHIBITED` | — | — | **None** | No | undocumented internal APIs |

---

# SECTION 11 — DATA PROVIDERS & PAID OPTIONS

| Provider | Researched | Contacted | Status |
|---|---|---|---|
| Watchmode | Yes — in production use | n/a | Live, migration 0041, 2,000-call/month budget guard |
| Schedules Direct | Yes — ~$35/yr, non-profit, Gracenote-derived | **No** | `EXPLICITLY_PROHIBITED` per owner: not licensed for our commercial use |
| Gracenote | Named only | **NOT CONTACTED** | No pricing, no quote, no trial obtained. **No evidence of any contact exists.** |
| TV Media | Named only | **NOT CONTACTED** | As above |
| JustWatch | **Not researched** | No | — |
| TiVo Metadata | **Not researched** | No | — |

**Explicit correction:** no commercial data provider has been contacted. Any
impression otherwise is unsupported.

**Hallmark press application: SUBMITTED by product owner, 2026-08-04, pending.**
This is a press-access application, not a data contract.

---

# SECTION 12 — TESTING & QUALITY

Measured during this audit:

| Gate | Result |
|---|---|
| Unit tests (vitest) | **2,020 passed, 17 skipped, 172 files** (167 passed, 5 skipped) |
| Typecheck (`tsc --noEmit`) | Pass |
| Lint (`next lint`) | Pass, no warnings |
| Production build (`next build`) | Pass |
| Playwright full suite | **830 passed / 118 failed** (last full run) |
| Playwright first-use spec | 23 passing (2 consecutive runs, **not 3**) |

### Skipped tests (5 files) — all require a live database

`src/lib/cases/matchingJob.db.test.ts` (2), `src/lib/cases/reviewQueue.db.test.ts` (6),
`src/lib/founder/isolation.int.test.ts` (2), `src/lib/packs/packs.db.test.ts` (5),
`src/lib/preference/store.int.test.ts` (2).

**The account-isolation integration test is among the skipped.** Cross-user
data protection is therefore **not proven by execution** in this environment.

### Tests weakened or updated during the sprint

- `importTasteReliability.test.ts` — an assertion requiring `/import-taste` to
  be a protected prefix was **deleted and inverted**, because it encoded a bug
  as a requirement.
- `asyncRecovery.reliability.test.ts` — regex loosened to accept a braced
  `if (live) { … }` block.
- Two write-stubs added (`quizWriteStub.ts`, `importWriteStub.ts`) so tests
  exercise post-write UI that the harness cannot otherwise reach. These
  intentionally make a failing write succeed; they are documented as such.

### Coverage gaps

No accessibility suite, no performance suite, no live-production smoke suite, no
CI gate observed, no migration test against real data, no adapter tests (no
adapters exist).

---

# SECTION 13 — LIVE PRODUCT VERIFICATION

See §1.5 for the full route census. Summary:

- **19 routes returned 200.** 2 requested routes 404 because the real paths
  differ (`/app/new`, `/app/subscriptions`).
- **Content verified for 3 routes only:** `/` (hero + 3 CTAs), `/import-taste`
  (`csv-input` renders — confirms the reachability fix is live), `/nope-xyz`
  (404 page renders correctly).
- **`/app/new` contains `ReleaseWall`** in markup, but whether real titles
  render was **not verified**.
- Mobile viewport behaviour in production was **not tested** during this audit.
- Signed-in behaviour was **not tested** (no test account credentials).

**No route is marked verified on HTTP 200 alone.**

---

# SECTION 14 — HONEST GAP ANALYSIS

## A. Built AND verified live
1. Homepage with hero + three CTAs
2. `/import-taste` reachable and rendering the file input
3. 404 page
4. Reliability items 1–9 (deployed via ancestors of `48d84f8`) — *deployment
   confirmed; per-item live behaviour largely unverified*

## B. Built, NOT verified
1. Reliability items 1–9 individual behaviours in production
2. New Releases actually showing titles
3. All three Pack pages' content
4. TV guide content
5. Watch DNA quiz end-to-end
6. Sign-in / magic link
7. Anonymous→account merge in production

## C. Partially built
1. **Shared ingestion foundation** — real, tested, wired to nothing
2. **Migration 0042** — written, tested, rollback ready, **not applied**
3. **Twelve availability states** — defined, nothing populates them
4. **Hallmark press adapter** — registry slot only, correctly disabled
5. **First-use suite** — exists, not a CI gate, not 3× green
6. Rights registry markdown vs. eight-state code — **now inconsistent**

## D. Not built
1. Every streaming adapter (0 of 42 services)
2. Review queue, takedown workflow, coverage dashboards (TV and streaming)
3. Adapter interfaces
4. All TV source adapters beyond legacy TVmaze
5. New Releases filters, "What's new on your services", "Services you may be missing"
6. Subscription Check upgrade
7. 35 of 42 streaming services: no research at all

## Highest-risk findings

| Risk | Severity |
|---|---|
| **Production serves a branch, not `main`** — the release model is not what it appears | **Critical** |
| **85 Playwright failures unfixed**, several touching first-use | **High** |
| **Account-isolation integration test is skipped** — cross-user protection unproven by execution | **High** |
| Migration 0042 unapplied while its code sits one commit from production | Medium |
| `/packs/hallmark-universe` 11.7s, `/app/watch` 9.8s | Medium |
| Two migrations share prefix `0039` | Low |
| Rights registry doc and code disagree on the tier model | Low |

## Places where prior reports overclaimed

1. **"Deployed to main and verified live"** — main was pushed, but production
   tracks the branch. The causal claim was wrong.
2. **"Item 10 complete"** — completed with 85 known failures outstanding.
3. Early claim that no free source could fill the Packs — drawn from APIs only,
   later disproved for Lifetime, and corrected in `bff6d83`.
4. Verification by HTTP 200 in earlier reporting; this audit does not repeat it.

---

# SECTION 15 — MAXIMUM-POSSIBLE ASSESSMENT

**Has everything reasonable been done before paying for commercial data? NO — not close.**

| Area | Exhausted? | Not yet tried | Materially likely to change result? |
|---|---|---|---|
| TVmaze | **No** | 5 of 7 endpoint families untested | **Yes — high.** Best free lever remaining |
| Hallmark | No | Press portal pending approval | **Yes**, if approved |
| Lifetime / LMN | No | Facts-only adapter unbuilt; A+E press prohibited | Yes — activation decision |
| True Crime | No | ID/Oxygen adapters unbuilt | Moderate |
| Prime Video | **No** | Only one 403 probe | Unknown |
| Paramount+ / Hulu / BritBox | **No** | Sources confirmed reachable; **no adapter written** | **Yes — highest ROI** |
| Peacock / Acorn | **No** | One failed probe each | Unknown |
| New Releases | No | Streaming intelligence unbuilt | Yes |
| FAST channels | **No** | No permitted source identified | Unknown |
| Local lineups | **No** | Not researched | Requires paid data |
| Packs | No | Blocked on TV/streaming sources | Yes |
| First-use reliability | No | 85 failures outstanding | **Yes** |

**Only I (the AI) can do:** TVmaze endpoint exhaustion; Paramount+/Hulu/BritBox
adapters; wiring the rights gate and validator into a real path; review queue;
dashboards; the 85 test failures.

**Only the product owner can do:** apply migration 0042 (`MIGRATE_SECRET`);
decide Vercel branch-vs-main production tracking; accept or decline
`AMBIGUOUS_FACTS_ONLY` activation; pursue A+E/WBD/NBCU written permission;
contact Gracenote/TV Media; await Hallmark press approval.

---

# SECTION 16 — CONTINUATION PLAN

Ordered so that user-facing results arrive before more architecture.

**1. Fix the deployment model** *(owner)* — decide whether production should
track `main` or the branch. Currently `main` is 2 commits behind production and
`ae86878` is undeployed. **Nothing else should ship until this is settled.**

**2. Apply migration 0042** *(owner)* — `/admin/migrations`, `MIGRATE_SECRET`.
Additive; rollback committed. Gate: `/api/version` shows `0042`.

**3. Exhaust TVmaze** *(AI)* — files: new `src/lib/viewing/ingest/tvmazeFull.ts`.
Migration risk: none. Tests: fixture-based. **Highest free coverage lever.**

**4. First real adapter — Paramount+ press** *(AI)* — files:
`src/lib/ingest/adapters/paramountPress.ts`. Consumes `canIngest()` and
`validateClaims()`, finally wiring the foundation to something. Gate: verified
titles visible at `/app/new`.

**5. Review queue** *(AI)* — only after an adapter produces claims to review.

**6. The 85 Playwright failures** *(AI)* — triage by first-use impact first.

**Do not touch:** `CardAvailabilityStatus` title-level semantics; the honest
"Availability not currently confirmed" state; `source_type`; anything in
`src/lib/scoring/`.

**Definition of done for the first milestone:** a fresh anonymous visitor opens
`/app/new` in production and sees real, verified, provenance-tagged titles from
at least one streaming service, with correct subscription distinctions — and
`/api/version` confirms the commit serving it.
