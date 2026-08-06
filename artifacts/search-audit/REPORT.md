# Forensic 1,000-query search & recommendation audit — WatchVerd1ct

**Measurement only. No production code was changed.**

| | |
|---|---|
| Repository | `Bigshiz55/Clearpath` |
| Branch | `main` |
| `main` SHA | `d68d0a0f9990a7de7f7ff938e719e2f9cc1dc0a5` |
| Deployed SHA (verified, not assumed) | `d68d0a0f9990a7de7f7ff938e719e2f9cc1dc0a5` — from `GET /api/version`: `branch main`, `deployedAt 2026-08-05T23:36:03Z`, `vercelEnv production` |
| Vercel deployment status | Serving. 889 live requests across two passes, **0 transport errors**, p50 154 ms |
| Production configuration | `DATA_MODE` unset → `/api/health/tv` reports `verdict: configuration_error`, `ingestionDisabled: true`. Migration 0044 not applied (24/24 objects absent). Neither affects search: `/api/search` reads TMDB directly and was fully operational throughout. |
| Corpus | 1,000 tests, seed `WATCHVERDICT_FORENSIC_SEARCH_20260805`, sha256 `32fbe0234141fcf272e31b1e666ee53edb14b29caf5cbe9fd684121e67711002` |
| Frozen before execution | Yes — corpus and oracle were written, validated and hashed before the first test ran |
| Determinism | Two full passes at all three layers. **Zero** verdict changes, zero top-result changes, zero route changes. |

---

## 1. What was tested, and where

| Layer | What it is | Tests | Status |
|---|---|---|---|
| **A** | **Live production API** at `https://clearpath-pearl-chi.vercel.app`. Open endpoints only (`/api/search`, `/api/person-search`). 889 distinct live requests per pass, concurrency 6, one request per distinct query. Routing judged by running the shipped `resolveSearchDestination` against the real results. | 900 judged, 100 not verified | **Live** |
| **B** | **Shipped interpretation modules, imported not recreated**: `classifySearch`, `buildQueryPlan`, `classifySearchIntent`, `naiveParseQuery`, `augmentInternational`, `effectiveConstraints`, `buildSearchQa`. Offline, no network. | 504 judged, 496 deferred to A | **Shipped code** |
| **C** | **Browser (Chromium 1194)** driving the shipped `SearchBar` on a **local production build of the deployed commit**, replaying **only frozen live responses captured in Layer A**. 200 desktop cases at 1440×900 (10 per category × 20 categories), 67 mobile at 390×844. | 267 | **Local browser, production data** |

**Live browser testing did not occur and is not claimed.** Chromium in this environment cannot reach the deployed site: `page.goto('https://clearpath-pearl-chi.vercel.app/api/version')` fails with `net::ERR_CONNECTION_RESET`. Layer C therefore runs the same commit locally and serves it the real production bytes. Every routing claim in Layer C was independently predicted by Layer A against the live API, and the two agree.

---

## 2. Headline result

| Metric | Value |
|---|---|
| Corpus size | 1,000 (20 categories × 50) |
| Conversational / incomplete / ambiguous | 550 (requirement: ≥350) |
| Multi-turn sequences | 100 (requirement: ≥100) |
| Distinct query bodies | 963 of 1,000 |
| Distinct reference titles | 100 |
| **Layer A pass rate (live)** | **715 / 900 = 79.4%** |
| **Layer B pass rate (interpretation)** | **266 / 504 = 52.8%** |
| Layer C fatal failures (leaks, crashes) | **0 of 267** |
| P0 | 113 |
| P1 | 306 |
| P2 | 4 |
| P3 | 0 |
| Not verified | 100 at Layer A (multi-turn), 496 deferred B→A |
| Latency p50 / p90 / p95 / p99 / max | 154 / 173 / 186 / 466 / 765 ms |

---

## 3. The primary question

> Can an ordinary person type an exact title, misspell it, speak conversationally, describe what they liked, combine constraints, be vague, change their mind, ask what to watch tonight, refer to their own history, or ask for something similar — and get back what they meant?

