# ASK THE JUDGE — CANONICAL INTERPRETER CERTIFICATION · SHIP LEDGER

ONE semantic owner for /api/ask. Continuation state across sessions: read this,
execute **NEXT ACTION**.

WORKSTREAM: `canonical-interpreter-certification`
MISSION: Repair the canonical interpreter so natural language is understood by
one owner, and make certification measure THAT owner instead of the legacy parser.

CURRENT BRANCH: `claude/canonical-interpreter-certification`
CURRENT SHA: see LAST UPDATED SHA
CURRENT MAIN SHA: `314623ef0e2e17492708830ebe1afeb308846be6`
BASE / MERGE-BASE: `314623e` — cut from CURRENT main.
STATUS: ARCHITECT + BUILDER + **ADVERSARIAL REVIEW** complete. Review found 9
real defects (all pre-existing, none introduced by the first build) plus 2
regressions the review itself caused and then fixed. All gates green. Branch
only — NOT merged, no PR opened.

---

## USER-OBSERVED PROBLEM

From a 20,000-case forensic run: relative dates 8,150 failures; media type
8,026; count extraction 587; person extraction contaminated by request framing;
certification still depends on legacy naive parsing.

## ROOT CAUSE — **VERIFIED**, one per bug

Every line below was reproduced by running the shipped code, not inferred.

### A. The shared cause — the interpreter reads the UNSTRIPPED clause

`interpret.ts:430-431` calls `parseCount(req.text)` and `parseMedia(req.text)`
on the RAW request clause. `stripRequestFrame` exists and is already imported
by `clauses.ts` — but only to CLASSIFY a clause (`clauses.ts:190`), never to
produce the text the extractors read. The scaffolding therefore reaches every
extractor as if it were content.

Measured, shipped code:

| input | `req.text` reading | `stripRequestFrame().text` reading |
|---|---|---|
| `show me movies` | media `either` | text `movies` → media **movie** |
| `show me some action films` | media `either` | text `action films` → media **movie** |
| `give me 4 sci-fi movies` | count `null` | frame count **4** |
| `find me three Stallone movies` | count `3` | frame count **3** |
| `give me some shows` | media `tv` | text `shows` → media **tv** (unchanged) |

The last row is the control: the fix must NOT delete vocabulary. "shows" still
means TV when it is content rather than framing.

### B. Relative dates — the meaning has nowhere to go (8,150)

`DateConstraint` (`interpret/types.ts`) carries only `minYear`, `maxYear` and
`relative: 'newer' | 'older'`. There is no slot for an amount + unit. So
`interpret('movies from the last 5 years').date === {}` — understood by a human,
unrepresentable by the type. This is precisely the architecture defect the
type's own header names: *"If a meaning is understood and has no home here, that
is an architecture defect and this file is where it gets fixed."*

### C. Media — request framing and provider tokens counted as TV evidence (8,026)

`TV_WORDS = /\b(?:shows?|series|tv|episodes?|seasons?|sitcoms?)\b/i` is matched
against the whole clause, so:
- the request verb in "**show** me movies" is read as a TV noun;
- the provider token in "Apple **TV**+ movies" is read as a TV noun.

Both then collide with "movies" and `parseMedia` returns `either` — the
polarity logic is correct, its INPUT is not. Frame-stripping fixes the first;
the second needs provider-occurrence ownership (`Apple TV+` stays `either` even
after stripping, because nothing was stripped).

### D. Count — a hyphen breaks the bridge (587)

`parseCount`'s number→noun bridge is `(?:\w+\s+){0,3}?`, and `\w` excludes `-`.
Measured: `give me 4 sci-fi movies` → `null`; `give me 4 sci fi movies` → `4`.
The frame already extracted `4` in both cases, so the correct repair is to stop
re-deriving the count and consume the frame's, exactly as instructed.

### E. Person — a bare request verb contaminates the span

Measured: `Find Morgan Freeman movies` → `people: []` (the person is LOST),
while `Show me Stallone movies` → `people: ['Stallone']`. `stripRequestFrame`
reports `stripped=false` for the first, because bare leading verbs without
`me`/`us` are deliberately not treated as framing — a guard that protects real
titles such as "Get Out". So the capitalised request verb joins the
capitalisation evidence the person/title spans rely on, and the span is
rejected. The guard is right; its coverage is too narrow.

