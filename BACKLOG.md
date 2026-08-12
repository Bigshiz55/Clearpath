# BACKLOG.md — living work queue

Updated at the end of every work order per the Working Agreement in
`CLAUDE.md`. Sections: **Now**, **Next**, **Blocked**, **Done**.

## Now
**Lifetime Movie Vault — code fixed, ONE production measurement outstanding.**
Four defects found and fixed (pack identity, an unselected column, a matcher
that used popularity as evidence, and a batch enrichment job that never
existed). The BEFORE numbers are the owner's production measurement; the AFTER
numbers cannot be produced from a dev container.

**Action needed from you:** run the diagnostic against production and paste the
result. It is read-only, admin-gated, and now reports the evidence mix rather
than just a survivor count:

    GET /api/admin/packs/eligibility?pack=lifetime-vault

Read `evidence.mediaKind` and `evidence.decidedBy`. If `film` is still ~0 after
`/api/cron/pack-enrich` has run a few ticks, the Vault's ceiling is set by
ingest breadth (20 distinct programmes on 3 stations), not by the filter — which
is a different problem with a different fix, and stop condition 5 stands.

**Showdown V3 phase 2 is on `claude/showdown-cold-start-scanner`, not merged.**
The evidence grammar, cross-session exposure memory, the `Both` control and the
canonical write path are done and gated (typecheck/lint/3300 tests/build/mobile
all green). What remains from the V3 brief is in **Next** below.

**Action needed from you:** open `/admin/migrations` on production and apply
pending migrations with your `MIGRATE_SECRET` — see the "Restored:
/admin/migrations" entry below for why this is currently required and what it
unblocks.

## Next
- **Lifetime: ingest breadth, not eligibility.** The Pack has 3 stations and
  459 recent airings collapsing to 20 distinct programmes. Even perfect
  classification cannot make 20 rows a browsable film library. Widening the
  Lifetime station set (LMN is mapped but may not be in the measured lineup) and
  deepening the airing window are the levers; the filter is not.
- **`release_year` is never written by either ingest writer.** `tvmazeWriter`
  and `tvMediaWriter` both omit it, so it is null on every ingested programme.
  That removes the single best disambiguator from title matching and forces
  `pickMatch` onto its strict uniqueness branch. Both providers carry a year;
  wiring it through would raise match rates across every Pack at once.
- **Crime Case Files gets no genres from TV Media.** The adapter sets
  `genres: []` because the documented contract has no genre field, and the
  `crime-cases` shape requires a genre to confirm. So TV Media rows can never
  qualify as cases. Needs a genre source, not a looser rule.
- **BLOCKER 1 — the 44-axis fingerprint still cannot reach the ranker.**
  Showdown reasons in 44 `TraitKey` axes; the ranker reasons in 15
  `DIMENSION_KEYS`. There is no bridge (`grep -rn "TraitKey" src/lib/preference/
  src/lib/dna.ts` → 0 matches), so `weirdness`, `ambiguity`, `characterFocus`,
  `sentimentality`, `cynicism`, `episodic` and `subtitles` are invisible
  downstream. Everything Showdown learns crosses as an attraction grade on a
  title and nothing else. Two options, both real work: (a) a verified
  `TraitKey → DIMENSION_KEYS` projection carrying per-axis confidence, or
  (b) extend `title_dimensions` to carry the texture axes and classify against
  them. (b) is correct and expensive; (a) is tractable and lossy. Inventing an
  unverified mapping is how the `lineup_id` class of defect happens.
