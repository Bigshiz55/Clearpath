# WatchVerdict — Multi-Stage AI Retrieval Pipeline

Goal: WatchVerdict should feel like an **intelligent entertainment expert**, not a
keyword search box. A literal search must **never** end in a bare "No results" — the
user should almost never hit a dead end.

Branch: `feature/search-dna-and-search-lab` (isolated). Nothing merged or deployed.

---

## Honesty boundary (non-negotiable)

The repo rule is: **never fabricate ratings, provider availability, cast, schedules,
or titles.** "Never a dead end" is therefore met with **honest interpretations and
useful suggestions**, never invented titles. Concretely:

- Recovery Mode only ever offers concrete titles that a real source actually
  returned; it never manufactures one. (Unit-tested.)
- Sources that need infrastructure we don't have yet (embeddings index, live-TV
  feed, trending, streaming-provider search) declare themselves **unavailable** and
  contribute nothing — they are reported under `sourcesUnavailable`, not faked.
- The benchmark runs against a clearly-labelled fixture **index** (real title
  strings used as search entries), never as user-facing fabricated results.

## The six stages

All stages are PURE (no I/O) and live in `src/lib/search/retrieval/`. Sources are
injected, so the whole pipeline runs offline in tests/benchmark and with real
adapters in production. It degrades gracefully with **no OpenAI key** (architecture
rule) — the deterministic core stands alone.

1. **Intent Understanding** (`intent.ts`) — infers the top intent (title lookup,
   similar-to, actor, franchise, genre, availability, schedule, upcoming,
   recommendation) plus secondary intents; detects **incomplete** fragments,
   **conversational** phrasing, and **implied** searches; extracts entities (title,
   franchise, genre, network, platform, count, horizon). Strips greeting/filler so
   "hey inception tonight" resolves to the title.
2. **Query Expansion** (`expand.ts`) — generates a de-duplicated set of alternate
   queries (20–100 for a non-trivial input) via spelling correction, plural/
   singular, franchise expansion, aliases, abbreviations, semantic equivalents,
   sub-phrase windows, and common wording. TMDB alternate titles are an async source
   merged by the pipeline (see below).
3. **Parallel Search** (`sources.ts`) — a `SearchSource` contract with a registry
   run in parallel (`searchAll`). Wired pure sources: fuzzy-title and alias over a
   provided index. Provider/embeddings/live-TV/trending are interface-declared and
   report unavailable until wired — never fabricated.
4. **Confidence Engine** (`confidence.ts`) — scores every candidate 0..1 (exact →
   token-window → fuzzy edit distance, modulated by expansion weight and source
   trust), bands it high/medium/low, and ranks + de-duplicates by id.
5. **Recovery Mode** (`recovery.ts`) — when nothing clears the confidence bar, it
   returns interpretations (likely readings, each re-runnable), suggestions
   (did-you-mean, real near-miss leads, browse/refine navigation), and **at most one**
   clarifying question (only when incomplete/ambiguous). Guaranteed non-empty.
6. **Search Lab logging** (`log.ts`) — a typed `SearchLogEntry` (original query,
   rewritten queries, candidates, confidences, outcome, sources, and append-only
   user-selection / abandonment / final-result fields) plus a pluggable sink. The
   default sink is in-memory, so this ships with **no database migration** (durable
   persistence is a separate, approval-gated change).

Orchestrator: `pipeline.ts::runRetrieval` chains the stages and returns a
`RetrievalResult` that is **never** empty-and-helpless — when `results` is empty,
`recovery` is always populated. Invariant asserted by unit tests and the benchmark.

## Production wiring (this change)

`src/app/api/ask/route.ts`: when discovery (`runFinder`) returns zero items, the
route now returns `kind: 'recovery'` (interpretations + suggestions + optional
clarifying question) instead of an empty `kind: 'search'`. This is the minimal,
honest integration that delivers the never-dead-end promise in production today.
Full source-adapter wiring (TMDB search → `Candidate[]`, embeddings, live-TV) is the
next integration step and is interface-ready.

## Automated benchmark + quality targets

`eval/searchlab/benchmark/` generates thousands of natural-language queries
(seeded/deterministic), runs them through the pipeline offline against the fixture
index, evaluates retrieval quality, writes a regression report, and **asserts
predefined targets** — a regression cannot ship.

Run: `npm run search-lab:benchmark` (scale via `SEARCHLAB_BENCH_N`, default 2000;
seed via `SEARCHLAB_BENCH_SEED`). Artifacts: `search-lab-results/benchmark/`.

Targets (`targets.ts`) and the current result (seed 1234, N=2000):

| metric | target | actual |
|---|---|---|
| never-dead-end rate | 1.000 | **1.000** |
| recovery completeness | 1.000 | **1.000** |
| intent accuracy | 0.850 | 0.904 |
| resolution recall (confident) | 0.850 | 0.994 |
| resolution recall (confident or lead) | 0.900 | 1.000 |
| mean expansions | 8 | 19.9 |

The two HARD gates — never-dead-end and recovery-completeness — are both 1.0: across
2000 diverse queries (typos, aliases, conversational wrappers, incomplete fragments,
franchise/genre/availability/schedule/upcoming asks) **not one** terminated without
either a confident result or complete recovery help.

## Tests

- `src/lib/search/retrieval/pipeline.test.ts` — 20 tests across intent, expansion,
  confidence, recovery (incl. the no-fabrication guarantee), the pipeline invariant,
  and logging.
- Benchmark runner self-asserts all quality targets on every run.

## What is complete vs staged

- **Complete + tested:** intent, expansion, confidence, recovery, logging schema,
  the pure pipeline, the ask-route never-dead-end wiring, and the automated
  benchmark with enforced targets.
- **Interface-ready, honestly unavailable (staged):** embeddings index, live-TV
  schedule, streaming-provider search, and trending as pipeline sources; the durable
  Search Lab sink (needs an approval-gated migration); TMDB alternate-titles merged
  as an async expansion source; a live TMDB `Candidate[]` search adapter.

## How to run everything

```
npm run typecheck && npm run lint && npm test
npm run search-lab:gated && npm run search-lab:audit
npm run search-lab:calibrate && npm run search-lab:benchmark
npm run build
```