### F. Certification measures the WRONG PARSER

`eval/normalize/normalize.ts:19,166` imports and calls `naiveParseQuery`.
`interpret()` appears NOWHERE under `eval/`. `normalize.ts:58` even documents
that it mirrors naiveParseQuery's "show" handling — so the suite bakes in the
very legacy semantics that produce bug C and could never report it.

**This explains the number discrepancy.** A 20,000-case run of the shipped
suite reports composite 92.6% / parse 90.6% with clusters
`speech_transcription(251), entity_extraction(26), ambiguity_handling(25),
query_normalization(15), time_interpretation(1)` — nothing resembling
8,150/8,026/587, because the suite is grading the legacy parser while
production `/api/ask` runs the canonical one. The canonical owner is currently
UNCERTIFIED.

## ACCEPTANCE CONTRACT

1. One semantic owner. No new parser, no parallel search path, no second
   interpretation. `interpret()` consumes `stripRequestFrame` output; it does
   not re-derive framing.
2. Relative dates are captured as SEMANTICS (amount, unit, direction) in
   `CanonicalIntent`. No clock, no date arithmetic inside the interpreter.
   `canonicalExecution` converts to the existing `minReleaseDate` constraint
   using an injected `now`.
3. Occurrence ownership for media: request-frame words belong to the frame,
   provider names belong to provider entities, only the remainder carries
   media meaning. **No vocabulary entry is deleted.**
4. Count comes from the request frame, not a second regex.
5. Person spans are read only after frame stripping; request verbs never
   contaminate them, and real titles ("Get Out") are still not stripped.
6. Certification exercises `CanonicalIntent` for the /api/ask path.
   `naiveParseQuery` remains allowed for legacy Finder paths only.
7. Frozen regression cases for every family above, read by the existing
   `loadRegressionExtras()` (`eval/runner/datasets.ts`).

   DEVIATION, stated: the brief named `eval/gold/regression.json`, but that
   path is an OUTPUT — the optimizer appends to it and `.gitignore:33` excludes
   it as a run artifact, so a case "frozen" there would vanish on a fresh clone
   and never reach CI. The 21 cases therefore live in the versioned
   `eval/gold/regression.frozen.json`, and `loadRegressionExtras()` now merges
   both (frozen wins on id collision) so there is still ONE regression set
   rather than two.

## GATES

| Gate | Result | Exit |
|---|---|---|
| G1 typecheck | clean | 0 |
| G2 lint | no warnings or errors | 0 |
| G3 full vitest | 4769 passed, 24 skipped, 0 failed (340 files) | 0 |
| G4 canonical health, 20,000 utterances | 4 probes, all under ratchet | 0 |
| G5 legacy eval, 20,000 cases | composite 92.6% (flat by construction) | 0 |
| G6 frozen corpus `layerBext` | P0 635/635, P1 515/515, 0 failures | 0 |
| G7 searchrouting playwright | 21 passed | 0 |
| G8 production build | completed | 0 |

layerA targets PRODUCTION and needs an authenticated reachable host; this
environment has neither, so the documented offline layer (`layerBext`) was run
instead. The corpus, oracle and seed were not touched — `search-corpus-1000.json`
still hashes to `32fbe0234141fcf2…`, matching its frozen manifest.

## BEFORE → AFTER

### Canonical health — 20,000 utterances, both columns MEASURED

Same generated corpus, same probes; the "before" column was produced by
checking out the shipped interpreter and re-running the same file. Each probe's
denominator is defined by what the SENTENCE contains, never by what the
interpreter returned, so the fix cannot move its own denominator.

| probe | shipped | first build | after adversarial review |
|---|---|---|---|
| media unresolved | 3257/7584 (**42.9%**) | 317/7584 (4.2%) | 14/7584 (**0.2%**) |
| request dropped | 20/11021 (0.2%) | 0/11021 (0%) | 0/11021 (**0%**) |
| date dropped | 378/378 (**100%**) | 4/378 (1.1%) | 0/378 (**0%**) |
| count dropped | 612/3432 (**17.8%**) | 23/3432 (0.7%) | 4/3432 (**0.1%**) |

