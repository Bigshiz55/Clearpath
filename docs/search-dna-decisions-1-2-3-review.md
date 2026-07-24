# Search DNA — Decisions 1, 2 & 3 Review Package

Status: **complete, awaiting your review. Nothing merged, nothing deployed.**
Branch: `feature/search-dna-and-search-lab` (isolated, off `origin/main` @ `ef79637`).

This document is the reviewable package you asked for before any PR. It follows the
18 items you specified, in order.

---

## 1. Before/after: zero-qualified similar request

**Trigger case:** a `similar_to` request whose candidates, after canonical seed/dup
exclusion, all fail the seed-similarity gate (e.g. "movies like Rocky" where every
retrieved candidate contradicts Rocky's DNA).

| | Before (Phase 4 as first shipped) | After (Decision 1) |
|---|---|---|
| Resolved seed, 0 candidates qualify | Silently fell through to the **ungated Finder**, which returned personalized-but-unrelated titles as if they were "similar" | Returns an explicit **`no_close_matches`** state. No ungated fallback. |
| User signal | None — looked like a normal similar result | Honest message + broaden options + clearly-labelled broader alternatives |
| Interpretation | Lost | Preserved (seed title, media type, lens, gate reason) |

Search Lab case `rocky.zero_qualified` proves it: returns **0/5** similar items with a
populated gate breakdown (`search-lab-results/runs/gated/report.md`).

## 2. Proof the ungated fallback is no longer silent

- `src/lib/askJudge.ts::askSimilarTo` now returns a discriminated union
  `SimilarResult = { kind: 'similar'; … } | { kind: 'no_close_matches'; … }`. A
  resolved seed with zero qualified candidates can **only** produce
  `kind: 'no_close_matches'`; it never calls the ungated Finder for a "similar"
  answer. The Finder is used **only** to build clearly-labelled *broader
  alternatives*, and only under the `no_close_matches` branch.
- `askSimilarTo` returns `null` **only** when the seed itself cannot be resolved
  (a genuine "I don't know that title" case) — that is the sole path that still
  falls through to the Finder in `src/app/api/ask/route.ts`, and it is a
  seed-resolution failure, not a zero-qualified similar result.
- Tests: `src/lib/search/similarResponse.test.ts` — "classifies a zero-qualified
  rank output as no_close_matches (never the Finder)" and "the no-close message
  does not claim any unrelated title is similar".

## 3. User-facing no-close-matches experience

`route.ts` returns, for `kind: 'no_close_matches'`:
- `message`: "No close matches met the similarity standard for "<title>"…" — never
  asserts any title *is* similar (asserted by test).
- `interpretation`: the parsed request (seed, media type, lens).
- `reason` + `gateBreakdown`: which gate eliminated candidates and how many each
  (e.g. `contradiction_outweighs_similarity: 4`).
- `candidatesConsidered`: count.
- `broadenOptions` (`src/lib/search/similarResponse.ts::BROADEN_OPTIONS`): broaden
  similarity, match the emotional feeling, match the genre, include the franchise,
  remove a constraint, personal alternatives.
- `broaderAlternatives`: personalized titles, **each labelled `broader_alternative`**
  and never blended into the similar list.

## 4. Calibration-set composition

Source: `eval/searchlab/calibration/dataset.ts`; machine record:
`search-lab-results/calibration/composition.json`.

- **CALIBRATION** (tuned against): **35 pairs**, 21 distinct seeds.
  By category: positive 17, contradiction 14, broad_similarity 2, borderline 1,
  franchise 1.
- **CAL_HOLDOUT** (frozen; scored once): **14 pairs**, 14 distinct seeds.
- **Genre buckets** (both splits): sports, crime, thriller, sci-fi horror, prison
  drama, romcom, superhero, heist, time-loop, war, western, coming-of-age, action,
  music drama, TV crime/procedural, TV prestige, Spanish, East Asian, French,
  documentary.
- **Decades:** 1970s → 2020s. **Media:** film + TV. **Languages:** English,
  Spanish (Roma, Y Tu Mamá También, La Casa de Papel, Volver), Chinese/East-Asian
  (Parasite, Shoplifters, Crouching Tiger, Hero), French (Amélie, The Intouchables,
  Martyrs), plus documentary (Free Solo, Fyre).

This is an **initial reviewed sample**, not the final production-sign-off set. The
active config stays flagged pending a larger human-audited set (see item 17).

## 5. Threshold sweep results (across ranges, not one point)

Full grid: **450 configurations** (`search-lab-results/calibration/sweep-grid.jsonl`).
Ranges over the whole grid on CALIBRATION (`metric-ranges.json`):

| metric | min | max |
|---|---|---|
| precision | 0.792 | 1.000 |
| recall | 0.895 | 1.000 |
| false-qualification rate | 0.000 | 0.313 |
| no-result rate | 0.000 | 0.111 |
| critical-contradiction rate | 0.000 | 0.286 |
| F1 | 0.872 | 0.944 |

Per-genre and per-category breakdowns are in `selected.json` (`byBucket`,
`byCategory`) for both provisional and selected configs.

**Selection discipline:** swept and selected on CALIBRATION only; HOLDOUT scored
exactly once with the already-frozen selection and never used to choose. Selection
hard-requires zero critical-contradiction leaks, then max F1, tie-broken by
false-qualification → no-result → closeness to provisional (anti-overfit).

## 6. Frozen selected configuration

`src/lib/search/thresholds.ts::THRESHOLDS_V1_CALIBRATED` (now `ACTIVE_THRESHOLDS`):

```
minAnchor           0.40   (provisional 0.28)
maxContradiction    0.42   (unchanged)
hardRealismGap      40     (provisional 50)
minConfidence       0.40   (unchanged)
defaultFranchiseCap 1      (unchanged)
```

**Why it changed:** the provisional point (tuned only on Rocky-like cases) leaks
contradictions on the broader set — critical-contradiction rate **0.214** on
CALIBRATION (3 of 14 contradiction pairs wrongly qualified). This is exactly the
blind spot Decision 2 was meant to surface.

| CALIBRATION | precision | recall | F1 | false-qual | no-result | crit-contra |
|---|---|---|---|---|---|---|
| provisional | 0.850 | 0.895 | 0.872 | 0.188 | 0.111 | **0.214** |
| **selected** | **1.000** | 0.895 | **0.944** | **0.000** | 0.111 | **0.000** |

## 7. Final untouched holdout results (scored once)

`search-lab-results/calibration/selected.json → holdout`, and the frozen Search
Lab holdout fixtures (Jaws, Groundhog Day).

| CAL_HOLDOUT | precision | recall | F1 | false-qual | no-result | crit-contra |
|---|---|---|---|---|---|---|
| provisional | 1.000 | 1.000 | 1.000 | 0.000 | 0.000 | 0.000 |
| selected | 1.000 | 1.000 | 1.000 | 0.000 | 0.000 | 0.000 |

The selection generalizes: **zero contradiction leaks** on unseen data, no recall
loss. Search Lab holdout (`jaws.default`, `groundhog.default`) still pass with
genuine matches surfaced and zero critical failures.

## 8. No-result rate + false-qualification rate

- **False-qualification rate** (a "not similar" pair wrongly qualifying): selected =
  **0.000** on both calibration and holdout (provisional was 0.188 on calibration).
- **No-result rate** (a seed that should surface ≥1 match getting none): selected =
  **0.111** on calibration (2 of 18 qualify-seeds), **0.000** on holdout. The two
  affected pairs are thin cross-language positives (Roma↔Y Tu Mamá También; one
  East-Asian pair) that share only generic genre + a couple of dims. They are not
  dropped from the product — they route to the **honest broader-alternatives path**
  rather than being asserted as "similar". This is a deliberate precision-leaning
  trade for a *similarity* gate, not silent suppression.

## 9. Franchise metadata changes (Decision 3)

- `src/lib/types.ts`: `TitleMetadata` gains optional `collectionId?: number | null`
  (backward-compatible; existing callers unaffected).
- `src/lib/search/titleDna.ts`:
  - `FranchiseRelation` = `same_canonical | canonical_duplicate | franchise |
    similar | unknown`; `IdentitySource` = `known | inferred | unknown`.
  - `franchiseAssessment(seed, cand)` prefers the **stable provider collection ID**
    (`belongs_to_collection.id`). Same collection → `franchise` (known). Different
    known collections → `similar` (known). Only when collection IDs are absent does
    it fall back to a **low-confidence title-text hint** (`inferred`), and otherwise
    `unknown`.
- Trace discloses identity: `RankTrace.identitySource` records `known | inferred |
  unknown` for every candidate.

## 10. Provider adapters updated (not the ranker)

- `src/lib/tmdb/client.ts::getTitle` sets `collectionId: detail.belongs_to_collection?.id ?? null`
  (line 532). The collection identity is produced by the **TMDB adapter**, at
  request time, from the provider's stable ID — the ranker only *consumes* it.
- The ranker (`seedSimilarity.ts`) makes no network calls and infers nothing on its
  own; it reads the identity the adapter supplied.

## 11. Franchise cases that remain "unknown"

- When neither title carries a `collectionId`, `franchiseAssessment` returns
  `unknown` unless a **distinctive shared title prefix (≥4 chars)** justifies an
  `inferred` hint. Example asserted in tests: "The Meg" vs "The Mechanic" → `unknown`
  (they do not share a distinctive prefix), and it does **not** filter.
- **Inferred identity can never independently trigger filtering.** A title-text
  `inferred` franchise is recorded in the trace but is not excluded or capped — only
  `known` (collection-ID-backed) franchise identity filters. Tests:
  `src/lib/search/franchise.test.ts` — "inferred franchise is NOT hard-excluded by
  'no sequels'" and "known franchise IS capped to 1".

## 12. Seed + duplicate exclusion results

- Seed exclusion uses **canonical identity** (`canonicalKey(title+year+mediaType)`)
  plus `same_canonical` franchise relation — not a bare TMDB id — so a duplicate
  TMDB record of the seed is still excluded.
- `canonical_duplicate` (same work, different id) is excluded; repeated canonical
  keys among candidates are de-duplicated.
- Search Lab: `seedLeak = 0` and `duplicate = 0` across all gated cases
  (`gated/report.md`). The original bug (Rocky returning **Rocky** itself) cannot
  recur — `rocky.default` returns 5/5 with no seed leak.

## 13. Migrations proposed but not applied

**None required, none applied.** Franchise/collection identity is derived at request
time from TMDB (`belongs_to_collection.id`) and carried on the optional, in-memory
`TitleMetadata.collectionId`. Nothing is persisted, so no schema change is needed and
no `supabase/migrations/*` file was added or modified. If you later want the
fingerprint/collection cached in Postgres, that is a separate, approval-gated change
(migration + rollback + tests) — flagged, not done.

## 14. Files changed

Full diff `ef79637..HEAD` (see `git diff --stat`). Grouped:

- **Production (gate + wiring):** `src/lib/search/titleDna.ts`,
  `src/lib/search/seedSimilarity.ts`, `src/lib/search/similarResponse.ts`,
  `src/lib/search/thresholds.ts`, `src/lib/askJudge.ts`,
  `src/app/api/ask/route.ts`, `src/lib/tmdb/client.ts`, `src/lib/types.ts`.
- **Unit tests:** `src/lib/search/seedSimilarity.test.ts`,
  `src/lib/search/similarResponse.test.ts`, `src/lib/search/franchise.test.ts`.
- **Search Lab:** `eval/searchlab/{fixtures,cases,grade,types,currentModel,run.searchlab,cli}.*`,
  `eval/searchlab/vitest.searchlab.config.ts`.
- **Calibration (Decision 2):** `eval/searchlab/calibration/{dataset,sweep,sweep.searchlab,vitest.calibration.config}.ts`.
- **Artifacts:** `search-lab-results/runs/{baseline,gated,compare}/*`,
  `search-lab-results/calibration/*`.
- **Docs:** `docs/search-dna-rocky-failure-analysis.md`,
  `docs/search-dna-phase4-comparison.md`, this file.
- **Config:** `package.json` (Search Lab + calibrate scripts).

## 15. Exact commits (on the isolated branch)

```
234f941  Decision 2: threshold calibration sweep + frozen v1-calibrated config
cc5ab45  Decisions 1 & 3: honest no-close-matches state + franchise identity plumbing
8b8237f  Phase 4 (fixup): include the askSimilarTo gate wiring omitted from d43465a
710937b  docs: Phase 2+4 comparison checkpoint (baseline vs gated, holdout, decisions)
d43465a  Phase 4: seed-similarity qualification gate before personalization (general fix)
ba1247e  Phase 2: freeze the seed-similarity regression suite + baseline (Search Lab)
6b7c748  Phase 1: forensic analysis of the Rocky similarity failure (analysis only)
```
(A follow-up commit adds this review doc.)

## 16. Reproduction commands

```bash
npm run typecheck && npm run lint && npm test        # 227 unit tests
npm run search-lab:baseline                          # frozen "before" (reproduces failure)
npm run search-lab:gated                             # frozen regression suite (8/8, 0 critical)
npm run search-lab:holdout                           # holdout fixtures (Jaws, Groundhog)
npm run search-lab:compare                           # baseline vs gated comparison
npm run search-lab:calibrate                         # threshold sweep + selection + holdout-once
npm run eval:selftest                                # unrelated-intent + evaluator self-tests
npm run build                                        # production build
```

## 17. Remaining failures / uncertainty

- **No failing suites.** typecheck ✓, lint ✓, 227 unit tests ✓, Search Lab
  baseline/gated/compare/holdout ✓, calibration sweep ✓, eval self-test (17) ✓,
  build ✓.
- **Calibration scale.** The 35+14 set is an *initial reviewed sample*, not the
  large fully-audited set required for final production sign-off. The active config
  is therefore evidence-backed but still flagged `v1-calibrated` pending that
  larger review. Recommend growing the set (esp. more non-English positives and
  more borderline pairs) and re-running the sweep before removing the flag.
- **Two thin cross-language positives** currently route to broader-alternatives
  rather than "similar" (item 8). This is intended precision-leaning behaviour; if
  human review decides they *should* count as similar, the fix is richer
  fingerprints (shared keywords), **not** lowering the threshold.
- **Fingerprint coverage** depends on the gpt-4o-mini classifier cache; sparse
  fingerprints degrade to a low-confidence path and correctly abstain rather than
  guess (metadata-confidence gate).

## 18. Confirmation

Nothing has been merged, and nothing has been deployed. All work is on the isolated
`feature/search-dna-and-search-lab` branch. No PR has been created. Awaiting your
review before any next step.