- **BLOCKER 2 — the results screen ranks the diagnostic pool, not the catalogue.**
  `ShowdownResults.tsx` scores the 113 diagnostic titles with Showdown's private
  model instead of calling `rankByDna`. Now labelled honestly ("Closest matches
  in the game's catalogue") rather than presented as recommendations, but the
  real payoff needs an endpoint that ranks the actual catalogue against the
  freshly-written profile.
- **Pool expansion to 250–300 titles, with classification started first.**
  113 today at 67% `title_dimensions` coverage. `/api/cron/classify` runs 20
  titles per invocation, so a 300-title pool is ~15 cron runs of lead time
  before the chain is live — that has to start before the titles land, not
  after. Measured consequence of the current size: the exposure reserve keeps
  half the catalogue dealable, so sessions 1 and 2 never repeat but session 3
  can re-meet ~23 titles from session 1.
- **Turn on the AI orchestrator (owner action).** The provider-independent
  Claude discovery brain is built, tested, and shipped OFF (`AI_DISCOVERY_MODE`
  defaults to `legacy`). To evaluate it: set `ANTHROPIC_API_KEY` (server-only)
  and `AI_DISCOVERY_MODE=shadow`, watch the `ai_discovery_shadow` telemetry, then
  flip to `anthropic` once it proves out. See `docs/AI_DATA_ARCHITECTURE.md`.
- **Canonical TV data platform is shipped-dormant (owner-gated data work).**
  Migration `0044` defines the correct provenance-complete `canon_*/dist_*/
  linear_*` model, but it is fed only by fixtures and read by no production
  surface — the guide runs on legacy `tv_*` + `watchmode_availability`. Wiring a
  verified ingester into the canonical tables and bridging legacy → canonical is
  blocked on a data-licensing/credential decision (TV Media / Watchmode /
  Schedules Direct). Documented as the P1 sequence in `docs/AI_DATA_ARCHITECTURE.md`.
- **Semantic reference similarity via embeddings/pgvector.** Reference "like X"
  similarity is TMDB getSimilar + keyword/genre overlap today; `embed()` infra
  exists (powers DNA) but isn't wired into reference similarity yet.
- **Shared admin token gate across all `/admin` routes.** `/admin/content`
  and `/admin/feedback` each hand-roll the same `isAdminEmail()` +
  `notFound()` check independently — a shared gate (middleware or a small
  wrapper) would remove the risk of a future `/admin/*` route shipping
  without it.
- **Trial onboarding flow.** There's no first-run "try it before you commit"
  path for a brand-new visitor before they've built a taste profile — worth
  scoping once the accounts/feedback loop above has real usage to learn from.

## Blocked
- **Score distribution audit.** The median appears compressed: four
  recommendations scored 79-91, all reading STREAM IT. Blocked on real title
  data existing in production — the local/dev catalog is synthetic fixture
  data (`catalog_titles`), so a distribution computed against it wouldn't be
  representative.

## Done
- **Lifetime Movie Vault: four defects, one canonical resolver
  (`claude/card-interaction-model-m3ezx2`).** The Pack was showing Castle, The
  Rookie and Joyce Meyer. Four independent causes, each of which alone was
  enough:
  (1) **Identity.** `eligibility.ts` kept its own `Record<string, PackShape>`
  naming `lifetime-movie-vault` and `lifetime` — neither is a real slug. The
  production slug `lifetime-vault` was already declared in `PackSlug` in
  `packChannelMap.ts`; the untyped second table silently opted out of that
  union, so the Pack resolved to `open` and no filter ran. Now one resolver
  (`src/lib/packs/identity.ts`) keyed `Record<PackSlug, PackShape>`, so a Pack
  without a shape is a compile error and an invented slug cannot be written.
  (2) **An unselected column.** Browse declared `tmdb_media_type` OPTIONAL on
  its row interface and never selected it, so it read null on every row
  forever — the Vault would have rejected 100% of its programmes even in a
  perfectly matched database, and the admin diagnostic (which DID select it)
  was describing a different question than the page.
  (3) **No batch enrichment.** `tmdb_media_type` had exactly one writer,
  reachable only from `/api/packs/similar` when a user opens one title. 18 of
  20 programmes were null because nothing had ever asked. `/api/cron/pack-enrich`
  now backfills Pack programmes hourly.
  (4) **Popularity used as identity.** `resolveProgrammeTmdbId` fell back to
  `results[0]` whenever `release_year` was null — which is every ingested row —
  and wrote that as the programme's permanent identity. `pickMatch` now requires
  an exact normalized title and an unambiguous winner, narrowed by the
  provider's declared type.
  The general mechanism is `resolveMediaKind`: it reads
  `tv_programmes.programme_type`, written by BOTH ingest writers on every row
  since migration 0032 and never once consulted, plus season/episode numbering.
  No whitelist, no title-name vibes, no "Lifetime means movie" shortcut —
  unknown and conflicting evidence are both ineligible. And a filtered-empty
  Pack now says so instead of claiming the listings feed carried nothing.
- **Showdown: the evidence grammar (`claude/showdown-cold-start-scanner`).**
  The game collected one kind of evidence — which of two — which is confounded
  (several axes move at once) and is not an appetite (winning a comparison is
  not wanting something). Two follow-ups now recover exactly what a pick cannot
  carry, on a six-of-twenty interruption budget, never back to back:
  **why** names one axis from chips generated off the actual pair difference,
  and **how much** states an appetite for the winner. They are complementary by
  construction rather than by tuning — a reason TOPS UP the named axis to what a
  clean single-axis matchup would have paid and no further, and an appetite
  records only on the axes the pair AGREED on, which are precisely the ones the
  comparison was silent about. Negative-controlled: making the reason additive
  instead of a top-up fails 2 tests.
- **Showdown: "why do I keep seeing the same films?" — answered and fixed.**
  `StoredDna.usedTitleIds` was declared, initialised to `[]`, and never written
  or read; `seenTitleIds` was session-scoped. Measured with the memory disabled:
  **38 of 40 titles in session 2 were repeats from session 1.** Exposure is now
  a queue, not a set — the newest exposures are suppressed and the oldest
  released once suppression would leave less than half the pool dealable, so
  nothing repeats between consecutive sessions and the pool never starves.
- **Showdown: the canonical write path had no caller.**
  `recordShowdownSession` — the validated server action that writes
  `preference_events` — was referenced only by a doc comment and a test. A
  signed-in player's calibration reached localStorage and stopped there; the
  whole pure chain from a tap to a rank delta was proved in `downstream.test.ts`
  and never actually run. Now fired on a completed `dna` run.
- **Showdown: `Both` shipped as a control, and the defect that was waiting for it.**
  The verdict existed in the engine since the ledger split but had no button.
  Its canonical crossing had no branch either — it fell through
  `verdict === 'left' ? left : right` and filed "I want both of these" as a vote
  for whichever poster was on the right, discarding half the answer. The server
  action's zod schema also rejected `both` outright, which would have failed
  `safeParse` and discarded the entire session, not just that decision.
- **Showdown: `carriedTitleIds` separates carried-in from shown.**
  Found by a failing exposure test: `seenTitleIds` holds both the suppression
  list a run was seeded with and the titles it actually showed. Writing the
  whole thing back would re-stamp every avoided title as freshly seen, so the
  oldest exposures could never age out and the release policy would silently
  never release.
- **The three false channels are gone from production (`bcb1974`).**
  `NBC.com`, `ABC News Live` and `CBS News` — streaming feeds rendered as
  television channels — are removed from the data and the rendered guide.
  Measured, not asserted: rendered `/app/tv`, uncached, `network=` entries went
  2/4/1 → 0/0/0 while NBC 6→6, ABC 6→6, CBS 5→5 were untouched, and the station
  read returns `matched: 0`. One `CBS News` string survives in the HTML and is
  correct — it is inside the *summary* of "CBS Evening News" on the real CBS.
  - **Root cause was reachability, not identity.** The write-boundary fix (#41)
    and the purge (#43, #45) were both correct and both shipped; the purge sat
    above the LAST `return` of `runGatedTvIngest`, and two guard clauses return
    before it. Production sits permanently in the second one (`DATA_MODE=
    free_live`, tv_media metered → `paid_adapter_needs_paid_mode`), so the purge
    never executed in the only environment with rows to purge. The absent
    `purge` key in `/api/tv/refresh` was the symptom, misread twice as a
    deployment and then a caching problem. Fixed in #46: every exit routes
    through `withPurge`, so a future guard clause cannot skip it by being added
    above. `purgeReachability.test.ts` covers all three exits and fails 6/7
    against the old code.
  - **Stored identities (measured, previously assumed):** all three were
    `provider_id=tvmaze`, keys `tvmaze-net:{nbc-com,abc-news-live,cbs-news}`,
    all `carried: false`. Purge result: 3 stations, 37 airings deleted;
    `stationsConsidered` 120 → 117.
  - **Zero paid calls.** tv_media stayed `enabled: false`,
    `egressPermitted: false`, `egress_denied` throughout. Licensing still
    `unconfirmed`; Schedules Direct still `rejected`. Coverage copy still reads
    "Partial listings".
- **Column-level schema gate (`src/lib/schemaColumns.test.ts`).**
  `schemaContract.ts` reconciles "code needs this TABLE" with "the database has
  it"; nothing did the same for COLUMNS, because a `.select('a, b, c')` is a
  string that typecheck, lint, build and tests are all blind to. Written after
  the station diagnostic shipped selecting `tv_stations.lineup_id`, which does
  not exist — PostgREST rejects the whole select, so the endpoint built to stop
  the guessing returned an error and answered nothing, costing a deploy. Parses
  the migrations (incl. multi-column ALTER, DROP and RENAME) and checks every
  `.from().select()` in `src/`. Conservative by construction: only tables it
  parsed, only plain column lists, skipping `*` and embedded-resource syntax.
- **`getEpisodesWaiting` was silently returning nothing for every user.**
  Found by the gate above. It selected AND ordered by
  `watchlist_items.updated_at`, a column that has never existed (the table has
  `added_at`/`watched_at`), so the query errored, `data` was null, `rows` fell
  back to `[]`, and "episodes waiting" looked exactly like an empty watchlist.
  Now ordered by `added_at`. **Worth a second look:** `added_at` preserves the
  evident intent (most recently added first), but if the list was meant to
  track activity rather than addition, the right fix is an `updated_at` column
  with a touch trigger rather than a different ordering — that is a product
  call, not a mechanical one.
- **Temporary station diagnostic added and removed (#47, #49).** Existed only
  to read the real stored identities and prove the purge landed; removed once
  it had, and its route now 404s in production. Kept ungated for the incident
  because `/api/tv/coverage/channels` — the equivalent whole-table endpoint —
  is founder-gated and unusable without credentials; leaving a second, ungated
  one beside it permanently would have quietly undone that decision.
- **National-breadth TVmaze ingest (broaden-only).** Extracted the
  `MAJOR_US_NETWORKS`/`isMajorUsNetwork` allowlist out of `onTv.ts` into a
  shared pure module `src/lib/viewing/ingest/nationalNetworks.ts` (plus a
  `networkSlug` helper) so the live guide path and the new ingest share ONE
  source of truth; the live path is a byte-for-byte refactor. Added
  `runTvmazeNationalIngest` in `tvmazeWriter.ts`: same `us-national` lineup and
  reconcile machinery, but the BROADER `isMajorUsNetwork` filter (~80 networks)
  instead of `matchChannel`, synthesized `tvmaze-net:<slug>` stations, no
  per-show premiere fan-out (premiere/repeat left null), and a
  `trigger:'national'` run row. Reconciliation is scoped per station-set on
  BOTH sides (curated read now `.in(station_id, curatedStationIds)`, national
  read `.like(provider_station_id, 'tvmaze-net:%')`) so neither ingest can
  expire the other's airings. Wired into `runGatedTvIngest` on its own
  `tvmaze_national` lock + independent once-per-UTC-day gate; surfaced in
  `/api/cron/tv-ingest` and `/api/tv/refresh`. Read paths untouched (that is
  the follow-up: route Highlights + easy-tv through the ingested tables). 14
  new pure tests; typecheck/lint/vitest/build all green.
- **AI + data platform architecture audit + typed tool boundary.** Inspected
  the real data layer (two Explore agents) and wrote `docs/AI_DATA_ARCHITECTURE.md`
  — the 11-part audit (current/target maps, gap analysis, source matrix,
  canonical-DB status, changes, preserve-list, migration/AI-cost/licensing risks,
  sequence). Key finding: the data platform is already mature and largely
  compliant (linear/streaming separation, provenance, freshness, DST-correct
  time, egress control), and the canonical model (`0044`) is correct but
  shipped-dormant. Structural change: formalized the AI's data access as a named,
  bounded, telemetried **typed tool boundary** (`src/lib/ai/tools.ts`) — Claude
  never sees SQL or a service-role key — and routed `discoveryBridge` through it.
  Added §32 architectural-separation tests (TV fact paths import no LLM; the
  Anthropic SDK is confined to its one adapter; the interpreter defers exact-
  title/person/live-TV to deterministic handlers). Added the missing
  `MDBLIST_API_KEY` to `.env.example`. Gates: typecheck, lint, 2948 tests, build
  all green. (`feat(ai): architecture audit + typed tool boundary`)
- **Provider-independent AI orchestrator foundation.** `src/lib/ai/` — Claude as
  the interpreter behind a swappable `AiProvider` interface, `CanonicalDiscoveryRequest`
  + strict validation (the trust boundary), QUALIFY-FIRST canonical→query mapping,
  cost/usage telemetry (metadata only), safe degradation, `AI_DISCOVERY_MODE`
  (legacy default = zero production change). (`feat(ai): provider-independent AI
  orchestrator foundation`)
- **Restored `/admin/migrations` and `/api/admin/migrate`.** Root-caused the
  Hallmark Universe Pack showing "Nothing ingested yet" / "No premieres in
  the next 6 weeks" with every section empty and no error banner: `feat(build):
  run migrations automatically on deploy` deleted the manual migration route
  in favor of an automatic `npm run migrate && next build` step; that step
  broke five consecutive production deploys and was reverted
  (`revert(build): remove migration step from build pipeline`), but the
  manual route was never brought back. Net effect since Jul 31: no
  mechanism at all, automatic or manual, applies anything registered in
  `pendingMigrations.ts` after that point — migration 0038
  (`pack_ingest_runs` + the `pack_try_start_ingest`/`pack_finish_ingest`
  RPCs the lazy self-ingest on every Pack page depends on) is a prime
  suspect for never having reached production. Restored the route, the
  page, and the `ApplyMigrationsButton` component byte-for-byte from their
  last-known-good version (a plain request-time API route, never part of
  the build command, so not implicated in the deploy failures that caused
  the revert). **This alone doesn't fix the Pack page** — someone with the
  `MIGRATE_SECRET` needs to actually visit `/admin/migrations` and click
  Apply; verify the Pack page afterward. (`fix(admin): restore migration
  route after five-deploy-failure revert left it permanently missing`)
- **Docket badge labeling and persistent docket bar** — the "W" badge is now
  a labeled Gavel+"Docket" pill, and the corner floating Gavel button is a
  full-width bottom bar stating "N on your docket · Hit the Gavel," reviewable
  before ruling, with a one-time coach line. (`fix(docket): label the badge,
  persistent docket bar`)
- **Automatic migrations on deploy, build stamp, branch guard** —
  `npm run migrate` already ran automatically as part of `npm run build`; this
  added the missing piece: a build-time guard that fails if any
  `supabase/migrations/*.sql` file is unregistered (it caught a real, live
  instance — `0033_voice_dna` was neither registered nor excluded), a branch
  guard that fails a production build off the wrong branch, `/api/version`,
  and a footer build stamp. (`feat(build): automatic migrations, build stamp,
  branch guard`)
- **Magic-link accounts and in-app feedback reporter** — passwordless email
  sign-in, with anonymous-session data merged into (never silently replacing)
  an existing account, plus a persistent in-app feedback control. This also
  resolves the "anonymous data loss on /login sign-up" concern below — an
  anonymous session upgrading to email is an in-place link (same user id, no
  data movement), and a genuine two-account collision prompts merge-or-discard
  rather than picking one silently. Not independently re-verified against
  production since implementation — worth a quick real-world check next time
  someone touches auth. (`feat(auth): magic-link accounts and in-app feedback
  reporter`)
