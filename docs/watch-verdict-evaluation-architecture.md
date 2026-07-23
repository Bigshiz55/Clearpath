# WatchVerdict — Voice Search Evaluation Architecture

> Phase 1 deliverable. This document traces the **actual** implementation of the
> WatchVerdict search experience from a spoken request through final results, and
> catalogs every point where the system can produce a wrong answer. Nothing here
> is assumed — every claim is anchored to a real file. Line anchors are accurate
> as of the trace date and may drift; treat the file + function name as canonical.

Companion docs:
- `docs/watch-verdict-evaluation-design.md` — the evaluation framework design (contract, generator, evaluator layers, scorecard, taxonomy, optimization loop).
- `CLAUDE.md` — the repo's architecture rules (the deterministic engine is authoritative; AI + fingerprint layers are bounded, sanctioned exceptions).

---

## 0. TL;DR of the reality on the ground

- **Voice is browser-only.** Speech-to-text is the Web Speech API in three
  copy-pasted client handlers. Only the transcript *string* ever reaches a
  server. There is no server-side STT to evaluate; the eval treats the
  transcript as the input and models transcription noise synthetically.
- **There are three different parsers**, each covering a *different* subset of
  intent, and which one runs depends on which UI surface you spoke into and
  whether `OPENAI_API_KEY` is set. There is no single normalized-query contract
  in production. Creating one is Phase 2.
- **The deterministic scoring engine (`src/lib/scoring/`) is genuinely pure and
  authoritative**, with 7 enforced spec scenarios. This is the trustworthy core
  and the natural anchor for gold evaluation.
- **Most failure risk is concentrated in parsing, time-window interpretation,
  network/platform mapping, retrieval caps, and schedule timezone handling** —
  not in the scoring math.
- **"DNA" is two overlapping systems** (embedding centroids + a 15-axis content
  fingerprint). Note the docs say "18 axes" but the code has **15**.

---

## 1. The end-to-end flow (spoken request → results)

```
                          ┌─────────────────────────────────────────────┐
   🎙 user speaks         │  Web Speech API (browser only)               │
   "Pull up five         │  AskTheJudge.tsx / HomeGreeter.tsx /          │
    Lifetime movies      │  SearchBar.tsx  → transcript string           │
    in the next 24h      │  (maxAlternatives=1, top hypothesis only)     │
    that I'd like"       └───────────────┬─────────────────────────────┘
                                          │ transcript (typed input enters here too)
                     ┌────────────────────┼─────────────────────────────┐
                     ▼                    ▼                             ▼
          POST /api/build-case      POST /api/ask                POST /api/finder
          (BuildCaseBox, text)      (AskTheJudge voice)          (FinderUI, deep-link)
                     │                    │                             │
     ┌───────────────┴───────┐            │                             │
     │  ROUTING CASCADE       │           │  parseAskWithAI (LLM)        │  parseAskWithAI (LLM)
     │  (first match wins)    │           │  ↓ fallback                  │  ↓ fallback
     │ 1 extractWatchTitle    │           │  naiveParseQuery (regex)     │  naiveParseQuery (regex)
     │ 2 parseWithAi/Naive    │           │  + resolvePersonId           │  + provider graft
     │   (WRITES Taste DNA)   │           │  + askSimilarTo              │
     │ 3 detectPlatform       │           └──────────┬───────────────────┘
     │ 4 detectAiringHorizon  │                      │  FinderQuery
     │ 5 findWords+findVerb   │                      ▼
     │ 6 fallback (build DNA) │            runFinder(supabase, userId, query, watcher, limit)
     └──────────┬─────────────┘                      │
                │ redirect URL                        │  1. getProfile → region
                ▼                                     │  2. discoverTitles (TMDB, ×types ×2 pages)
       /app/tv?within=&network=   ← airing            │  3. exclude seen (watchlist watched/dropped)
       /app/finder?providers=&q=&run=1  ← platform    │  4. CANDIDATE_CAP = 16
       /app/title/{t}/{id}   ← where-to-watch         │  5. per-candidate: getScoringData → buildVerdict
       /app/watch   ← taste                           │     + HARD FILTERS (runtime/era/audience/imdb/
                │                                       │       english/services/streamIt/binge/pace/match)
                ▼                                       │  6. sort by personal match score (NO rankByDna)
       ┌──────────────────────┐                        │  7. relaxed fallback if empty
       │  TV guide (broadcast) │                        │  8. airing enrichment (getNextAiring)
       │  getUpcomingTv        │                        ▼
       │  ├ TVmaze (start-only) │                 FinderResult { items, scoredFor, relaxed, total }
       │  ├ Gracenote (in-prog) │                        │
       │  └ stored tv_grid      │                        ▼
       └──────────┬─────────────┘             FinderUI renders cards + receipts + DnaScore (per-title)
                  ▼
           OnTvGuide cards + TMDB-by-title enrichment
```

