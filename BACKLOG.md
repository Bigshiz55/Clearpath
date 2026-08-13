# BACKLOG.md — living work queue

Updated at the end of every work order per the Working Agreement in
`CLAUDE.md`. Sections: **Now**, **Next**, **Blocked**, **Done**.

## Now
- **Critic Layer — `claude/critic-layer`.** GC8, GC1, GC2, GC3, GC4, GC5 and
  **GC6** and **GC7** complete red-then-green (185 critic tests). A comparative
  Ask runs the full pipeline, **the CriticPlan orders the response the user
  gets** (`decisionScore = matchScore + planNudge`, bounded ±10 and
  authority-scaled, durable Match still on the card), and each item carries a
  grounded **FOR THIS REQUEST** explanation generated from the same contribution
  trail that produced the order. Comparative intent is detected at a
  provider-independent boundary (`src/lib/critic/gate.ts`) so meaning does not
  depend on `AI_DISCOVERY_MODE`. **GC9** proves all five sources of meaning
  (anchors, DNA, relationship, modifiers, hard context) are causal at the
  correct stage, and **GC10** pins the original incident sentence end to end
  with a structural — never title-specific — mechanism. 236 critic tests.
  Ledger: `docs/CRITIC-SHIP.md`. Next gate is GC11 (latency budget + caching).

**Action needed from you:** open `/admin/migrations` on
production and apply pending migrations with your `MIGRATE_SECRET` — see the
"Restored: /admin/migrations" entry below for why this is currently required
and what it unblocks.

## Next
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
- **Consolidate `preference_rules` with canonical Taste DNA (separate
  migration).** GC6's audit proved a real semantic overlap: `slow_burn` (a
  legacy rule, +12 into `matchScore`) and low canonical `pacing` (a GC4 plan
  instruction, +9.77) are the same preference in two vocabularies, and both fire
  on the same candidate. Also `grounded_crime`↔realism/darkness,
  `noir`↔darkness/morality, `serial_killer`↔violence/darkness,
  `psychological_thriller`↔suspense/complexity. GC6 BOUNDS the overlap (critic
  capped at ±10) rather than removing it; removing it means a data migration
  touching `rankByDna`, `browse`, `/app/watch` and the legacy rules UI.
  Numbers in `docs/CRITIC-SHIP.md` → GC6 double-count finding.
- **`rankWithPreference` is dead production code — decide its fate.** It
  composes `objective + preferenceNudge + critic`, which is exactly the formula
  GC6's audit rejected (it would apply canonical DNA twice, since `buildPlan`
  already consumes it). GC6 deliberately did NOT wire it and built an explicit
  composition instead. It still has zero production callers and remains pinned
  by `productionWiring.test.ts`. Either delete it or narrow it to its GC8
  reporting role explicitly.
- **Two parallel personalization compositions exist by surface.** Ask/Finder
  uses `matchScore` (general + `preference_rules`); `/app/watch` and `browse`
  use `rankByDna` (`computeGeneralScore` + embedding + dim nudge + rerank +
  `preferenceNudge`). They never meet, and neither knows about the other. Worth
  a deliberate decision once the consolidation above is scoped.
- **Critic strand TMDB budget (GC11).** The critic path issues one `runFinder`
  per GC5 strand (up to `MAX_STRANDS = 5`, four for `better_than`). They run
  concurrently so wall-clock is roughly one strand, but the TMDB call budget is
  genuinely N×. Needs measuring and tuning against real pools.
- **Score distribution audit.** The median appears compressed: four
  recommendations scored 79-91, all reading STREAM IT. Blocked on real title
  data existing in production — the local/dev catalog is synthetic fixture
  data (`catalog_titles`), so a distribution computed against it wouldn't be
  representative.

## Done
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