"date dropped 100%" is the honest headline: every single utterance stating a
relative window lost it, because the type had no slot to put it in.

### Legacy 20,000-case suite — deliberately FLAT

composite **92.6% → 92.6%**, parse **90.6% → 90.6%**.

PROVEN, not assumed: with the 21 new fixtures removed, the repaired code
reproduces the baseline cluster profile EXACTLY —
`speech_transcription(251), entity_extraction(26), ambiguity_handling(25),
query_normalization(15), time_interpretation(1)`. The suite grades
`naiveParseQuery`, so a canonical repair cannot move it. The small delta in the
full run (`intent_classification(9)`) is the sampling shift from adding 21
fixtures, which displace 21 generated cases; none of the 21 fixtures fail.

This flatness is the certification defect restated as a measurement: a suite
that cannot move when the thing production runs is repaired was never measuring
production.

## KNOWN LIMITATIONS

1. **The legacy 20k suite still scores `naiveParseQuery`.** It was not rewritten
   — that is a much larger change than this workstream, and rewriting the
   scorer while also repairing the interpreter would leave neither result
   trustworthy. Canonical certification is ADDED alongside
   (`eval/canonical/`), and the legacy number is retained as the
   no-regression control it now honestly is.
2. **`layerA` (live 1,000-query corpus) was not run** — it requires an
   authenticated production host this environment cannot reach. The offline
   `layerBext` corpus was run instead and is at baseline.
3. **Residual canonical loss is real but small:** media 4.2%, count 0.7%,
   dates 1.1%. Not zero, and not claimed as zero.
4. **A bare title is still not captured as a lookup.** `interpret('Get Out')`
   yields no title reference — before and after, verified identical. The
   protection asserted here is only that it is never read as an ORDER.

## BLOCKERS

None.

## ADVERSARIAL REVIEW — findings

Every defect below was found by ATTACKING the branch, then confirmed
pre-existing by re-running the same probe against `origin/main`. The first
build introduced none of them; it simply had not reached them.

| # | Attack | Defect | Root cause |
|---|---|---|---|
| 1 | `Apple TV+ shows with crime` | whole request discarded | `PLURAL_MEDIA_TAIL` anchored the media noun to the END of the clause, so any trailing qualifier fell back to `background` |
| 2 | `movies in the past decade` | date lost | same anchoring |
| 3 | `movies older than 20 years` | date lost | same anchoring |
| 4 | `recent movies before 2020` | date lost | same anchoring |
| 5 | `movies like Stallone` | nothing extracted | same anchoring |
| 6 | `movies from 5 years ago` | date lost | no "N ago" form |
| 7 | `give me five movies, but only show me one` | media **tv** | request verb mid-clause voted for television; `maskFraming`'s fallback RESTORED the masked verb |
| 8 | `Find movies for my family after dinner` | request discarded | `COMPANION` outranked the bare-request test |
| 9 | `not another Stallone movie` | Stallone recorded as person AND subject | the overlap rule guarded positive subjects only, not vetoes |

**Two regressions the review itself caused, and fixed:**

- Relaxing the anchoring made `my top 5 favorite movies are X` an ORDER, which
  donated its **5** to `requestedCount` — exactly the example-contamination the
  count field must refuse. Fixed with a possessive-statement guard.
- Reclassifying companion clauses as requests made `my family` a **Family
  genre**. Fixed by masking possessive companion phrases from the content
  vocabulary; the control `family movies` still yields the genre.

### Certification integrity — negative evidence

`eval/canonical/certificationIntegrity.test.ts` proves the suite is SENSITIVE,
not merely green:

- 7 mutants, each deleting one canonical repair (media, dates, count, person,
  provider, interpreter-computed year, everything). Each is caught by at least
  one frozen case, every frozen family is covered by at least one mutant, and a
  control asserts the unmutated interpreter passes all 38.
- `naiveParseQuery` structurally CANNOT satisfy certification: the legacy query
  object has no `lookback` field and no credit `role`, so improving it can
  never populate what certification asserts on.
- The frozen corpus is proven git-tracked, inside the root vitest `include`,
  and reached by the CI `vitest run` step.

## NEXT ACTION

SHIP review. Owner asked for branch work only — no PR opened, nothing merged.

LAST UPDATED SHA: recorded at commit.