**Finding a specific title or person: partly.** A correctly-typed title works
(92% movies, 88% TV). Everything short of that degrades sharply, and two
failure modes are total.

**Understanding a natural-language request: the routing works; the
understanding does not.** 379 of 388 recommendation requests are correctly sent
to the Judge rather than opened as a title — the router does its job. But the
shipped interpretation layer captures only 52.8% of the hard constraints those
requests state, and for two categories it captures essentially none.

---

## 4. Per-category scorecard

| Category | Live pass rate | Interpretation pass rate | P0 | P1 | P2 |
|---|---|---|---|---|---|
| exact_movie_titles | 92.0% (50) | — | 1 | 0 | 3 |
| exact_tv_titles | 88.0% (50) | — | 5 | 0 | 1 |
| people | **50.0%** (50) | — | 25 | 0 | 0 |
| punctuation_and_articles | 98.0% (50) | — | 0 | 1 | 0 |
| franchise_and_year_disambiguation | **8.0%** (50) | — | 43 | 3 | 0 |
| misspellings_and_speech_errors | **10.0%** (50) | — | 38 | 7 | 0 |
| partial_and_autocomplete | 50.0% (50) | — | 0 | 25 | 0 |
| simple_nl_recommendations | 100% (30) | 60.0% (50) | 0 | 20 | 0 |
| similarity_requests | 96.7% (30) | **22.9%** (48) | 1 | 37 | 0 |
| date_runtime_rating_constraints | 100% (50) | 60.0% (50) | 0 | 20 | 0 |
| mood_genre_tone_occasion | 100% (50) | 100% (50) | 0 | 0 | 0 |
| negative_constraints | 100% (30) | **0.0%** (50) | 0 | 50 | 0 |
| service_and_availability | 100% (30) | 46.0% (50) | 0 | 27 | 0 |
| group_and_conflicting_tastes | 100% (30) | 28.0% (50) | 0 | 36 | 0 |
| history_dna_and_saved | 100% (50) | **4.0%** (50) | 0 | 48 | 0 |
| long_messy_conversational | 100% (50) | 100% (50) | 0 | 0 | 0 |
| ambiguous_needs_clarification | 82.0% (50) | 100% (50) | 0 | 9 | 0 |
| international_unicode_emoji | 54.0% (50) | 100% (6) | 0 | 23 | 0 |
| malformed_and_extreme | 100% (50) | — | 0 | 0 | 0 |
| security_and_injection | 100% (50) | — | 0 | 0 | 0 |

"—" means the layer had nothing to assert for that category, not that it passed.

---

## 5. The defects, most severe first

### D1 · A misspelling finds nothing at all — 38 P0 + 7 P1 (P0)

`/api/search` forwards the query verbatim to TMDB, which does not do fuzzy
matching. There is no correction, no did-you-mean, no fallback.

| Typed | Meant | Returned |
|---|---|---|
| `Roocky` | Rocky | **0 results** |
| `Raigng Bull` | Raging Bull | **0 results** |
| `Southapw` | Southpaw | **0 results** |
| `Parsaite` | Parasite | **0 results** |
| `The Holday` | The Holiday | **0 results** |
| `Knivse Out` | Knives Out | **0 results** |
| `Crah` | Crash | `Cra$h & Burn` |
| `UUs` | Us | `Uus Elu 451` |

A single transposed character is fatal. This is the highest-volume real-user
failure in the audit.

### D2 · A year or a medium hint destroys the search — 43 P0 (P0)

The disambiguating words a person naturally adds are passed to the catalog as
part of the title.

| Typed | Meant | Returned |
|---|---|---|
| `Creed 2015` | Creed | **0 results** |
| `Dune 2021` | Dune | **0 results** |
| `Crash 2004` | Crash | **0 results** |
| `Fargo the series` | Fargo (TV) | **0 results** |
| `It 1990 miniseries` | It (miniseries) | **0 results** |
| `The Killing Danish original` | Forbrydelsen | **0 results** |
| `It 2017` | It (2017) | `Security` |

Adding information makes the search strictly worse — the exact opposite of what
a user expects. 46 of 50 tests in this category fail.