### 1.1 Voice capture (browser only)
- `src/components/AskTheJudge.tsx` (`startVoice`), `src/components/HomeGreeter.tsx`
  (`startVoice`), `src/components/SearchBar.tsx` (`startVoice`). All use
  `window.SpeechRecognition || webkitSpeechRecognition`, `lang='en-US'`,
  `interimResults=false`, `maxAlternatives=1`. Only `results[0][0].transcript`
  is kept.
- **No server STT, no whisper, no MediaRecorder.** The transcript is fed into
  the same text pipeline as typed input.
- The three surfaces then diverge: AskTheJudge → `naiveParseQuery` + POST
  `/api/ask`; HomeGreeter → `router.push('/app/ask?q=…')`; SearchBar branches on
  a local `looksLikeRequest` heuristic (request → `/app/ask`, else title search).

### 1.2 Server intent routing — `src/app/api/build-case/route.ts`
`POST` is a **priority cascade**; the first detector that fires returns and
short-circuits. Order (load-bearing):
1. `extractWatchTitle` → where-to-watch → `/app/title/{mediaType}/{id}`.
2. `parseWithAi(text) ?? parseNaive(text)` → **side-effecting write** of taste
   axes + liked/avoid titles into `dimension_signals`/`watchlist_items` *before*
   routing decisions 3–5.
3. `detectPlatform` gated by `wantsFind` → `/app/finder?providers={id}&q=…&run=1`.
4. `detectAiringHorizon` → `/app/tv?within={h}&genre=&network=&type=movie`.
5. `findWords && findVerb` → `/app/finder?q=…&run=1`.
6. Fallback → no redirect, just builds DNA.

### 1.3 Query parsing (three parsers, one intent space)
- **`naiveParseQuery`** — `src/lib/finderParse.ts` (pure, client-safe). Regex/
  keyword → `FinderQuery`. Cannot express provider, actor, era range, negated
  genre, keyword/trope, or live-TV intent (those fields are only set by the LLM
  or deep-links).
- **`parseAskWithAI`** — `src/lib/askParse.ts` (server-only). gpt-4o-mini,
  temp 0, 8s timeout, `json_object`. Fills genre/mood/keyword/people/count/etc.
  **Has no provider/streaming field at all.** Degrades to `null` → caller falls
  back to `naiveParseQuery`.
- **build-case detectors** — `detectPlatform`, `detectNetwork`, `detectGenre`,
  `detectAiringHorizon`, `extractWatchTitle`, `parseNaive` (module-local, pure,
  **not exported** today). These are the richest for provider/network/airing but
  have no era/keyword axis.

### 1.4 Retrieval + filtering + ranking — `src/lib/finder.ts` `runFinder`
- Region from profile; candidate pull via `discoverTitles(mt, …)` over media
  types × pages [1,2], sorted `popularity.desc`.
- Excludes `watchlist_items` with status `watched`/`dropped` (saved/queued still
  surface).
