# BACKLOG.md — living work queue

Updated at the end of every work order per the Working Agreement in
`CLAUDE.md`. Sections: **Now**, **Next**, **Blocked**, **Done**.

## Now
- **Card interaction model — awaiting live acceptance.** Both
  `claude/card-interaction-model-m3ezx2` and `claude/card-interaction-model`
  now point at the SAME commit (the latter was fast-forwarded, nothing
  rewritten) — they are synonyms, not alternatives. All six milestones
  complete; desktop 44/44, search-routing 21/21, vitest 3010.
  **Action needed from you:** accept or reject the desktop hover preview on a
  real deploy — 380ms is a judgement call, and whether a preview reads as a
  response or as a twitch is not something a test can answer.
  **Preview URL could not be resolved from the container, and it is a
  credentials gap, not a network one:** `*.vercel.app` and `api.vercel.com` are
  both reachable (production returns 200), but there is no Vercel token in the
  environment, `vercel login` needs a browser, no `.vercel/project.json` exists,
  the repo records no team/scope slug, this session's GitHub access exposes no
  deployments/statuses API, and the branch has no PR for the Vercel bot to
  comment on. Opening a PR, or supplying `VERCEL_TOKEN` (or just the scope
  slug), unblocks it in one step.
- **Two-across phone tiles — awaiting live acceptance** on
  `claude/watchverdict-mobile-tests-rj2zey`. Pushed, not merged, production
  untouched. Mobile suite 1030/1032 with the one remaining failure documented
  as pre-existing (see Blocked). **Action needed from you:** open the Vercel
  preview for that branch and accept or reject the design — the agent
  environment's network policy denies `*.vercel.app`, so no session here can
  fetch a preview URL to confirm it is READY.

**Action needed from you (unchanged):** open `/admin/migrations` on
production and apply pending migrations with your `MIGRATE_SECRET` — see the
"Restored: /admin/migrations" entry below for why this is currently required
and what it unblocks.

## Next
- **Licensed channel-logo source for the Full Guide.** Guide rows now show the
  channel name once beside a stable colour mark; the old monogram chip was
  derived from the name and read "OXY OXYGEN" / "HBO HBO". Real logos are not
  possible with what we hold: TMDB's `logo_path` covers streaming PROVIDERS,
  not broadcast networks, and TVmaze networks carry no image. Wiring real
  channel artwork is a licensing/data decision, not a UI one.
- **A phone tile is ~590px tall.** Two across is a large improvement on one
  column of sideways cards, but the poster is only ~257px of that at 390 — the
  action row, the score panel and the availability block carry the rest. If
  browsing should show more than four titles a screen, the next lever is the
  score panel (badge, label and call currently stack on a narrow card).
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
- **`maxRuntime` never reaches the finder query from a typed ask.**
  `wired-experience.spec.ts:238` asks for "a fast mystery movie under 100
  minutes" and expects `query.maxRuntime === 100`; it gets `null`. Verified
  PRE-EXISTING — it fails identically on `350d874` with no branch changes
  applied — and it is the only failing test in the mobile suite. The
  deterministic detector for that exact phrasing already exists
  (`src/lib/nlu/detectors.ts:424`), so this is a WIRING gap: the finder's ask
  path takes the AI parse (`askParse.ts`), which returns nothing without
  `OPENAI_API_KEY`, and never falls back to the detector.
  Deliberately NOT fixed on the two-across branch: it changes behaviour on a
  governed search surface, which under CLAUDE.md rule 9 requires a corpus run
  and a PASS→FAIL / FAIL→PASS delta against baseline `68a5a93`. That belongs
  in its own branch, not inside a card redesign. Owner decision.
- **`title-grid.spec.ts` had an unnamed wait; fixed. One residual unexplained
  observation, recorded rather than guessed at.** :281 failed once in a
  44-minute serial mobile run with `locator.click: Timeout 15000ms exceeded`
  waiting for `grid-like-100`.
  - **Fixed (real defect, in the test):** `open()` returned as soon as
    `data-testid="title-grid"` was visible — the CONTAINER, which renders while
    `items` is still null. Every test in the file therefore began interacting
    during the loading state and let the first click's actionability budget
    absorb the first fetch. It now waits for the round itself.
  - **Refuted (do not re-derive it):** the natural theory is that
    `toHaveCount(12)` after shuffle is satisfied by the round being LEFT, so the
    id read next is stale. A deterministic reproduction — delay only the second
    calibration response — showed it is not: `load()` calls `setItems(null)`
    first, so the old tiles are gone before the new ones land.
  - **Still unexplained:** the failure snapshot showed round-TWO titles while
    the test waited on a round-ONE id, which needs `seen` to be populated, which
    needs a completed `load()`. Not reproduced in 93+ executions (22/22 file,
    5/5 single, 66/66 at `--repeat-each=3` under 8-way CPU saturation, 88/88
    after the fix). If it recurs, keep `test-results/mobile-artifacts/` and the
    trace before doing anything else — that is what was missing this time.
  - NOT caused by the card-interaction work: the timed-out click happens before
    `RecommendationSlate` — the only thing in that import graph that mounts
    `TrailerMedia` — is ever rendered, and no file the changeset touches is in
    that page's import graph.
- **Score distribution audit.** The median appears compressed: four
  recommendations scored 79-91, all reading STREAM IT. Blocked on real title
  data existing in production — the local/dev catalog is synthetic fixture
  data (`catalog_titles`), so a distribution computed against it wouldn't be
  representative.

## Done
- **Card interaction model — all six milestones, on
  `claude/card-interaction-model-m3ezx2`.** HOVER = PREVIEW IT · CLICK =
  UNDERSTAND IT · FULL VERDICT = ANALYZE IT is now the whole desktop contract,
  and it is asserted as a contract rather than described in a doc. Milestones
  1–4 (shared pink WatchVerd1ct mark, structurally anchored action rows, More
  Info as a card expansion, evidence-only Why/Watch Out) landed earlier;
  this pass added:
  - **Hover-intent preview** (`src/lib/trailer/hoverIntent.ts` + a fourth play
    SOURCE in `TrailerMedia`). Built on the existing single-active slot, not
    beside it. 380ms dwell, lazy resolve, one preview grid-wide, muted, never
    on touch, honours reduced-motion and the Autoplay pref. The hover overlay
    is `pointer-events: none` so a running preview can never swallow the click
    that opens More Info — measured: without it, More Info stops opening on the
    card you are looking at.
  - **A real desktop Playwright project** (`playwright.desktop.config.ts`, port
    3212, `npm run test:desktop`) — 44 tests, plus screenshot artifacts in
    `test-results/desktop/`. Deliberately a project, not a widened mobile
    viewport: hover depends on `pointerType` and `(hover: hover)`, which a
    resize cannot produce.
  - Every guard has a measured negative control, and the suite carries two
    anti-vacuity tests so "nothing happened" cannot pass against a dead fixture.
  See `docs/CARD-INTERACTION-HANDOFF.md`. Pushed, not merged; production
  untouched.
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