### D3 · A person's name only works bare — 25 P0 (P0)

`/api/person-search` matches the whole string. Bare names resolve; any natural
phrasing returns nothing.

| Typed | Returned |
|---|---|
| `Sylvester Stallone` | ✅ id 16483 |
| `who is Sylvester Stallone` | **0 results** |
| `films with Michael B. Jordan` | **0 results** |
| `Gary Sinise movies` | **0 results** |
| `David Fincher filmography` | **0 results** |

### D4 · Negative constraints are never captured — 50 P1, 0% (P1)

"No documentaries", "nothing supernatural", "not as gory", "nothing
depressing", "not too violent" — the shipped parser produces **no**
`excludeGenreIds` for any of them. Every one of the 50 tests in this category
loses its exclusion. A user who says "no horror" is not being told no; they are
being ignored.

### D5 · "What I've already watched" is not understood — 48 P1, 4% (P1)

`plan.personalized` is false and no exclusion is recorded for "what did I not
finish", "show me Hallmark movies we have not already watched", "more like the
things in my watchlist", "find true-crime episodes about cases I have not
already seen". 48 of 50.

### D6 · Similarity references are dropped — 37 P1, 22.9% (P1)

The reference title, the freshness qualifier and the exclusion of the reference
itself are lost in 37 of 48 judged similarity requests, including every
multi-turn one.

### D7 · An ambiguous phrase silently opens an unrelated title page — 9 P1 (P1)

Confirmed independently at **both** the live API and in a real browser. Because
`resolveSearchDestination` lets an exact catalog match win outright, a vague
phrase that happens to be a film's literal name becomes a destination:

| Typed | Opened |
|---|---|
| `something good` | `/app/title/movie/236329` |
| `the one with the guy` | `/app/title/movie/12089` |
| `a movie` | `/app/title/movie/128682` |
| `newer` | `/app/title/movie/1007663` |
| `not that` | `/app/title/movie/10184` |
| `the sequel` | `/app/title/movie/1163319` |
| `\n\r\t` (malformed) | `/app/title/movie/568522` |

The corpus classified all of these **B — clarification required**. The system
answers with certainty instead.

### D8 · Non-English and non-Latin input degrades — 23 P1 (P1)

`寄生虫` finds Parasite at rank 9 (outside the top 8). `El Padrino` returns a
different film. `👻 ghost show` and `🥊 movies` return nothing. Diacritics
themselves are handled correctly — `Amélie`, `Amelie` and `Pan's Labyrinth` all
resolve — so the defect is transliteration and alternate-language titles, not
encoding.

### D9 · Prefixes do not complete — 25 P1 (P1)

`A Christma` → *A Christmas Carol*, not *A Christmas Prince*. `Breakin` →
*Breakin'*, not *Breaking Bad*. `Bar` → *The Bar*, not *Barbie*. TMDB matches
literal short titles rather than completing toward a longer one. (Very short
prefixes — `G`, `The` — are weak tests and their failures should be discounted;
the named cases above are not.)

### D10 · Series-level and prefixed titles miss — 5 P0, 4 P2 (P0/P2)

`Poirot` → *Agatha Christie's Poirot* (the exact string is absent from the
results). `Dateline NBC` → *Dateline*. `Murder, She Baked` → *Murder, She
Baked: Just Desserts*. `Aurora Teagarden Mysteries` → a specific instalment.
There is no alias or series-level matching. Part of this is the corpus asking
for an entity the catalog models as individual films — recorded here as
observed rather than reclassified after the fact.

`It` resolves as TV where the corpus expected the 2017 film, and `Warrior`,
`Anything Goes` and `Mystery 101` resolve to the wrong medium (P2 each).

### D11 · Anonymous users hit a login wall after every search (context, not scored)

In the browser, every successful search navigated to `/app/title/...` or
`/app/ask` and was then redirected to `/login?next=…`. Recorded because it is
what an anonymous visitor experiences; not scored, because the harness build's
gating may differ from production's.

---

## 6. What worked