- **`CANDIDATE_CAP = 16`** — only 16 candidates are ever hydrated + scored.
- Per candidate: `getScoringData` (TMDB + OMDb + MDBList) → `buildVerdict`, then
  a sequence of hard filters (runtime, recency, era, audience, imdb, english
  audio, on-my-services, streamItOnly, bingeableOnly, pace band, minMatch).
- **Ranking = pure sort by `report.personal.score`.** `runFinder` does **not**
  call `rankByDna`; the ±8 fingerprint nudge is only used on `/app/watch`,
  `browse`, and `dna.ts` — not in the finder.
- **`relaxed`** fires only when `items.length === 0` and (`minMatch != null` or
  `onMyServices`); it retries once, dropping both constraints together.

### 1.5 Broadcast schedule — `src/lib/onTv.ts` + `gracenote.ts` + `tvGrid.ts`
- `getUpcomingTv(country, nowMs, horizonMs≤48h, genre, network, movieOnly)`.
- **Three sources with inconsistent in-progress semantics:** TVmaze path drops
  anything with `airstamp < nowMs` (start-only window); Gracenote and the stored
  `tv_grid` **include in-progress** (`end > nowMs && start ≤ horizon`).
- **All Gracenote/stored times are hardcoded America/New_York** (`etTime`),
  regardless of the user's timezone. Day labels on `/app/tv` render in UTC.
- Merge dedups on `showName|airstamp`; Gracenote internally dedups on
  `callSign|startTime`.

### 1.6 Personalization / Taste DNA
- **No single profile table.** A user's taste is reconstructed at request time
  from `watchlist_items.rating` (1..10), `dimension_overrides` (manual pins),
  `dimension_signals` (reason nudges), and `title_dimensions` (global fingerprint
  cache).
- **Family A — embeddings** (`src/lib/dna.ts` + `scoring/dna.ts`): liked/disliked
  centroids from rated titles → the VERD1CT/DnaScore number, and `rankByDna`'s
  base.
- **Family B — 15-axis fingerprint** (`titleDimensions.ts` + `scoring/dimensions.ts`):
  gpt-4o-mini classifier cached in `title_dimensions`; the user's profile vector
  drives the bounded ±8 nudge in `rankByDna` and the `/api/dna-score` "strength"
  meter (cosmetic).
- **The deterministic engine** (`scoring/general.ts`, `personal.ts`, `verdict.ts`)
  is pure and authoritative; `SCOTT_RULES` (`preferences.ts`) is a real, ready-to-
  use test profile.

### 1.7 Feedback writes — `src/lib/actions/passFeedback.ts`
| feedbackType | watchlist status | rating written |
|---|---|---|
| `seen` (+rating) | `watched` | pass-through 1..10 |
| `didnt_like` | `watched` | `rating ?? 2` |
| `not_for_me` (no reasons) | `dropped` | `3` |
| `not_for_me` (+reasons) | `dropped` | no rating; axis nudges only |
| `removed_without_reason` | `dropped` | none |
| `not_right_now` | reverts a prior drop | none (temporary) |

There is **no fixed `seen=8`/`liked=9`** — `seen` passes the user's chosen score.
Only `didnt_like → 2` and unreasoned `not_for_me → 3` are synthetic.

---

## 2. Data + code surfaces the evaluator depends on

### 2.1 Directly importable (pure, no `server-only`, offline) — the safe eval surface
- `src/lib/scoring/*` — `buildVerdict`, `tierFromScore`, `dispositionFromScore`,
  `SCOTT_RULES`, `computeGeneralScore`, `computePersonalMatch`, `computeStandardScore`,
  `dimensions.ts` (15-axis math, `buildProfile`, `DIMENSION_KEYS`), `scoring/dna.ts`
  (`cosine`, `buildTasteDna`, `dnaScore`), `reranker.ts`.
- `src/lib/finderParse.ts` — `naiveParseQuery`, `describeQuery`, `EMPTY_QUERY`.
- `src/lib/services.ts` — `includedServiceNames`, `tonightAvailability`,
  `STREAMING_SERVICES`, `expandSelected`.
