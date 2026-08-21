# BACKLOG.md — living work queue

Updated at the end of every work order per the Working Agreement in
`CLAUDE.md`. Sections: **Now**, **Next**, **Blocked**, **Done**.

## Now — graph-native slices A/B/C, phases 3–10, 2026-08-21 (overnight shift)

- **CLOSED — Phase 5, one label one number (PR #102, merge 16fd771).**
  Every verdict-label surface (AlgorithmScore, DnaScore, CardDna,
  SearchResultRow) reads `canonical.score`; SearchResultRow wears
  `Verd1ctBadge`; `/api/dna-score` deleted; 7 pins in
  `src/lib/scoring/oneVerdictLabel.test.ts`.
- **CLOSED — Phase 3, user evidence unification (PR #103, merge 01f8df0).**
  One provenance-carrying read model (`src/lib/preference/readModel.ts`)
  over the six evidence stores with honest per-row observed-at, capped
  loads, named unreadables; founder inspector `/growth-os/evidence`;
  `pref-dna:${userId}` cache bust at the write chokepoint.
- **CLOSED — Slice A / Phase 6, availability provenance (PR #104, merge
  bdeaeb7).** Watchmode rows carry retrieved/verified stamps +
  availability_state; TVmaze airings and ingested guide rows carry
  source + observed-at; cards prefer real per-row `retrieved_at`; INV-4
  law; the airing branch finally carries its subject ("AMC boxing movies
  tonight" reaches the guide WITH `boxing`). Production verified.
- **CLOSED — Slices B+C / Phase 8, group + subscription runs (PR #105,
  merge b5c1acd).** Verdict Room finalists (session), docket verdicts and
  Subscription Check (request_only) record decision runs; INV-9 (group
  evidence never writes durable taste) law; verdict beacon bounded by a 3s
  auth race so it can never hang a page. 87/87 mobile specs green.
- **CLOSED — Phase 7 orphan half (PR #106, merge 626d15f).** The third
  English reader is dead: `/api/recommendations` POST deleted,
  `recFeedback.ts` reduced to the filter types its callers use,
  `src/lib/arch/orphanSurfaces.test.ts` pins it cannot return.
- **CLOSED — Phases 4/9/10 (PR #107, merge 61065cc).** The deployed knowledge layer
  (compile/resolve/store + 0048 byte-identical, sha-pinned) joins main
  with its 15 tests; `/growth-os/title-evidence` inspector; `groundedWhy`
  + INV-7 — a why can only say what a run's edges prove.
- **Queued follow-ups discovered this shift:**
  - **Phase 7 remainder (deliberately deferred):** fold `/api/finder`'s
    parse into the canonical interpreter; stop `/api/ask`'s legacy arm
    trusting client `naiveParseQuery`; dedupe `coerceQuery`. Search-surface
    work — takes the frozen-corpus gate + baseline delta report.
  - **Knowledge → finder eligibility wiring** (use compiled subject facts
    for eligibility/rejection evidence). Search-surface work, same gates.
  - **Court results durable persistence** needs a SECURITY DEFINER RPC
    migration (host-scoped write path); court runs currently record only
    when the host is authenticated.
  - **INV-3 / INV-5** (personalized-score-requires-evidence; one identity
    owns cross-surface score state) not yet enforced over stored runs.
  - **0047 numbering collision:** repo `0047_decision_runs` vs
    DB-applied `0047_watchlist_provenance` (from the abandoned branch).
    Renumber/reconcile before the owner applies pending migrations.
  - **Mobile harness build contract (discovery):** `npm run test:mobile`
    inlines dummy `NEXT_PUBLIC_SUPABASE_*` via `build:harness`; a plain
    `npm run build` serves 500s on pages that construct browser Supabase
    clients. Never diagnose mobile-spec failures from a plain build.
- **Ranking movement this shift: ZERO by construction.** Every merged
  change records or reads evidence; no ranking input changed (rule F —
  a recommendation must never move merely because an edge exists).
- **HUMAN ACTION — unchanged from the evening shift:** fix
  `SUPABASE_DB_URL` in Vercel (see the evening-shift entry below for the
  exact procedure and proof-of-done). Until then `decision_runs` /
  `title_knowledge` production application stays unverifiable from code.

## Prior shift — ledger runtime forensics + comparative direction, 2026-08-20 (evening shift)

- **CLOSED — the runtime can read the migration ledger (PRs #98 + #100).**
  Owner's environment verification proved the DB healthy and populated while
  `/api/version` said `unavailable`. Chain of causes, each fixed and pinned:
  (1) the reader went REST-only and `serviceRoleKey()` THREW with no key —
  now a two-channel read: direct `pg` (the migrate route's exact
  sanitize/validate idiom) reading the repo ledger then the Supabase CLI's
  own ledger (`supabase_migrations.schema_migrations`, PostgREST can never
  see it) under the explicit `cli_ledger` status; REST stays as fallback;
  `SUPABASE_SECRET_KEY` (`sb_secret_…`) accepted beside the legacy name
  (merge a704438). (2) Still `unavailable` in production and the reader
  couldn't say why — every failure was the same `null`. Now each channel
  names its cause in `/api/version ledgerChannels` (closed vocabulary:
  `validate_rejected`/errnos/SQLSTATEs/`missing_key`, never a hostname or
  message; leak-tested), `runtime='nodejs'` declared, 5s connect timeout
  (merge df10c1b). Production then named the actual root cause itself:
  `directDb: "validate_rejected"` — the stored `SUPABASE_DB_URL` value is
  structurally invalid (most likely an unescaped reserved character in the
  DB password; the validator's documented most-common case).
- **HUMAN ACTION — fix the `SUPABASE_DB_URL` value (Vercel → clearpath →
  Settings → Environment Variables → Production).** See the exact reason
  first: `curl -s -X POST https://clearpath-pearl-chi.vercel.app/api/admin/migrate -H "Authorization: Bearer $MIGRATE_SECRET"`
  returns `stage: "validate"` with the specific structural reason (never the
  URL itself). Remedy per the validator: re-copy the URI fresh from
  Supabase → Settings → Database → Connection string, percent-encode any
  reserved character in the password (or reset the DB password to one
  without reserved characters), prefer the Session-pooler URI, save for
  Production, redeploy. Proof of done: `/api/version` shows
  `appliedDatabaseMigration: "0048_title_knowledge"`,
  `migrationLedgerStatus: "cli_ledger"`, and no `ledgerChannels`.
- **CLOSED — the comparative direction is causal (PR #99, merge 810d9c6).**
  Three deployed taste-dna-proof failures, all reproduced twice: opposite
  directions vs the same anchor shared heads and returned the anchor itself
  (stated axis now owns 0.7 of the ±10 in mixed plans, pure plans
  nine-decimal-identical; anchors excluded from their own comparison);
  "darker than Taken" with an unfingerprinted anchor served silently
  (partial application now disclosed via the `disclosed` fact channel);
  "a thriller that drags" returned 1 of 40 (pace-banded asks hydrate the
  ceiling pool — discovery can't see pace; shortfalls disclosed, never
  padded — the padded-refill variant failed the proof and was replaced).

## Prior shift — production reality + graph-native spine, 2026-08-20 (day shift)

- **CLOSED — the home box's two defects in one utterance.** "a boxing
  movie" routed to the generic feed AND fabricated "Locked in: loves a
  boxing movie" (the LLM's hallucinated likedTitle rated a real film 9/10).
  Route decided before any taste byte; `tasteEvidenceText` scopes writes
  (durable clauses + named reactions only; companions never; only titles
  the user literally typed may seed). PR #94 (merge 6cef644) + reviewer
  catch (subjectless durable fragments still write). Deployed gate CASE 0
  proves the front door at every head. Production verified.
- **CLOSED — the second decision engine.** The search bar on the same home
  screen sent "a boxing movie" to an arbitrary top-result title page.
  `clauseLayerSaysRequest` (requestDecision) is the one owner, consulted by
  the hero box and the search destination AFTER the exact-title check —
  evidence beats phrasing ("Show Me a Hero", "12 Angry Men" pinned).
  PR #96 (merge 1a21730). Production verified.
- **CLOSED — the legacy score pill.** Cards/QuickLook/Ask cards carried
  "82 · STREAM IT" at 10px while the title page wore the branded mark. The
  compact call now carries `Verd1ctBadge` (tv=false, the guide precedent);
  one identity everywhere. PR #95 (merge 6ad5af1). Browser proof at 390/1280.
- **IN FLIGHT — graph-native spine (phases 0-2), PR #97.** Vocabulary,
  decision-run provenance on /api/ask + /api/build-case, five invariants,
  boxing litmus at the real routes, founder inspector
  (/growth-os/decisions), architecture doc
  (docs/architecture/GRAPH_NATIVE_WATCHVERDICT.md).
- **HUMAN ACTION — apply migration 0047 after #97 merges** (the store
  degrades to a no-op until then; nothing breaks): run
  `supabase db push` (or apply `supabase/migrations/0047_decision_runs.sql`
  via the Supabase dashboard SQL editor), then submit any State Your Case
  ask and open `/growth-os/decisions` to see the run. Also queue the
  90-day decision_runs retention cron (service_role delete) — see the doc.
- **Next graph phases (mapped in the doc, each deployable):** 3 user
  evidence → Taste DNA as derived view · 4 content evidence · 5 scoring
  trace (fixes AlgorithmScore reading `dna.score` while WatchCall reads
  `dna.canonical.score`; matchScore displayed nowhere) · 6 availability/TV
  · 7 consolidation (fold /api/finder into the canonical interpreter; stop
  the legacy arm trusting client `naiveParseQuery`; airing branch keeps
  the subject; delete the orphan `/api/recommendations` parser) · 8
  Docket/Verdict Room/Subscription as graph objects · 9-10 inspectors +
  user-facing "Why this VERD1CT".

## Done — overnight P0 closure shift, 2026-08-20

Five PRs merged and production-verified this shift; every claim names its
proof. Production at the end of the shift: `/api/version` → `7086fec` (main).

- **CLOSED — deployed diminisher/negation divergence (queue item A).** Root
  cause was the toolchain, not the regex: SWC constant-folding corrupted a
  `\b` escape into a literal BACKSPACE inside the compiled negation pattern,
  so the deployed regex matched nothing while unminified vitest stayed green.
  Fixed with the `String.raw` idiom (tagged templates are opaque to the
  folder) plus a postbuild acorn gate (`scripts/verify/bundleEscapes.mjs`)
  that fails any build shipping a corrupted escape. PR #87 (merge bceaf73) +
  PR #88 (merge 98a8496); deployed exact-SHA agreement 75/75; the reviewer's
  quantity-comparative catch ("less than 90 minutes" grew a phantom excluded
  subject) fixed with `(?!\s+than\b)` and pinned. Production verified.
- **CLOSED — stated taste without an active request (item B).** "I love slow
  burns but I hate gore." now folds into the conversation state the next
  turn executes from (`absorbStatement` → `stateToQuery`) — the product's
  real between-turns path; chips render and remove the held constraints;
  what has no home is disclosed, not dropped. Standing preference, past
  reaction and bare familiarity pulled apart (`statesPreference`); companion
  taste never attributed to the user; past-tense taste records nothing.
  PR #89 (head 736c310, merge f29fa48). The two-turn deployed proof runs in
  the PR's own gate: turn 2 must execute genreIds [53] + excludeGenreIds
  [27] or "Noted" was a lie.
- **CLOSED — "the Taken movie" wrong referent (item C).** General model,
  nothing hard-coded: `chooseFramedReading` (pure) picks between the literal
  and frame readings on cumulative audience with a 20× dominance bar; bare
  exact queries and famous literals never move; genuine literal absence
  still flips ("the Whiplash movie"). Reviewer-caught hardening: an errored
  search probe is UNKNOWN, never absence — the flip needs two answered
  probes (`askJudge.framedReferentFailure.test.ts`). PR #90 (head bde88a1,
  merge 65f9a03); Q27 pins Taken (2008) in the deployed gate where the
  prior head is on record answering THE TAKEN (2024). Production verified.
- **CLOSED — CI truthfulness (queue §12).** Production deployment events now
  conclude SKIPPED at the job level for the three deployed gates
  (black-box, taste-dna-proof, ui-journey) instead of vacuous green; the
  same gates still run in full on every preview. PR #91 (head b70d333,
  merge b506fc3). A skipped gate can no longer be cited as a pass.
- **CLOSED — one negation vocabulary (item D).** `NEGATOR_WORDS` declared
  once and composed into `NEGATORS` (source byte-identical, so the derived
  `CLOSED_CLASS` is provably unchanged), `negatedSpans` (zero behavior
  change by construction), and `MEDIA_NEGATOR_BEHIND` — which was the copy
  the contracted-auxiliary fix never reached: "something that isn't a
  movie" executed with media MOVIE, the tone layer's inversion one consumer
  over. Fixed for every in-request phrasing; +10 matrix tests; layerBext
  P0 635/635, P1 515/515. The Reco Lab's scope-opener list
  (`reco/parseIntent.ts`) is documented in-code as intentionally separate
  (different machine, lab-only surface), not a fifth copy. PR #92 (head
  16775c6, merge 7086fec). Production verified.

### PROVEN LIMITS (characterized, pinned, deliberately not "fixed" tonight)
- **A standalone negative preference is a statement.** "I don't want a
  movie tonight" alone carries no request; the clause layer reads it as a
  statement and media is never parsed. This is the stated-taste ownership
  rule working as designed; pinned in `mediaPolarity.test.ts` so nobody
  turns statements into requests to capture their media.
- **Cross-clause constraint drop (neutral, not inverted).** "give me
  something tonight, but I don't want a movie" drops the medium veto — the
  second clause is fenced as non-request and media stays 'either'.
  Clause-role attribution seam, distinct from the vocabulary; a candidate
  for its own characterized change.
- **Media window overreach (pre-existing).** "no horror movies" negates the
  MEDIUM as well as the genre (media flips to tv) because the lookback
  window reaches past a content word. The genre exclusion is correct and
  pinned; a scope change moves many sentences at once and needs its own
  matrix.

### DETERMINATION — generic /api/search order stands (queue item H)
Production returns the 2017 Taken series before the 2008 film for bare
"Taken" (verified at 65f9a03). After the anchor-resolver fixes, the
ANSWERING surfaces no longer depend on that order: framed forms resolve by
audience dominance (#90), stated years pin works, and ambiguous bare asks
clarify with cumulative-audience ordering. What still inherits the order is
one path: search-box Enter on a bare ambiguous exact name navigates to the
first exact match (`resolveSearchDestination`), with the disambiguating
dropdown already visible on screen. Changing that would require either
reordering /api/search (frozen-baseline surface) or widening its payload —
`CatalogResult` carries no voteCount today — neither warranted for a lookup
surface whose UI already shows both works labeled by year and medium. Left
alone per the work order. If product later wants Enter to prefer the
best-known exact match, the isolated change is: add voteCount to the
/api/search payload (additive), tie-break exacts in
`resolveSearchDestination`, and report the layerA delta explicitly.

### Still blocked (human-only) — unchanged
`SUPABASE_SERVICE_ROLE_KEY` is absent in production (the sole absent
credential; presence-only `/api/health` proof). See the ENVIRONMENT BLOCKER
section further down for the exact Vercel action and the four-step closure
proof. Items F (deployed personalization proof beyond the legitimate no-DNA
control) and G (Why/Watch Out live proof with real stored evidence) remain
gated on it.

## Done — P0 closure on `claude/p0bcd-language` (PR #86, merged)
- **The deployed proof became the gate, and it found four defects the whole
  unit suite was blind to.**
  Every one lives where interpretation meets orchestration, which is exactly
  where an in-process test cannot look.
  - **"another boxing movie" returned nothing.** `interpret()` read it
    perfectly — recommendation, movie, subject `boxing`, no title. `/api/ask`'s
    named-title arm consults that reading only when it says `lookup`; otherwise
    it re-reads the raw sentence with `looksLikeTitleAsk` + `classifySearch`,
    strips the media noun, and looks up the phantom title "another boxing".
    Generalized: any `<determiner> <subject> <medium>` ask took the same wrong
    door. `src/lib/ask/titleSpanOwnership.ts` states the rule `ownership.test.ts`
    already implied. **0 → 24 boxing films deployed.**
  - **"My wife likes comedies." answered with 24 comedies.** `kind:
    'statement'` was only ever read to fence OTHER readers off the sentence; no
    branch asked whether the utterance contained a request at all.
    `src/lib/ask/statementBoundary.ts` asks it once, after the title arm (a bare
    title is a statement too). **24 items → `kind: clarify`, no result set.**
  - **The card named the dial instead of reading it.** `matchHighlights`
    returns `{ label, note }`; both chips were built from the label, so a real
    card said "Heads up: Pace". Every unit test passed because every unit test
    was written with prose no caller produces. Fixed with
    `agreementPhrase`/`concernPhrase` and tests built from the real `DIMENSIONS`
    table. Found by the browser proof (`tests/mobile/why-reasons.spec.ts`).
  - **A comparison completed and did not matter.** "darker than Taken" returned
    this deployment's unconstrained popularity head. `plan.authority` measures
    the ANCHOR, and it scaled the instruction the USER stated too — so an
    anchor the classifier has not fingerprinted silenced the axis the person
    typed. Authority now scales only anchor-evidenced terms; the pure-anchor
    case is identical to nine decimals (pinned).
  - **The clarification led with the wrong film.** "Which Taken did you mean?"
    offered TAKEN (2025) first. Recency was the documented prior; recognisability
    is what predicts which work a bare name means, and TMDB returns it on every
    search result. Used to ORDER the question, never in identity.
  - **P0-G, first pass: nothing fixed may sit on a vote.** The global feedback
    FAB is fixed bottom-left and landed on "Watch it" on the Verdict Room's
    voting floor at phone widths. `isImmersiveRoute` gains one anchored pattern
    (`^/court/[^/]+$`) plus the two harness routes; a collision spec measures
    the rectangles at 320/390/430 rather than describing them.
  - **Three half-covered vocabularies, found while extending the harness.**
    Each was invisible because the neighbouring case worked.
    - **Plural genre names bound nothing, or bound a strict subject.**
      `genreIdFromName` matches TMDB's singular names, so "comedies" resolved
      to null and fell through the unmapped-genre fallback into
      `requiredSubjects` — a STRICT centrality requirement. One bounded
      morphological rule at the canonical vocabulary boundary.
    - **`GENRE_WORDS` carried `comedies` but not `thrillers`.** "recommend
      thrillers" bound no genre at all. Plurals are now derived from the
      singulars, so a genre cannot be half-covered again.
    - **A request verb became the search topic.** "recommend thrillers" bound
      the SUBJECT "recommend": the subject extractor's guard was a second
      hand-kept copy of vocabulary `clauses.ts` owns. One list now
      (`REQUEST_VERBS`), read by both.
    - **A tone verb was recognised in one form only.** `drag` was listed,
      `drags` was not, so "nothing that drags" dropped the constraint while
      "does not drag" kept it. Verbs carry their inflections by construction
      and normalise to the base term.
  - **A negation that was understood, recorded, disclosed and discarded.**
    P0-C taught the parser that "a thriller that isn't slow" NEGATES slow; the
    mapper sent the veto to `without_keywords` on the word "slow", which almost
    nothing is tagged with, so the request ran as a bare genre browse. A vetoed
    pace word now sets the opposite end of the pace band the finder already
    filters on. An explicitly stated pace still wins.
  - **P0-G forensic sweep — `court-geometry.spec.ts`.** join → lobby →
    advanced → chat → verdict → appeal → voting floor, at 320/390/430/1440,
    reading real geometry. Found one defect: the chat quick replies were 27px
    tall against the room's own 44px standard, at every width. Everything else
    sound; both off-screen strips are genuinely scrollable and are reported
    rather than squeezed.
  - **P0-H part 2 — dynamic range measured, nothing changed on the strength of
    it.** Neither personalization family is decorative (fingerprint moves 72.1%
    of titles at |max| 8; stated preference 88.6% at |max| 10) and neither
    swamps quality (widest base gap a weaker title crossed: 7, ceiling 18). The
    binding constraint is the BASE scale: 18 points across ~24 candidates leaves
    under a point between neighbours, so 74% of adjacent pairs are near ties and
    the median winning margin is 1. **The top-N set is meaningful; the order
    inside it is not.** Widening the base spread is a scoring-engine change
    gated by the 7 spec scenarios — recorded, not attempted.
  - **DISCOVERED — the anchor clarification's option order is only as good as
    TMDB popularity.** After the fix, "Taken" offers the 2017 series ahead of
    the 2008 film, because TMDB's popularity metric decays and currently ranks
    the series higher. Better than leading with an obscure 2025 title, but not
    the same as "what people mean". A durable fix needs vote-count or a
    recognisability blend, and belongs with a wider identity pass.
  - **DISCOVERED — `npm run build` clobbers the Playwright harness bundle.**
    `NEXT_PUBLIC_*` values are inlined at build time by `build:harness`; a plain
    build afterwards leaves the mobile suite serving a bundle with no Supabase
    config, and every court test fails with a React error boundary that looks
    exactly like a product regression. Always re-run `npm run build:harness`
    immediately before a `playwright.mobile.config.ts` run.
- **P0-B/C/D + qualifier + multi-clause (`claude/p0bcd-language`).** Five
  generalized interpreter repairs, each with its cause named:
  - **Axis comparatives reached nobody.** `parseCriticRequest` knew blend,
    better_than and like, but not `<axis> than <anchor>` — the commonest
    comparison in English. "darker than Taken" produced null and routed to
    legacy discovery. `MODIFIER_MAP` already grounded `darker`; only the cue was
    missing. Now `like_but` with anchor + axis. Ungrounded axes ("more intense")
    still route, carrying the phrase as `unresolvedModifiers` rather than being
    forced onto a wrong axis.
  - **Contracted negation INVERTED the request.** "a thriller that isn't slow"
    recorded `slow: wanted` and reached execution as a positive filter. The
    negator vocabulary had "not" and "no" but no `isn't`/`doesn't`/`won't`.
  - **Third-party preference became an order.** "My wife likes comedies."
    classified as a recommendation. Preference detection now covers the
    third-party possessive subject, reusing COMPANION's relationship nouns
    rather than re-listing them.
  - **Requests on someone's behalf were lost.** "Find a comedy my wife would
    like." and "What should my husband and I watch?" fell to the companion
    branch. Request vocabulary gained the bare imperative and the interrogative
    with an intervening subject.
  - **A coordinating "and" swallowed the question.** "I had a burrito and want
    something fun tonight" stayed one clause. Split only when a request verb
    phrase follows, so noun coordination ("cops and robbers") is untouched.
  - **Qualifier loss RESOLVED:** a genre can head the phrase, so "another
    courtroom drama" now binds subject `courtroom` + genre `drama`. A qualifier
    that is itself a genre ("crime comedy") stays a genre.
- **DISCOVERED — a trailing negative fragment does not bind.** "…, nothing
  scary" splits off and classifies as a statement. Attached forms work. Pinned
  in `companionAndThirdParty.test.ts`.
- **DISCOVERED — taste memory across clauses.** "I like Yellowstone. What
  should I watch?" is now a recommendation but retains no anchor for
  Yellowstone; the taste clause is background only.
- **OBSERVED — "a movie my wife and I would both like" caps to 1 result**,
  because "a movie" names a unit of media and the pinned contract reads that as
  a count. Correct per the rule, arguably wrong for a companion request.
- **Natural unframed requests are now requests (`claude/p0a-natural-requests`).**
  Measured against the deployed product, half of ordinary consumer phrasing was
  discarded: "another boxing movie", "a thriller that isn't slow" and "a movie
  my wife and I would both like" all classified as STATEMENTS, so no subject
  bound and nothing survived to the finder. The cause was structural — the
  bare-request rule demanded a PLURAL media noun, and that plural was
  load-bearing because film titles are singular.
  - The discriminator is not number: a clause that OPENS with an indefinite
    determiner, names a medium or genre, and is written as ordinary prose
    rather than Title Case. Anchoring keeps "Rocky is a boxing movie" a
    statement; prose-vs-title keeps "A Goofy Movie" a title, with no title list.
  - `show` stays excluded unless a relative clause disambiguates it, preserving
    the existing "a horror show" guard.
  - This also RESOLVED the unframed-singular limit pinned when the aboutness
    fix landed.
- **DISCOVERED — a genre head does not also yield its qualifier as a subject.**
  "another courtroom drama" binds genre `drama` but drops `courtroom`. The
  subject extractor's noun list is media-only by design. Pinned as a known gap
  in `unframedRequests.test.ts`.
- **DISCOVERED — "My wife likes comedies" already classifies as a
  recommendation** on main, before and after this change. A third-party
  preference statement should not be an order. Not touched here; it predates
  this work and fixing it belongs with companion/household handling (P0-D).
- **Two interpreter defects the deployed Taste DNA proof surfaced — fixed on
  `claude/search-broad-and-subject-binding`.** Neither was a ranking defect:
  personalization behaved correctly on top of a request that had already lost
  its meaning.
  - **A broad genre request was answered with exactly one title.** "Looking for
    a good thriller" set `requestedCount: 1`, because `parseCount` read the
    indefinite article as the numeral against the bare genre head `thriller`.
    An article now enumerates only when the user names a UNIT OF MEDIA ("a
    boxing MOVIE" still means one); a bare genre head is a category reference.
    Numerals are untouched.
  - **An aboutness request bound no subject.** "movies about chess" returned
    Spider-Man, Avengers and Toy Story 5 because `findSubjectMatches` only knew
    the PRE-nominal form ("chess movies"). With `subjects: []` the route never
    set `subjectStrict`, so the aboutness gate never ran and the request decayed
    into generic popularity. The post-nominal "<media> about <topic>"
    construction is now read too. No topic vocabulary was added.
- **DISCOVERED, NOT FIXED — an unframed SINGULAR request is read as a
  statement.** `interpret('a film about grief').kind === 'statement'`, so it
  never reaches subject extraction at all. The plural ("films about grief") and
  the framed singular ("show me a film about grief") both work. This is a
  clause-classification gap: the bare-request rule requires a PLURAL media noun.
  Loosening it is delicate — that same rule is what stops "I like Sylvester
  Stallone movies" from being mistaken for a request — so it is queued rather
  than bundled into the aboutness fix. Pinned as a known limit in
  `src/lib/interpret/broadAndAboutness.test.ts`.
- **Phase 1 — Taste DNA → production recommendation ranking. **MERGED** as PR
  #79 (`ae4d751`), cut from `main` at `1b014f2` (post-#78). Deployed but
  **NOT production-proven** — see `docs/TASTE-DNA-PRODUCTION-PROOF.md`.** Ask's ordering
  is no longer user-independent. `eligibleSurvivors` now pass through
  `personalizeCandidates` (`src/lib/ask/personalRanking.ts`) before the sort,
  and the comparator reads `personal.rankScore` instead of the objective
  `matchScore`. The signal is the **cache-only** half of the existing DNA stack
  (dimension fingerprints + explicit preference), bounded to ±18 by
  `PERSONAL_NUDGE_CEILING` in the pure `src/lib/ask/personalSignal.ts`.
  - **Taste never overrides a hard constraint** — personalization runs strictly
    AFTER the eligibility gate, so a candidate the request ruled out is not
    present to be re-ranked. No second enforcement path was added.
  - **No paid AI in bulk ranking**: `getTitleVector`/`embed()` — the paid half
    of `rankByDna` — is deliberately never reached from Ask. Three DB queries
    per request, independent of pool size (pinned by an O(1)-cost test).
  - With no DNA on file it is an honest no-op: `participated: false`,
    `personalScore: null`, and an order byte-identical to the objective sort.
  - Ledger: `docs/TASTE-DNA-SHIP.md`. Gates all green on the merged SHA, frozen
    corpus untouched (P0 635/635, P1 515/515), corpus sha256 verified against
    the recorded baseline.
  - **The forensic review found two real defects and fixed both:** a paid
    gpt-4o-mini call was reachable from Ask through the profile backfill
    (`getUserDimensionProfile` now takes `{ backfill: false }`, proven by a test
    that watches the network on the real module), and the documented ordering
    of ranking vs the eligibility gate was simply wrong — corrected, with the
    real property (order-independence of `qualifyCandidates`) now pinned.
  - **STATE:** implementation COMPLETE · automated regression proof COMPLETE ·
    deployed no-DNA control PROVEN · real-DNA reordering AWAITING OWNER
    AUTHENTICATED PROOF · production authenticated proof AWAITING OWNER
    AUTHENTICATED PROOF. Nothing in the ranking implementation is missing; what
    is missing is an external observation from a signed-in account with
    naturally accumulated DNA. `docs/TASTE-DNA-PRODUCTION-PROOF.md` reduces that
    to one paste into a browser console — no cookie handling, no credentials,
    no SQL, and output that is field-whitelisted so it is safe to share.
  - **PARTLY PROVEN on a real deployment; the DNA-movement half is still open.**
    `eval/preview/taste-dna-proof.mjs` (run by the `taste-dna-proof` CI job)
    signs in as the real preview identity through the existing
    `preview-test-login` route and asks the deployed `/api/ask` three closure
    queries. No production surface was added: `/api/ask` already spreads the
    whole `FinderItem`, so `matchScore` (the pre-Phase-1 objective score) rides
    next to `personal.rankScore` and the evidence, and before/after arrive in
    the same response.
    - **PROVEN against a real deployment** (preview @ `3f9547c`, real Supabase,
      real signed-in user, 28 items over 3 queries): membership unchanged before
      vs after taste (set equality PASS on all three); no movement outside the
      ±18 ceiling; and a genuine **no-DNA control** — the preview account has no
      stored DNA, so `participated:false` on every item and the personalized
      order was byte-identical to the objective sort. The hard-constraint query
      returned exactly three Stallone films (Rocky, Creed, The Suicide Squad —
      he voices King Shark), so the count and person constraints held.
    - **STILL OPEN:** no account with stored Taste DNA was available, so real
      *reordering* has not been observed on any deployment. Seeding DNA is
      forbidden and would prove nothing anyway.
    - **STILL OPEN:** everything above is PREVIEW. Production `/api/ask` is 401
      without a session, `preview-test-login` is inert on production by platform
      design (`VERCEL_ENV`), and the founder gate needs a server secret. No
      credential path exists that does not require a secret this session must
      not hold. `docs/TASTE-DNA-PRODUCTION-PROOF.md` has the owner's commands —
      one authenticated call suffices.
  - Measured latency on the deployed build is far better than the frozen
    corpus's production p95 suggested: 1.2–1.8s p95 per query steady-state, with
    only the first (cold) call at 5.5–6.7s. The 6.6s figure recorded earlier was
    a cold-cache effect, not a steady-state cost.
  - **Held until then, by the work order:** diversity memory, critic
    personalities, Verdict Room redesign.
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

## Done — final product closure (PR #87, merged as bceaf73; production-verified)

Four gaps closed as general mechanisms. Every one was "computed correctly, then
dropped one layer down", which is why the unit suites were green throughout.

- **P0-A · evidence coverage was unmeasurable and could state a falsehood.**
  Two causes, one symptom. (a) Vercel crons run on PRODUCTION deployments only,
  so the nightly `/api/cron/classify` backfill never runs on the preview where
  0/43 coverage was measured — the preview was never wrong, it was never fed.
  (b) A real defect: `getCachedDimensions` collapsed three outcomes into one
  empty Map — the catalog holds nothing, the table is missing, the service-role
  client could not be built — so the comparative path could tell a reader "none
  of them has a profile on file yet" with total confidence when it had simply
  not looked. `readCachedDimensions` now reports `status: 'ok' | 'unavailable'`
  and `requested`; `/api/ask` discloses the three cases differently and
  `diagnostics.critic.evidence` carries the status.
  `/api/cron/classify?report=1` measures coverage without classifying anything
  and works with no `OPENAI_API_KEY`, behind the same `CRON_SECRET` gate.
- **P0-B · a bare title resolved by decaying popularity.** `AnchorRequest.year`
  had existed since GC2 and nothing ever filled it, so "darker than Taken 2008"
  asked which Taken while holding the answer — and sent the string "Taken 2008"
  to TMDB, which is no title at all. `src/lib/critic/anchorSpan.ts` reads the
  cues the sentence already carried (year, and the framed medium "the X movie"
  / "the X series"), composed from the existing `splitTitleQualifiers` so no
  search-baseline module changes. Clarification order now leads on CUMULATIVE
  audience (`vote_count`) with TMDB's decaying weekly popularity demoted to a
  tie-break — display only; `resolveAnchor` still never reads either, and still
  refuses when the evidence genuinely does not separate two works.
- **P0-C · the ranking had no term for what was asked.** Measured, not assumed:
  over sixty scenario×profile cells the base field spans a median of 18 points
  and three quarters of the order is a near tie — but the real finding was that
  `evaluateSubjectCentrality` had been producing a per-candidate 0..100 on
  request fit and the pipeline used it to FILTER and to DISPLAY and never to
  ORDER. `src/lib/ask/relevanceSignal.ts` adds it as a bounded ±12 channel
  centred on the field's own mean, so the set's average movement is zero by
  construction and a plain genre browse (every candidate satisfies the request
  identically) produces no movement at all. Measured on 15 subject-bearing
  cells: winning margin min 0 / p25 0 / median 2 / p75 3 → min 1 / p25 2.5 /
  median 11.68 / p75 20; winner changed in 47%; |max| exactly 12; non-subject
  cells untouched.
- **P0-E · the card's "Why it fits" was dead everywhere, always.**
  `dimensionFitFor` — the sole source of the card's taste agreements and
  "Heads up" cautions — looked its fingerprint up under `${mediaType}:${id}`
  while the cache writes `${mediaType}-${id}`. A colon where the map has a
  hyphen: the lookup missed on every title for every user, `fit` came back
  null, and both `WhyThisTitle` and `CardFit` rendered nothing personal —
  while `personalRanking.ts` read the same cache correctly and moved the rank.
  The ranking was personalized and the explanation was silent. The key is now
  stated once (`fingerprintKey`) and derived by all ten readers/writers, with
  `dimensionCacheKey.test.ts` as the contract. Second half: the card gated
  every "your …" claim on `ratedCount > 0` while the repo declares
  `MIN_SAMPLES_FOR_FIT = 3` and the ranker scales the same channel by
  `samples / 20` — the claim was loudest exactly where the ranking trusted it
  least. One floor, both surfaces.
- **A closed-class word is never a subject.** "anything except horror" bound the
  SUBJECT "except"; so did "anything BUT horror", "something BESIDES comedy",
  "a movie WITH drama", and — worst — "movies AND shows about chess", which
  demanded every title be about both `and` and `chess`. The pre-nominal rule
  assumes an attributive modifier, which only open-class words can be. The
  closed classes are finite, so the guard states them; the exclusion members are
  DERIVED from the `NEGATORS` vocabulary this file already declares. Also:
  `dumb`, `cerebral` and `challenging` were tone words and `smart` was not, so
  "a smart thriller" became an aboutness filter on "smart" — the axis is
  completed, and a tone with no execution home is disclosed rather than invented
  as a topic.

### Round two — what the deployed proof and the reviewer found

- **A contract pinned to COPY failed on an improvement.** `main` passed the
  deployed-proof workflow; this branch failed it. The contract is "the
  comparison changed the order, OR the deployment said it could not", and it
  read the second half by matching the note against a hand-kept list of
  phrasings. Adding the honest `unavailable` disclosure therefore turned a
  working disclosure into a recorded silence — the product told the truth and
  the harness could not hear it. Third time this shape has cost a red gate in
  one pass, and prose is the worst place to keep a vocabulary because copy is
  SUPPOSED to change. `diagnostics.critic.disclosed` now carries the fact;
  `evidenceCoverage.test.ts` pins that the degraded branch has no silent arm.
- **P0-A's root cause, measured rather than inferred.** At exact head on the
  preview: `critic: 43 candidate(s), 0 fingerprinted, applied=false` with
  `said: I couldn't check what I know about these titles just now`. That is the
  `unavailable` arm — the deployment cannot READ `title_dimensions`. The
  previous report's "0 of 43 coverage" was never zero fingerprints; it was zero
  reads, reported as a fact about the catalog. Confirmed on PRODUCTION,
  unauthenticated: `/api/health/showdown` → `covered: 0, total: 113,
  usable: false`. **This is an environment/credential gap, not a code gap, and
  it is not fixed by this branch — it is now correctly reported.** Remedy is in
  the endpoint's own `remedy` field.
- **A frame is offered, never applied.** The Vercel review caught that `FRAMED`
  stripped any "<article> <name> <medium noun>" — the exact shape of "The Truman
  Show", "Scary Movie", "Silent Movie", "The Daily Show" and "The Rocky Horror
  Picture Show", each truncated to a fragment AND given a wrong hard media
  filter, resolving to nothing, silently. No lexical rule separates them, so
  `readAnchorSpan` returns both readings and `orchestrate` searches the literal
  one first, adopting the frame only when the catalog does not contain it — the
  call `/api/search` already makes for the same ambiguity.
- **"less X" ruled X IN — FIX WRITTEN, THEN REVERTED. BLOCKED, see below.**
  "something like that but less dumb" records `dumb: WANTED`; so does "something
  less slow"; "less gory", "less violent" and "less scary" record nothing at all.
  One phrasing, two wrong answers, and the worse of them is the reversal the
  negation architecture exists to prevent. The fix (a DIMINISHER read at the one
  seam both consumers share, `negatedSpans`, plus `less|fewer` in the clause
  `CONSTRAINT` marker) is correct locally and is NOT in this branch. Why:

  The deployed black-box gate passed 72/72 at `8d80016` with

      Give me a thriller but no supernatural stuff.
      → {"genreIds":[53],"excludeGenreIds":[14]}      CORRECT

  and from `344b991` — the commit carrying the diminisher — returned

      → {"genreIds":[53,14]}   arm: canonical       INVERTED

  on three consecutive SHAs. That is Fantasy promoted from an exclusion to a
  POSITIVE filter: the precise inversion the architecture exists to prevent,
  shipped by a change meant to prevent it one phrasing over.

  The change cannot explain it. Both added alternatives require the literal
  `less`/`fewer`, which that sentence does not contain; the rebuilt
  `negatedSpans` regex is equivalent for any input without those words; and the
  same tree run locally returns `[53]` + `excludeGenreIds:[14]`, verified after
  the change, not before. Local and deployed disagree on identical source, which
  points at the build rather than the source — and that is exactly why it must
  not ride along in a PR about something else.

  NEXT STEP: land it alone, with the black-box gate as its acceptance test, and
  bisect the deployed behaviour rather than the local behaviour. The receipt that
  makes it visible — "the vetoed genre is EXCLUDED, never added as a positive
  filter" — is already in the gate and stays there.

### ENVIRONMENT BLOCKER — the one human action that unblocks personalization

**`SUPABASE_SERVICE_ROLE_KEY` is absent on the production deployment.** Proven
from production's own health endpoint, presence-only, 2026-08-20:

    GET https://clearpath-pearl-chi.vercel.app/api/health
    "checks": { "supabase_url": true, "tmdb_key": true, "openai_key": true,
                "cron_secret": true, ..., "service_role_key": false }

Every other credential is present. This one absence is the entire root cause of:
  - `title_dimensions` unreadable → `/api/health/showdown` `evidence:
    "unavailable"`, covered 0/113 — a READ failure, not a coverage gap
  - comparative recommendations: 0 fingerprinted out of every candidate pool
  - the nightly `/api/cron/classify` writing nothing it can later read
  - `/api/version` `appliedDatabaseMigration: "unknown"` (ledger needs admin)

Nothing in this repository can close it: the session holds no Vercel token, and
inventing or replacing a credential is out of bounds.

EXACT HUMAN ACTION: in Vercel → project `clearpath` → Settings → Environment
Variables, add `SUPABASE_SERVICE_ROLE_KEY` (the service-role key from the
Supabase project dashboard) for Production and Preview, then redeploy.

PROOF OF CLOSURE, in order:
  1. `GET /api/health` → `"service_role_key": true`
  2. `GET /api/health/showdown` → `"evidence": "ok"` (covered may still be 0 —
     that is now a real coverage number, fixed by the classifier)
  3. `GET /api/cron/classify?report=1` with `Authorization: Bearer $CRON_SECRET`
     → real `catalogCoverage` with `evidence: "ok"`
  4. Let the nightly cron run (or fire it once without `report=1`) →
     re-measure; then the deployed personalization proof (taste-dna-proof) can
     demonstrate reordering on an account with stored DNA.

### Discovered here, not fixed (deliberately out of scope)
- **`/api/search` leads with the 2017 Taken series on production right now.**
  Verified unauthenticated against `clearpath-pearl-chi.vercel.app` at
  `256a898`: `?q=Taken` returns tv/2017, then movie/2008. This is NOT the
  anchor path P0-B fixed — for a bare, unqualified query `/api/search`
  deliberately returns "the catalog's own order untouched" (TMDB's), and
  changing that is a frozen-search-baseline change requiring a layerA delta
  against `68a5a93`. The `prominence()` rule in `src/lib/critic/clarify.ts` is
  the mechanism if the owner wants it applied there too.
- **The negator vocabulary exists in three hand-kept copies** in
  `src/lib/interpret/interpret.ts` — `MEDIA_NEGATOR_BEHIND` (line ~114),
  `NEGATORS` (~165) and `negatedSpans`'s own regex (~171) — and they have
  already drifted (`hate[sd]?` vs `hates?|hated`; the first carries no
  contractions at all). The subject guard now DERIVES from `NEGATORS` rather
  than adding a fourth copy, but the three remain. Consolidating them changes
  media-polarity and negation-scope behaviour, so it wants its own work order
  with the metamorphic suite as the gate.
- **`/api/cron/classify` has never run on a preview deployment** and cannot —
  `vercel.json` schedules it and Vercel fires crons on production only. Any
  preview coverage measurement is a measurement of an unfed cache. Use
  `?report=1` to state the number honestly rather than inferring a defect.
- **A trailing POSITIVE fragment is dropped.** "I want a thriller, more gritty"
  and "I want a thriller, gritty" file the fragment as conversational background
  and execute the thriller alone, while "nothing gritty" in the same position
  binds. `CONSTRAINT` is a list of FILTER markers by design, and treating any
  trailing adjective as a constraint would read ordinary asides as requests — so
  this wants its own work order with the metamorphic suite as the gate, not a
  quiet widening inside a negation fix.
- **A bare taste statement drops the taste.** "I love slow burns but I hate
  gore." is `kind: statement` with an EMPTY `requestClause`, so neither tone is
  extracted — not as a tone, not as background. It simply vanishes. The
  mechanism works whenever a request is present ("I want something slow but not
  gory" → `slow: true`, `gory: false`), so this is the statement boundary
  discarding evidence it should keep for the next turn. On the P0-H matrix as
  "cross-clause positive + negative preference".
- **"the Taken movie" resolves to THE TAKEN (2024), not the 2008 film.**
  Deployed at `68a7876`: `PASS (THE TAKEN (2024) — MAYBE at 55) · cues
  honoured`. The medium cue IS honoured — it returns a movie — and the title
  matcher then prefers an exact string match on "The Taken" over the film an
  unqualified "the Taken movie" almost certainly means. `prominence()` orders
  the CLARIFICATION list by cumulative audience; the title-lookup path does not
  consult it. Whether it should is a real question and a separate one.
- **The black-box gate's CASE 4 receipt was too weak to see an inversion.** It
  asserted only that Thriller was PRESENT, which `[53,14]` satisfies, so a
  vetoed genre promoted to a positive filter passed unseen and was caught only
  by which four candidates TMDB happened to return first. The stronger receipt
  ("the vetoed genre is EXCLUDED, never added as a positive filter") is now in
  the gate and green. Worth auditing the other cases for the same shape: an
  assertion that a constraint is PRESENT does not check that its POLARITY
  survived.
- **The canonical interpreter records no title for "Something better for me than
  Furious."** — `intent.titles` is empty; the comparative anchor is owned by the
  critic layer's own extraction (`routeAsk`), not by `interpret()`. Two readers
  of the same sentence, which is the shape that has produced most of this pass's
  defects. Worth consolidating, but it is a live serving path and wants its own
  order.

## Now (other tracks)
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
