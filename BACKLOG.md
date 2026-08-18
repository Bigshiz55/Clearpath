# BACKLOG.md — living work queue

Updated at the end of every work order per the Working Agreement in
`CLAUDE.md`. Sections: **Now**, **Next**, **Blocked**, **Done**.

## Now
- **Three-part P0 repair — `claude/p0-repair-semantic-ask-livetv` (one PR,
  not merged), branched from `main` at `9e4e9ff` (post-#71/#72 merge).**
  - **P0-A** preference "like" vs comparison: one grammatical owner
    (`src/lib/nlu/likeGrammar.ts`) consulted by the critic parser AND the
    legacy similarity extractor; the incident sentence and every required
    exact query pinned in `src/lib/nlu/likeGrammar.test.ts`; a preference
    naming a WORK still seeds similarity, a preference naming a CATEGORY
    can never mint a title anchor.
  - **P0-B** Ask results out of the chat scrollbox: normal-flow canonical
    `.poster-grid` below the conversation, full shell width (3–4/2/1 tiles
    per row), browser-measured in `tests/mobile/ask-results-flow.spec.ts`.
  - **P0-C** Live TV Movies honesty: `diagnoseMoviesEmpty` is coverage-
    gated ("that's the schedule" structurally unreachable without a
    licensed grid), the movies view never pads with unrelated cards (the
    "Meanwhile" fallback is gone for `type=movie`), RAW provider fixtures
    cross the real classification boundary, and structured diagnostics
    ride the empty state.
  - Preview canaries added: CASE 13/14 in the black-box gate + ASK/LIVE TV
    canaries in `tests/preview/p0-journey.spec.ts`.
- **Trial-account provisioning awaits the credential holder** — run
  `scripts/provisionTrialAccounts.ts` with `TRIAL_ACCOUNTS_PASSWORD` and the
  standard Supabase env; it enforces the owner's exact contract and prints
  only the five allowed fields.

## Now (continued)
- **TODAY'S CASE BRIEFING is BUILT (`claude/todays-case-briefing`, stacked
  on the XMLTV PR):** first-class `/app/tv/briefing` route — editorial
  front page over the stored imported day (paged whole-day reader
  `getIngestedDayAirings`), scored ONCE by the existing `scoreGuideAirings`
  engine, pure tested selector (`src/lib/tv/caseBriefing.ts`, viewer-local
  calendar day via `?tz=` with a one-shot browser correction), `?channel=`
  deep-linked channel editions off a horizontally-scrolling rail, matched
  items → canonical QuickLook with an AIRING TODAY line, unmatched →
  honest schedule-detail sheet, exact honest no-coverage/no-rows states.
  OWNER ACCEPTANCE still requires the real XMLTV import against the
  preview-accessible database (command in the PR) — until then the route
  shows the honest absence state, by design.

## Next (discovered during the canonical interpreter release review)

- **`date.relative` is captured by the interpreter and never executed.**
  - PROBLEM: `interpret()` sets `date.relative = 'newer' | 'older'` for phrases
    like "movies older than 20 years", but `intentToQuery`
    (`src/lib/ask/canonicalExecution.ts`) maps only `minYear`/`maxYear`, so the
    constraint reaches no query field and the results come back unfiltered.
  - WHY IT MATTERS: the user states a bound and silently gets everything. Same
    class as the relative-date gap this workstream fixed, one field over.
  - KNOWN EVIDENCE: verified absent on `origin/main` as well as on
    `claude/canonical-interpreter-certification` — pre-existing, not a
    regression. `interpret('movies older than 20 years').date` is
    `{relative:'older'}`, and the resulting query has `minYear`, `maxYear` and
    `minReleaseDate` all undefined.
  - SAFE CONSTRAINTS: execution already owns the clock (`intentToQuery` takes an
    injected `now`), so a bounded reading is a small addition there and needs no
    interpreter change. Whatever is added must preserve the "window has an
    interior" property the date tests now assert.
  - DEPENDENCIES: none.
  - NOT A BLOCKER FOR: the canonical interpreter merge — the phrase behaves
    exactly as it does on `main` today.