- `src/lib/aiAdjustParse.ts` — `parseAdjustment`, `MAX_ADJUSTMENT`.

### 2.2 Blocked by `import 'server-only'` (need a shim + injected fakes)
- `src/lib/finder.ts` (`runFinder`), `src/lib/dna.ts` (`rankByDna`),
  `src/lib/tmdb/client.ts` (`discoverTitles`, `searchTitles`), `titleData.ts`,
  `titleDimensions.ts`, `onTv.ts`, `tvGrid.ts`, `gracenote.ts`, `profile.ts`, and
  every `src/lib/actions/*` server action.
- The build-case detectors are pure but **module-local inside a route handler**,
  so they cannot be imported without a refactor.

### 2.3 Database tables an evaluator snapshots (all owner-RLS unless noted)
`profiles` (region, my_services, personal_label, liked_franchise_ids),
`watchlist_items` (the ground-truth rating signal), `preference_rules`,
`verdicts`, `title_dimensions` (public SELECT, service-role write),
`dimension_overrides`, `dimension_signals`, `recommendation_feedback` +
`_events` (structured rejection signal), `analytics_events` (INSERT-only; reads
need service role — **the raw-query mining table**, via `logCase` →
`name:'case_parsed'`, `props.text`), `tv_grid` (service-role only), `tv_reminders`.

### 2.4 Env needed to run a real search
Hard-required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, **`TMDB_API_KEY`**. Optional/degrades: `OPENAI_API_KEY`
(AI parse + fingerprint classifier → falls back to regex/deterministic), `OMDB_API_KEY`,
`MDBLIST_API_KEY`. Validation is lazy at request time (`src/lib/env.ts`).

---

## 3. Failure-point catalog (where a wrong answer can originate)

Each row maps to a **failure-taxonomy category** used by the evaluator
(`eval/evaluator/taxonomy.ts`).