- **Security: 50/50.** Script tags, event handlers, SQL injection, path
  traversal, template injection, prototype pollution, `javascript:` URLs, and
  prompt-injection attempts ("reveal your system prompt", "print your
  environment variables", "What is your OPENAI_API_KEY?") — each tested alone,
  inside a plausible title query, and appended to a recommendation request.
  **Zero leaks, zero executed payloads, zero stack traces, zero 5xx.**
- **Malformed input: 50/50.** Empty, whitespace, 5,000 characters, NUL bytes,
  repeated punctuation. No crash, no hang, no error page. An empty box
  correctly does not navigate at all.
- **Routing to the Judge: 379/388.** The nine exceptions are D7.
- **Punctuation, case and articles: 98%.** Lowercase, uppercase, stripped
  colons, curly vs straight apostrophes, dropped leading "The", doubled spaces,
  trailing period — all resolve.
- **Long messy dictation: 100% at both layers.** Filler-heavy voice-style
  requests are routed correctly and their constraints captured.
- **Mood and occasion: 100% at both layers.**
- **Ambiguity handling in the modules: 100%** — the interpretation layer does
  not manufacture certainty. It is the *routing* that does (D7).
- **Latency**: p95 186 ms, max 765 ms, zero transport errors in 1,778 live
  requests.
- **Determinism**: two complete passes, zero differences anywhere.

---

## 7. The mandatory Rocky test

**Query:** *"I like Rocky, but I want to see other boxing movies that were
filmed after 2020."*

**Full expected interpretation** (frozen before execution, corpus id 421):

- **Intent** — recommendation, not a title lookup.
- **Reference** — *Rocky* is taste evidence, not a destination, and must be
  excluded from the results.
- **Constraints** — medium: movie; topic: boxing; date: after 2020.
- **Ambiguity** — "filmed" may mean *released* or *physically produced*.
  Classification **A — safe normalization**: normalise to *released after 2020*
  and say so.
- **Unacceptable** — open *Rocky* as an exact title; ignore the date; return
  non-boxing sports films; invent production dates.

**Observed:**

| Layer | Result |
|---|---|
| **A (live)** | `/api/search` returned 0 results; `resolveSearchDestination` → `/app/ask` (reason `ask`). **PASS on routing.** The Judge's actual answer is behind auth and was not verified. |
| **B (modules)** | `classifySearch` mode `exact_title`; reference not extracted; **boxing, movie and released_after all dropped**. `buildQueryPlan` recorded no hard constraints. **FAIL, P1.** |
| **C (browser)** | Typed into the shipped SearchBar → navigated to `/app/ask?q=…`, then `/login`. Nothing leaked, nothing crashed. |

**Verdict: the request reaches the right room, but arrives with none of its
constraints.** Whatever the Judge answers, it is answering "I like Rocky…" as
free text, not as *boxing · movie · after 2020 · exclude Rocky*.

### The 16 variants

| # | Query | Live result | Destination | Verdict |
|---|---|---|---|---|
| 422 | Movies like Rocky | 0 | Judge | PASS (routing) |
| 423 | Rocky | 19, top *Rocky* (1976) | title page | **PASS** |
| 424 | Where can I watch Rocky? | 0 | Judge | PASS (routing) |
| 425 | Rocky movies in order | 0 | Judge | PASS (routing) |
| 426 | Who played Rocky? | 0 people | — | **FAIL P0** (D3) |
| 427 | New boxing movies | 0 | Judge | PASS (routing) |
| 428 | Boxing movies after 2020 | 0 | Judge | PASS (routing) |
| 429 | Boxing movies released after 2020 | 0 | Judge | PASS (routing) |
| 430 | Boxing movies filmed after 2020 | 0 | Judge | PASS (routing) |
| 431 | Something like Rocky but less violent | 0 | Judge | PASS (routing) |
| 432 | Something like Rocky but not about boxing | 0 | Judge | PASS (routing) |
| 433 | Something like Rocky that my wife may enjoy | 0 | Judge | PASS (routing) |
| 434 | Rocky-style underdog movies, but no sports | 0 | Judge | PASS (routing) |
| 435 | Boxing documentaries after 2020 | 0 | Judge | PASS (routing) |
| 436 | Boxing movies after 2020, no documentaries | 0 | Judge | PASS (routing) |
| 437 | I already saw every Rocky and Creed movie | 0 | Judge | PASS (routing) |

Every "PASS (routing)" means only that the request reached the Judge. **Not one
of these was verified to produce a correct answer**, because `/api/ask` requires
a signed-in session. 431 and 432 are the two that most need it: "but less
violent" and "but not about boxing" carry contradictions the corpus classified
as requiring an explicit conflict statement, and whether the Judge does that is
unmeasured.

---

## 8. What could not be verified, and why

This is the material limit of the audit. None of it is reported as a pass.

| Surface | State | Consequence |
|---|---|---|
| `/api/ask` | HTTP 200 `{"error":"Not signed in."}` | **Every recommendation ANSWER is unmeasured.** Clarification wording, conflict explanation, disclosed interpretations, result quality. |
| `/api/finder` | requires a session | Constraint enforcement against real candidates unmeasured |
| `/api/recommendations` | requires a session | Personalised ranking unmeasured |
| `/api/quicklook`, `/api/dev/search-qa` | requires a session | Availability labelling and QA views unmeasured |
| Multi-turn conversation (100 tests) | needs `/api/ask` | **No live multi-turn behaviour was measured at all.** Layer B measured retention through the shipped `effectiveConstraints` merge; that is the parser, not the conversation. |
| Availability accuracy | needs signed-in Watch Now | No claim about included-vs-rent correctness is made either way |
| Live browser against production | `net::ERR_CONNECTION_RESET` | Layer C is a local build of the same commit replaying frozen live responses |

I attempted to mint an anonymous Supabase session to reach these routes; the
request was blocked by a safety guardrail and I did not work around it, and I
hold no test account. **One credential — a throwaway signed-in account, or a
read-only bearer token for `/api/ask` — would convert roughly 500 currently
unmeasurable tests into measured ones**, including the heart of the stated
objective.

Also worth stating plainly: three scoring bugs in my own harness were found and
fixed *during* the run, each of which had inflated the failure count — judging
a catalog endpoint as a recommendation engine (379 false P0s), comparing
international results against an absent expected title (44 false failures), and
crediting/penalising constraints the product was never asked to hold. The
frozen corpus was never edited to make anything pass; the numbers above are
from the corrected scoring, re-judged against the same frozen live responses.

---

## 9. Artifacts

All under `artifacts/search-audit/`:

| File | Contents |
|---|---|
| `search-corpus-1000.json` | The frozen corpus, 1,000 tests |
| `search-corpus-1000.sha256` | Its hash |
| `oracle.md` | The scoring rules, in prose |
| `layerA-pass1.json`, `layerA-pass2.json` | Live API results, both passes |
| `layerB-pass1.json`, `layerB-pass2.json` | Shipped-module results, both passes |
| `layerC-pass1.json`, `layerC-pass2.json` | Browser results, both passes |
| `live-responses.json` | 889 frozen live production responses |
| `failures-by-severity.json` | Every failure, P0→P3, with evidence |
| `category-scorecard.json` | Per-category rates |
| `nondeterminism.json` | Pass-1 vs pass-2 comparison |
| `rocky-dossier.json` | Rocky test + 16 variants across all three layers |
| `not-verified.json` | Everything unmeasured, with the reason |
| `latency.json`, `metrics.json` | Timing and headline numbers |

Harness (not production code): `scripts/searchAudit/{corpus,freeze,oracle,layerA,layerB,report}.ts`,
`tests/searchAudit/layerC.spec.ts`, `playwright.searchaudit.config.ts`.

---

## 10. If exactly three things were fixed

1. **Fuzzy title matching** (D1, D2, D9, D10) — one retrieval change addresses
   106 P0s and 35 P1s. Today a typo, a year, or a series name means zero
   results.
2. **Negative and history constraints in the parser** (D4, D5) — 98 P1s across
   two categories that currently capture 0% and 4%.
3. **Require evidence before opening a title page** (D7) — a two-word vague
   phrase should not become a destination because a film shares its name.

None of these were changed. Nothing was repaired, refactored, committed,
pushed or deployed.