## Next (discovered during the P0 repair)
- **XMLTV file-fed grid is BUILT (`claude/xmltv-file-ingestion`, stacked on
  the P0 PR):** streaming importer → canonical 0032 tables, coverage
  evidence (`xmltvCoverage.ts`) flips the guide's honesty signal only while
  the imported window covers now, What's On Today sections over stored rows.
  REMAINING: run the real import against a dev/prod database (needs
  `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; command in the
  PR), and confirm TV Media file-delivery retention/redistribution terms in
  writing. (A reduced copy of feed 10737 HAS since been supplied and drove
  the multi-position station fix.)
- Briefing follow-ups: persist a user's preferred briefing timezone on the
  profile (today it rides `?tz=` per visit); consider station-logo ingest
  (`tv_stations.logo_url` is declared but unwritten, so the rail draws
  monograms); revisit `SCORE_BUDGET` for the briefing's whole-day set once
  real import volumes are observed.
- **INFRA — licensed full-grid provider activation** is the only path to
  provable movie coverage: TVmaze structurally cannot see movie blocks
  (Hallmark/LMN/TCM absent entirely; measured, `docs/tv-coverage/`). TV Media
  is registered, gated and ready (`TVMEDIA_ACTIVATION.md`); activating it
  flips `hasLiveFullGridProvider()` and the guide's "true-empty" arm on with
  zero code changes. Schedules Direct remains licensing-rejected.
- The genre/network windowed fallback ("Meanwhile — actually coming on live
  TV") still renders unfiltered airings for NON-movie filters; consider the
  same zero-unrelated-cards treatment applied to `type=movie`.
- `searchIntent.ts` (search-box routing, frozen-corpus governed) carries its
  own copy of the bare like-cue; it is fenced from the ask pipeline but
  should adopt `likeGrammar.isVerbLike` in a governed change with corpus
  delta reporting.
- `classifySearch`'s SIMILARITY_CUE (legacy ask arm) also matches bare
  "like"; currently fenced by canonical ownership + strict resolution, but
  the same one-owner adoption would close the door for good.

## Next (discovered during the P0/product batch)
- Add `TMDB_API_KEY` to CI secrets → converts the three preview-gate GAPs
  (GotG cast membership, supernatural keyword exclusion grounding, Nolan
  director credit) to PROVEN/REFUTED.
- Expose a sanitized candidate-keywords receipt from `/api/ask` or
  `/api/title-meta` so keyword-level EXCLUSIONS (e.g. "no supernatural") are
  world-provable.
- Live TV source runtime gaps: `diagnoseMoviesEmpty` now NAMES movie listings
  hidden by a missing runtime (`unprovable-now`); consider a runtime fallback
  at ingest so currently-running movies are claimable.
- `src/lib/preference/strength.ts` (`dnaStrength(state)`, seven-category
  StrengthResult) remains unconsumed by any product surface — wire it in or
  retire it.

## Old Now
- **Canonical interpretation is wired into `/api/ask` — PR #64,
  `claude/canonical-interpretation`.** The route used to interpret the user's
  sentence and then interpret it AGAIN with a different instrument, and the two
  readings disagreed. Measured live on the Preview: `Give me a Stallone movie`
  returned **0 titles**, because `applyRequiredSubject(query, rawText)` re-read
  the sentence, `detectGeneralSubject` took the word before the media noun, and
  the actor's surname reached the finder as `subjectStrict` with the lexeme
  "stallone" — "show only titles where *stallone* is genuinely central". No film
  is about an actor, so eligibility rejected every candidate. Two more readings
  of the same sentence: `resolvePersonId(rawText)` sent TMDB the string
  `"watched yesterday stallone"`, and `parseRequestedCount(rawText)` read
  "I watched 3 movies yesterday…" as a request for three.
  Now: `raw → interpret() → CanonicalIntent → entity resolution → FinderQuery`,
  with the three raw-language re-parsers FENCED off the canonical path (not
  merely preceded by it) and `src/lib/ask/ownership.test.ts` walking the route's
  brace structure to keep them out. Identity is earned rather than assumed —
  a bare surname resolves only when one credited person bears it, otherwise the
  route asks. Deterministic engine, Critic, ranking, Taste DNA and provider
  logic untouched; frozen corpus byte-identical to `68a5a93`.
  **Two sessions converged on this branch concurrently** — the range-based role
  ownership (`SpanMatch`) is the other session's and supersedes the token-set
  approach; the adapter, the identity contract, the route wiring and the gate
  cases are this one's.

- **The Verdict Room — `claude/verdict-room-complete`.** PR #58's entrance
  reconciled onto current `main` and carried through the WHOLE room, so the
  interior no longer collapses back to a stack of `max-w-2xl` cards the moment
  you walk in. `RoomShell` gives every stage the same floor, key light and
  horizon; a five-node rail driven by real room state (never a per-device
  counter, so a late joiner sees where the ROOM is); presence in the header at
  every stage instead of only on JOIN; candidates lit by the engine's own
  ranking with the group fit as a length; one bloom at the verdict and jurors'
  scores as a histogram. Engine untouched — 78 existing court/together E2E tests
  green, plus 15 new interior ones.
  **Three real defects fixed on the way:** a 46px horizontal overflow at 320px
  (the identity line), mood/avoid chips at 36px (the most-tapped controls in the
  room, and the only ones in the app under the 44px minimum), and the sync chip
  wrapping to three header lines on a phone.

- **Owner action — run the fingerprint backfill so Showdown can move ranking
  fully.** `/api/health/showdown` on production reports **73/113 covered,
  ratio 0.646, threshold 0.67, `usable: false`** — 40 diagnostic titles have no
  row in `title_dimensions`, so evidence about them records correctly and then
  contributes nothing to the ranker. This is a DATA condition, not a code one,
  and it predates the Showdown work; the new payoff reports `measured: false` /
  `movement: 0` honestly rather than papering over it. The fix is the batch
  classifier, which needs your `CRON_SECRET`:

  ```
  curl -s -X POST "https://clearpath-pearl-chi.vercel.app/api/cron/classify" \
    -H "Authorization: Bearer $CRON_SECRET"
  ```

  Re-check with `curl -s https://clearpath-pearl-chi.vercel.app/api/health/showdown`
  until `usable` is true.
- **DNA Showdown — `claude/showdown-definitive`.** PR #53's recovery work
  reconciled three-way onto current `main` (nothing newer reverted; the Critic
  Layer's `criticNudge`/`planNudge` terms in `rank.ts` verified intact) and
  narrowed to the game. Recovered: verified TMDB identity
  (`identity.ts` + `catalogueResolver.ts` — a wrong hand-authored id is
  corrected by search, never displayed), the three-phase adaptive scanner,
  moments/discoveries derived from what the planner actually did, `Both`,
  per-cluster meters, cross-session exposure memory, and the axis-level
  crossing into canonical `preference_events`.
  **Measured adaptivity: 7–10 of 20 shared questions across six personas**
  (was 20/20 identical). Canonical vocabulary is a 28-axis SUPERSET of the
  15 scoring dimensions — same keys, same storage, same copy, pinned by test.
  `MIN_RANK_CONF` untouched at 0.25.
  **Real payoff now WIRED, which it was not on #53** — `payoff.ts` shipped
  there with no caller outside its own test while the results screen went on
  ranking the diagnostic pool. `payoffPool.ts` + `measurePayoff` run the
  production `preferenceNudge` over the same TMDB discover pool `/browse?sort=foryou`
  ranks, with diagnostic titles excluded, folding one event read twice for an
  exact counterfactual. Three honest outcomes: unmeasured / measured-and-flat /
  measured-and-moved.

- **Critic Layer — `claude/critic-layer`.** GC1–GC11 complete red-then-green
  (**250 critic tests**). A comparative
  Ask runs the full pipeline, **the CriticPlan orders the response the user
  gets** (`decisionScore = matchScore + planNudge`, bounded ±10 and
  authority-scaled, durable Match still on the card), and each item carries a
  grounded **FOR THIS REQUEST** explanation generated from the same contribution
  trail that produced the order. Comparative intent is detected at a
  provider-independent boundary (`src/lib/critic/gate.ts`) so meaning does not
  depend on `AI_DISCOVERY_MODE`. **GC9** proves all five sources of meaning
  (anchors, DNA, relationship, modifiers, hard context) are causal at the
  correct stage, and **GC10** pins the original incident sentence end to end
  with a structural — never title-specific — mechanism.
  **GC11** measured the request path and fixed three real defects (identity
  resolved twice per anchor, serial anchor resolution, and `loadPreferenceCached`
  having zero callers), and **GC12** merged `main` @ `ae25f6f` cleanly, audited
  the diff for rollback, and re-ran every gate green. **PR is open against
  `main`, not merged** — awaiting your review. Ledger: `docs/CRITIC-SHIP.md`.

**Action needed from you:** open `/admin/migrations` on
production and apply pending migrations with your `MIGRATE_SECRET` — see the
"Restored: /admin/migrations" entry below for why this is required and what it
unblocks.

## Next
- **Credit roles the engine still cannot execute — refused, never degraded.**
  `people/constraint.ts` supports exactly `actor` and `director`, movie-only.
  Everything else is refused out loud with a reason that reaches the user's
  `interpretation`, and `constraint.test.ts` pins that no unsupported role can
  ever resolve to `actor`. Each of these needs its own change and its own
  evidence — none may be "enabled" by widening the type:
  - **`written by` (writer).** TMDB `/discover/movie` has no writer filter;
    `with_crew` retrieves the person's crew credits and qualification would need
    `job` in the Writing department. Doable on the same shape as director.
  - **`created by` (creator).** A TV concept, and `/discover/tv` accepts neither
    `with_cast` nor `with_crew`, so retrieval has no server-side narrowing at
    all. Needs a different strategy (person credits first, then filter), not a
    wider enum.
  - **TV director, and TV cast.** Same provider limitation as above. `roleSupport`
    already returns `supported: false` for both; the refusal is the correct
    behaviour until a retrieval strategy exists.
  - **`interpret`'s `CreditRole` must adapt onto `PersonRole`, not beside it.**
    `CanonicalIntent.people[].role` can say `creator`; execution can say two
    things. When PR #64 is wired, it must pass through `roleSupport` so an
    unexecutable role is refused rather than silently dropped — and
    `requestedRoleFor` in `people/constraint.ts` is the reader both should share
    rather than a third copy.
- **The 20 pre-existing mobile-suite failures — 8 now fixed, 12 in flight.**
  Independently verified twice: by rebuilding the harness at `0b90f04` with the
  working tree stashed (PR #58's visual pass), and by building `718987e` in a
  scratch worktree (the card-redesign work). The same 20 fail with neither
  branch applied, so they are inherited rather than caused.
  - `wired-experience.spec.ts` × 8 — **FIXED** by the provider-chip hotfix.
    Root cause was not a stale spec: `WhyVerdict` → `ProviderChip` →
    `resolveProviderBrand` → `officialProviderName` called `name.trim()` on an
    availability object with no `service`, which threw DURING RENDER, so React
    unwound to the error boundary and the whole recommendation page became
    "Something went wrong". The registry now treats absent identity as a state
    rather than an error, the chip is suppressed instead of crashing, and the
    legacy payload shape is pinned under test so it cannot come back.
    (The suspicion recorded here — "worth checking against PR #54's WhyVerdict
    availability-row change before assuming the spec is simply stale" — was
    exactly right: #54 added `service`/`access`/`logoPath` and the fixture, and
    the renderer, were never brought along.)
  - `visual-qa.spec.ts` × 12 — the `▶ Trailer` affordance renders below the
    suite's 44px tap-target minimum at every viewport in the matrix. Addressed
    in the card + trailer redesign (PR #61), which gives both frame controls
    44px on BOTH axes — the floor is a box, not a height.

- **A typed runtime constraint never reaches the finder request (TEST E).**
  Found while fixing the provider-chip crash: with that crash gone,
  `wired-experience.spec.ts` TEST E reaches its assertion for the first time and
  fails on its own merits. Asking "a fast mystery movie under 100 minutes" posts
  `query.maxRuntime: null` — the cap the user typed is dropped, so the search
  runs unconstrained while the UI behaves as though it applied.
  NOT a parser bug and NOT a state race: `naiveParseQuery('a fast mystery movie
  under 100 minutes')` returns `maxRuntime: 100` when called directly, and
  inserting a 600ms settle between typing and Enter changes nothing — the
  parsed query simply is not what `FinderUI` submits on the ask path
  (`src/components/FinderUI.tsx`, `setQ(naiveParseQuery(v))` at ~208 vs
  `effQuery` at ~284).
  Deliberately NOT fixed in the provider-chip hotfix: this is finder/search
  behaviour, and `docs/SEARCH-BASELINE-GOVERNANCE.md` requires any search-surface
  change to be compared against baseline `68a5a93` with the frozen corpus and a
  PASS→FAIL / FAIL→PASS delta reported. That is its own piece of work with its
  own evidence, not a rider on a rendering fix.
- **The ~50 non-Showdown files stranded on `claude/showdown-cold-start-scanner`.**
  That branch accumulated real work with nothing to do with the game, and it was
  reverted to `main` rather than smuggled through a Showdown PR. Each of these
  needs its own scoped change, and the branch is the record of what was tried:
  - **Watchlist provenance** (`src/lib/watchlist/provenance.ts`, migration
    `0047`, and the `quiz.ts` / `postWatch.ts` / `feedback.ts` write paths).
    Carries a genuine defect fix: onboarding's "what do you want to AVOID"
    answers ran through the rating path at rating 2 and marked unseen films as
    watched. Worth landing on its own, with the migration reviewed separately.
  - **Pack eligibility + identity + mediaKind** (`src/lib/packs/eligibility.ts`,
    `identity.ts`, `mediaKind.ts`, the admin eligibility route, the pack-enrich
    cron and its `vercel.json` entry).
  - **Admin migrate / reconcile-dry route changes** and
    `adminProjectIdentity.test.ts`.
  - Assorted component edits: `ChannelGuide`, `TheaterMode`, `PhotoAdd`,
    `SaveButton`, `AvailabilityPanel`, `VerdictActions`, `Mentalist`,
    `TasteGame`, `CaseBrowserView`, `ChecklistSection`.
- **Showdown poster coverage is 0/113 in `poster.ts`.** Pre-existing on `main`,
  not a regression: the static `POSTERS` map was never populated, so every tile
  falls back to the typographic treatment unless `/api/showdown/catalogue`
  resolves artwork live. That route now does resolve and verify it, so the
  static map is dead weight — either populate it from a verified run or delete
  it and let `PosterTile` read the catalogue response alone.
- **The global 💬 `FeedbackButton` overlaps long scrolling pages.** `fixed
  left-2 bottom-…`, 44×44, sits on top of body copy on the Showdown results
  screen at 390px. Untouched by any recent work and product-wide, so it needs
  its own fix (a scroll-aware offset, or a safe gutter on long pages).
- **Linear network brand asset registry.** Replace the 0/83 monogram fallback
  with verified network marks, using a separate provenance-backed canonical
  asset registry or a licensed authoritative source. NOT part of PR #54 — that
  work established the plumbing (`tv_stations.logo_url` → `ingestedGuide` →
  `channelGuide` → `NetworkChip`) and proved the gap is an asset-source problem,
  not a wiring one: TVmaze's network object carries no logo, Watchmode sets
  `logoPath: null` and is a streaming source anyway, TV Media is egress-denied
  under `DATA_MODE=free_live`, and `linear_networks.logo_path` is fixture-fed.
  - **Runtime fuzzy name → logo inference stays forbidden.** A logo resolved by
    string resemblance is a claim about who broadcast something, made on no
    evidence.
  - **A streaming-service mark may never substitute for a network mark.** They
    are different factual entities; `ProviderChip` and `NetworkChip` are
    separate for that reason and must stay separate.
  - **Verified canonical mappings ARE allowed** — station/network identity to a
    specific asset, decided once and reviewed, never inferred per request.
  - **Every manually verified asset must retain provenance:** where it came
    from, who confirmed it, and when. Same rule the streaming table follows in
    `src/lib/providers/assets.ts`, which records that each path was fetched and
    looked at before being written down.
  - **Order of work:** ABC / CBS / NBC / FOX / The CW first, then Hallmark
    (Channel, Mystery, Family), Lifetime / LMN, then major cable, news, sports
    and premium.
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
- **Critic strand TMDB budget — MEASURED in GC11, still worth a real-pool
  check.** The fan-out is capped by `MAX_STRANDS` (now a declared constant in
  `src/lib/critic/strandBudget.ts`) and proven not to grow with anchor count.
  Per-request identity searches dropped 4 → 2 and round-trip depth 3 → 2. What
  GC11 could NOT measure is real TMDB latency and cache hit rates against
  production pools; worth sampling once deployed.
- **Score distribution audit.** The median appears compressed: four
  recommendations scored 79-91, all reading STREAM IT. Blocked on real title
  data existing in production — the local/dev catalog is synthetic fixture
  data (`catalog_titles`), so a distribution computed against it wouldn't be
  representative.

## Done
- **The Verdict Room shadow room is dressed rather than sketched** (PR #58,
  pending review). The plates carry three original drawn poster compositions,
  the participants are silhouettes with real reaction states, the verdict board
  shows the shape of a finished session, and a gavel inside a converging arc
  marks the decision. Three positioning bugs surfaced and were fixed along the
  way, each now pinned by a test: Tailwind `-translate-*` losing to an inline or
  animated `transform` (the board was 250px off-position and invisible); a
  `rotateY`-before-`translateZ` transform order adding `z·sin(θ)` of sideways
  travel (the flanking plates hung off both edges of a phone); and an
  `absolute inset-0` child escaping a container that lacked `position: relative`
  (a 36px thumbnail painting across a 340px panel).
- **Streaming brand coverage is 14/15, and the last one is an upstream fact.**
  Starz, AMC+, Fubo, Tubi, Pluto TV and The Roku Channel now render their own
  marks. Their paths were not guessed: production's already-deployed
  `/api/ratings/:type/:id` returns TMDB's provider rows, each pairing a
  `provider_name` with its `logo_path`, so the identity came from TMDB itself
  across a sweep of ~36 real titles; each asset was then fetched and looked at.
  No diagnostic route was added and no secret was handled.
  **Showtime is the one gap and it is not fixable here:** TMDB's US
  watch-provider data carries no standalone Showtime entry (checked across nine
  Showtime originals) since the service folded into "Paramount+ with Showtime".
  Giving it Paramount+'s mark would be the brand merge the registry exists to
  prevent, so it renders as its official NAME.
- **Linear network logos: plumbed, and genuinely blocked on source, not wiring.**
  Forensic pass over every source in the stack: both station writers
  (`tvmazeWriter`, `tvMediaWriter`) upsert `name`/`network`/`call_sign` and no
  logo, because neither source supplies one — TVmaze's network object is
  `{id, name, country, officialSite}`; Watchmode explicitly sets `logoPath:
  null` ("per-title sources carry no logo") and is a STREAMING source anyway;
  TV Media, the paid adapter, is egress-denied under `DATA_MODE=free_live`;
  `linear_networks.logo_path` (0044) is fixture-fed and read by nothing. The
  only remaining candidate — mapping a station name onto a TMDB *network* id —
  is name inference and is refused. Rendered coverage is therefore 0, the
  monogram stands, and the wired path lights up the moment a licensed source
  writes `tv_stations.logo_url`.
- **Known brands render their own marks, not just their names.** The registry
  now resolves canonical provider identity → verified asset
  (`src/lib/providers/assets.ts`), so a surface that knows only "Netflix" — the
  subscription picker, a group verdict's service list, the availability row —
  draws the brand instead of spelling it. Callers no longer need to arrive
  holding a `logoPath`. Every entry was fetched from image.tmdb.org and LOOKED
  AT before it was written down; a 200 is not verification. Plan variants
  inherit the brand's mark ("Peacock Premium" → Peacock); distribution routes
  never do ("Paramount+ Amazon Channel" stays text).
- **Linear network logos are plumbed end to end.** `tv_stations.logo_url` →
  `ingestedGuide` → `channelGuide` row → `NetworkChip` in the guide. No source
  writes that column today, so every row still shows its monogram — the
  deliberate non-hotlinked identity, not an emoji — and lights up the moment a
  licensed source lands.
- **One provider-brand registry, and no service is drawn as an emoji any more.**
  `src/lib/providers/brand.ts` is now the single lookup from a provider
  identity to its official display name, its verified logo asset, its
  accessible label and its brand-safe text fallback. `ProviderLogos`,
  `ProviderChip`/`NetworkChip`, the availability dedupe (`providerBrand.ts`)
  and `explainVerdict` all read it — there is no second map.
  - **The named defect is gone:** "Why this Verd1ct?" rendered
    `📺 fuboTV · Included with subscription · likely` while the card's own
    Where-to-watch strip two rows above drew Fubo's real logo. The row is now
    the site's provider chip plus the access level and the confidence as their
    own labelled parts. Availability LOGIC is untouched; `verified` vs
    `likely` is still the only thing that decides what may be claimed.
  - **Swept:** the television emoji is gone from every place it stood next to a
    named service or network — TasteCourt, CloudCrews, LiveCourt,
    TogetherPlanner, VotingFloor, AskTheJudge, JudgeVerdictCard, FinderUI (×4),
    ReportExtras, SearchBar's provider/network intent card, SeasonWhereToWatch —
    and `TvDetective` now uses `NetworkChip` for a linear network. The
    `emoji` field on `STREAMING_SERVICES`/`LIVE_TV_PROVIDERS` (🅽 for Netflix,
    ⚽ for fuboTV…) was a homemade second logo map and is deleted, with its
    four render sites falling back to the official name.
  - **Guarded** by `src/lib/providers/brand.test.ts`: the rename table never
    merges two identities, a logo is never invented, and a source scan fails on
    any 📺 outside the media-type/empty-state allowlist.
- **The landing example teaches the product.** A landing-only annotation layer
  (`ExampleTour`) puts six restrained callouts in the page's gutters on a
  laptop — Score, Match, More, Where to Watch, Why this Verd1ct?, Things
  to Know — and the same six as a numbered "What you're looking at" legend
  under the card below `xl`. It is a grid SIBLING of the card, never an
  overlay: the visual suite measures that no callout intersects the card or
  another callout. `PosterCard` was not touched. The Match callout says the
  number appears once Taste DNA exists rather than implying one already does,
  and the "More" callout describes what that control actually is — an inline
  synopsis expand — with poster/title navigation named separately, because it
  is a different control.
- **The landing "Example Verd1ct" is the real card now, not a drawing of one.**
  The section rendered its own bespoke horizontal report — thumbnail poster in
  an oversized empty box, standalone FOR pill, prose metadata, ± evidence rows
  outside the card, availability as a sentence, alternate title as prose, its
  own underlined link. All of it is deleted. The section now renders the
  production `PosterCard` (and therefore `CardFacts`, `CardSynopsis`,
  `AlgorithmScore`, `WhyThisTitle`, `CardFit`, `WhereToWatch` +
  `ProviderLogos`) with `WhyVerdict` in the card's own `evidence` slot, exactly
  as `FinderUI` composes a result. No landing-only card markup remains.
  - **Anonymous personalization is the shipped state, not a demo mode.**
    `/api/dna` answers `{ dna: null }` for a visitor, so the panel labels
    itself "WatchVerd1ct" (not "Your VERD1CT") over the general score passed as
    the new `PosterCard.objectiveScore` pass-through, `CardFit` renders
    nothing, `WhyThisTitle` claims nothing, and `explainVerdict({ matchScore:
    null })` prints "No personal taste signal yet — match is generic."
  - **One primary CTA component.** `EnterWatchVerd1ctCta` now owns
    `.btn-watchverdict`; the hero and the new post-example transition both
    render it, so a second button language cannot appear by copy-paste.
    `quizReachable.test.ts` follows the component and still pins "exactly one
    ceremonial entrance in the hero".
  - **The example is a fixed entity, not a search result.** It briefly resolved
    itself with `searchTitles('The Godfather')` + a `.includes('godfather')`
    pick, which made the landing page's identity a function of TMDB popularity
    ordering and a substring match. It is now `movie:238`, loaded by id through
    `getScoringData`. Pinned by `exampleIdentity.test.ts` (source-level: no
    search call, canonical constants) and at runtime by the visual spec, which
    asserts every per-title fetch is `/api/ratings/movie/238`.
  - **Verified at 1440 and 390** via `/dev/landing-example` (MOBILE_HARNESS
    harness) + `tests/mobile/landing-example.spec.ts`, 12 assertions incl.
    card proportions, the phone row collapse, and no horizontal overflow.
  - **Follow-up worth queueing:** `splitMath` (`lib/verdict/explainSections`)
    cannot lift a nested numeric parenthetical, so the engine's
    "Well received by audiences (8.7/10 (23,328 votes))." renders in full
    wherever `WhyVerdict` shows it — including production finder cards. The
    landing loader drops that reason as a duplicate
    (`lib/verdict/sourceQuotes.ts`, tested); fixing `splitMath` itself would
    clean it up everywhere and was out of scope here.
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