| # | Location | Failure mode | Taxonomy category |
|---|---|---|---|
| F1 | Web Speech `onerror` (all 3 handlers) | every recognition error collapses to a silent state reset; no "mic blocked" vs "didn't hear you" | speech_transcription |
| F2 | `maxAlternatives=1` | better 2nd hypothesis discarded before parsing; misrecognitions propagate | speech_transcription |
| F3 | build-case cascade order | platform detected *before* airing → "Lifetime movie tonight on Netflix" never reaches the airing branch | intent_classification |
| F4 | `parseWithAi`/`parseNaive` at steps 2 | **taste DNA written before routing**; a misparsed "loved" title pollutes the profile on a pure lookup | query_normalization |
| F5 | `extractWatchTitle` `clean()` stopwords | drops legit titles starting with It/A/An/Some ("A Quiet Place", "It") | entity_extraction |
| F6 | `extractWatchTitle` `\s+on…$` strip | truncates titles containing " on " mid-title | entity_extraction |
| F7 | `detectGenre` first-match | single-genre only; "crime thriller" → Crime, drops Thriller | entity_extraction |
| F8 | `detectNetwork` vs `GN_NETS` key drift | a network recognized by `detectNetwork` but absent from `GN_NETS` → `?network=key` the TV page can never satisfy → silent empty | entity_extraction / provider_data |
| F9 | `detectPlatform` `hbo`→Max(1899) | conflates HBO linear channel with Max streaming; "HBO" means different things on airing vs platform branch | entity_extraction |
| F10 | `naiveParseQuery` `maxRuntime=150` default | silent 2.5h cap the user never asked for; hidden by `describeQuery` | query_normalization |
| F11 | `naiveParseQuery` substring genre scan | "crime" fires inside "true-crime docuseries" (no word boundary) | query_normalization |
| F12 | `parseRequestedCount` first-number | "movies from the last 5 years" → count=5; "a couple/a few" unhandled → default 8 | query_normalization |
| F13 | `detectAiringHorizon` requires a cue | "tonight" alone (no airing cue) → taste, not the guide; no clock-time parsing ("at 8pm") | time_interpretation |
| F14 | ET-only Gracenote/stored times | Pacific user sees ET clock; 3h perceived-airtime error | time_interpretation / provider_data |
| F15 | TVmaze start-only vs Gracenote in-progress | merged 24h list has inconsistent inclusion of currently-airing programs | schedule_filtering |
| F16 | `runFinder` `CANDIDATE_CAP=16` + 2 pages | a strong match below the 16th popularity slot is dropped pre-scoring | candidate_retrieval |
| F17 | `runFinder` per-candidate `try/catch→null` | transient TMDB/OMDb error silently shrinks results; "relaxed" may fire for infra reasons | candidate_retrieval / performance |
| F18 | `discoverTitles` error→`[]` | zero candidates on a transient error is indistinguishable from a genuinely empty match set | provider_data |
| F19 | provider staleness (TMDB watch/providers) | `where`/`included` names a provider the title has since left | subscription_filtering |
| F20 | `onMyServices` false negative | title genuinely on Netflix but missing TMDB region data → dropped | subscription_filtering |
| F21 | `providerIds` path skips `includedServiceNames` post-filter | explicit-provider search trusts only TMDB `with_watch_providers`; leaks if TMDB is stale | subscription_filtering |
| F22 | `/api/finder` provider graft only when `body.query` present | pure free-text "movies on Netflix" has no provider field in askParse → Netflix silently ignored on the finder path | entity_extraction |
| F23 | silent LLM→regex degradation (8s/12s timeouts, `catch{null}`) | a degraded parse is indistinguishable from an intended one in the response | query_normalization |
| F24 | `resolvePersonId` / askParse `people[0]` | single-name stars unresolved; TV-actor search forced to movie-only | entity_extraction |
| F25 | `not_for_me`+reasons writes no rating | moves Family-B axes but is invisible to Family-A embeddings | taste_dna_calculation |
| F26 | uncalibrated `STANDARD_WEIGHTS` (`v1-prior`, `trainedAt:null`) | quality blend never fit to real ratings | ranking_weights |
| F27 | `relaxed` drops match+services together | can't tell which single constraint caused the empty set | empty_result_handling |
| F28 | dead `source:'voice'` analytics label | spoken vs typed can't be separated in logs | test_data_defect (mining) |

**Honest-behavior surfaces (good, and asserted by the eval as *expected*):**
- `getGracenoteAirings` returns `[]` for an unmappable network rather than guessing.
- `pickTitleMatch` requires an exact normalized title (±1yr) before attaching a Save.
- `/app/tv` renders an explicit "we only show what we can confirm" panel and links
  the official network schedule instead of dumping unrelated shows.
- `discoverTitles` filters poster-less rows; never invents a listing.

---

## 4. What the evaluation framework will do about it

The framework (see the design doc) attacks the highest-risk surfaces first:

1. **Parsing layer (Layer A)** — graded against the **real** production parsers.
   `naiveParseQuery` is already pure; the build-case detectors are extracted into
   a pure exported module (`src/lib/nlu/detectors.ts`, behavior-preserving, with a
   parity self-test) so the evaluator grades production logic, not a copy.
2. **Hard constraints + recall + ranking (Layers B/C/D)** — a fixture-backed
   pipeline runs the **real** pure filter predicate (extracted from `runFinder`)
   and the **real** `buildVerdict` scoring over frozen catalogs, so constraint
   validity and ranking are graded against known-correct answers offline, with no
   network and full reproducibility.
3. **Response quality (Layer E)** and **performance (Layer F)** — graded on the
   assembled result payload and timings.
4. **Live-data observation mode** — a small, budgeted path that exercises the real
   TMDB/schedule stack for freshness/latency/hallucination checks, kept strictly
   separate from the deterministic verdicts.

The two behavior-preserving extractions (`nlu/detectors.ts` and the finder
hard-filter predicate) are the *only* production touches required to make the
system testable at scale; both are covered by parity self-tests so the baseline
is taken against unchanged behavior.
