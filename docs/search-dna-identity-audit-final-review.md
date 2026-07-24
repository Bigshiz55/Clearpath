# Search DNA — Expanded Identity Audit & Final Production-Readiness Review

Status: **complete. Nothing merged, nothing deployed.**
Branch: `feature/search-dna-and-search-lab` (isolated, off `origin/main` @ `ef79637`).
Scope: independent review + validation of the approved Decisions 1–3, plus an
expanded identity/resolution audit, the defects it surfaced, the fixes, and a
production-readiness decision.

---

## 1. What was independently verified

I re-read the 18-item review package (`docs/search-dna-decisions-1-2-3-review.md`)
and inspected the implementation behind each approved commit rather than trusting
the summary:

- **cc5ab45** (Decisions 1 & 3) — confirmed `askSimilarTo` returns a discriminated
  union and the only Finder fallback is on *seed-resolution failure*, never on a
  zero-qualified similar result; confirmed `franchiseAssessment` prefers the stable
  collection id and that inferred (title-text) identity never filters.
- **234f941** (Decision 2) — confirmed the sweep selects on CALIBRATION only and
  scores CAL_HOLDOUT once; re-ran it (`npm run search-lab:calibrate`) and reproduced
  the frozen `v1-calibrated` config.
- **36cf7e2** (review doc) — verified against the actual diff and artifacts.

During inspection I traced the **title-resolution and identity layer** end-to-end
(`askJudge.ts` seed resolution → `titleMatches` → `canonicalKey` →
`franchiseAssessment`) and found real defects (Section 4).

## 2. Methodology of the expanded audit

- **Dataset** (`eval/searchlab/audit/dataset.ts`): **52 human-reviewed cases across
  17 categories** — exact matches, punctuation, subtitles, international/alternate
  titles, one-word/short titles, close-but-wrong (dangerous substrings),
  titles-with-years, sequels, prequels, franchise collections, remakes, reboots,
  TV-vs-movie same title, TMDB identity conflicts, obscure titles, and explicit
  no-confident-match. Split by kind: 33 resolution, 15 identity, 4 similarity.
- **Deterministic & offline.** Every case exercises PURE functions
  (`titleMatches`, `canonicalKey`, `franchiseAssessment`, `qualify`), so the audit
  has no TMDB/network dependency and is fully reproducible. The one layer that
  needs live TMDB — picking `matches[0]` from search results — is out of scope
  here; its deterministic core (`titleMatches`) IS audited directly.
- **Before/after in one run.** The harness (`eval/searchlab/audit/harness.ts`)
  scores every case through both the **legacy** (pre-fix, copied verbatim into
  `audit/legacy.ts`) and the **fixed** logic, so the comparison is honest and
  needs no git bisect.
- **Per case we record** (`cases-fixed.jsonl`): input query, expected canonical
  result, actual relation + identity source, gate reason, match confidence,
  confidence band, decision (accept/reject/review/exclude), correctness, whether
  the franchise relation matched ground truth, false positive, false negative, and
  whether the confidence band was properly calibrated to the expected decision.
- **Conservative-about-false-positives objective.** `accepts` = the system would
  surface/link the candidate to the user. A dangerous error is an *accept* where a
  human expected reject/review (a wrong title shown). That is the metric we drive
  to zero.

## 3. Complete metrics (before → after)

Source: `search-lab-results/audit/metrics.json` and `report.md`.

| metric | legacy (before) | fixed (after) |
|---|---|---|
| accuracy | 0.846 | **1.000** |
| precision | 0.839 | **1.000** |
| recall | 0.897 | **1.000** |
| false-positive rate | 0.217 | **0.000** |
| false-negative rate | 0.103 | **0.000** |
| **dangerous false positives** | **5** | **0** |
| no-match accuracy | 0.545 | **1.000** |
| exact-title accuracy | 1.000 | 1.000 |
| franchise-identity accuracy | 0.867 | **0.933** |

**Confidence calibration by band (fixed):** high 100% correct (30/30, 29 accepts),
mid 100% (2/2, 0 accepts), low 100% (20/20, 0 accepts). Accepts concentrate in the
high band; rejects/abstentions in mid/low — the confidence signal is monotonic with
correctness.

## 4. Discovered failures (all in the legacy identity/resolution layer)

1. **Dangerous substring false positives.** `titleMatches` used raw character
   containment (`a.includes(b) || b.includes(a)`), so a short query matched inside
   an unrelated longer title: **"Saw"→"Warsaw", "Ted"→"Wanted", "Her"→"The Butcher",
   "The Ring"→"The Ringer", "Cars"→"Carsington Water"** all wrongly matched. This is
   the highest-severity class — it can resolve the WRONG seed.
2. **International/accented false negatives.** Resolution normalization did not fold
   diacritics (canonical identity did), so **"Amélie"≠"Amelie"** and
   **"Y Tu Mamá También"** failed to resolve from an unaccented query.
3. **Franchise title-text over-match.** `titleTextFranchiseHint` matched sub-word
   prefixes, so "The Ring" hinted a franchise with "The Ringer". (Mitigated in
   production because inferred identity never filters — but the classification was
   wrong.)
4. **TMDB collection collision misclassified.** A same-title/same-year pair with
   two DIFFERENT known collection ids was labelled `canonical_duplicate` (a
   duplicate of the seed) instead of `similar` (a distinct work).

## 5. Fixes made

- New pure module **`src/lib/search/titleMatch.ts`** — the single source of truth
  for title normalization + matching: diacritic-folding (`normTitle`), whole-word
  tokenization, and **boundary-aware token-window matching**. Accepts genuine
  variants (exact/case/punctuation/spacing/diacritics, and subtitle prefixes/
  suffixes like "Mad Max"→"Mad Max: Fury Road"); rejects mid-word substrings.
  `askJudge.ts` and `titleDna.ts` both consume it, so resolution and identity can
  never disagree on normalization again.
- **`titleTextFranchiseHint`** now requires a whole-token leading prefix.
- **`franchiseAssessment`** downgrades a same-title/differing-known-collection
  collision to `similar`.
- **Production configuration unchanged.** No thresholds moved. The similarity gate
  and the frozen `v1-calibrated` config are untouched; these fixes are in the
  identity/resolution layer that sits *before* the gate. The frozen Search Lab
  regression suite and the calibration sweep re-run identically.

## 6. Before-and-after summary

The fixes eliminated **5 dangerous false positives** and **3 international-title
false negatives**, lifted accuracy 0.846 → 1.000 and no-match accuracy 0.545 →
1.000, and improved franchise-identity accuracy 0.867 → 0.933 — with **no
regressions** (fixed is ≥ legacy on every axis; the audit asserts this). Full
per-case diff: `search-lab-results/audit/before-after-diff.json`.

## 7. Permanent regression tests added

- `src/lib/search/titleMatch.test.ts` — normalization, tokenization, genuine-variant
  acceptance, and explicit rejection of every dangerous substring found
  (Saw/Warsaw, Ted/Wanted, Her/Butcher, Ring/Ringer, Cars/Carsington) plus the
  sub-3-char abstain (Up, It).
- `src/lib/search/franchise.test.ts` — word-boundary hint (Ring≠Ringer,
  Blade Runner→2049 inferred), the D4 collection-disagreement case (The Mummy),
  diacritic-insensitive canonical key (Amélie=Amelie), and the documented TV
  over-collapse residual.
- The audit runner itself (`eval/searchlab/audit/audit.searchlab.ts`) asserts, on
  every run: zero dangerous false positives in the fixed logic, fixed never worse
  than legacy, and a measurable improvement.

## 8. Full validation (all green)

```
typecheck ✓   lint ✓   unit tests ✓ (241)
search-lab:baseline ✓   gated ✓   compare ✓   holdout ✓
search-lab:calibrate ✓   search-lab:audit ✓   eval:selftest ✓ (17)
build ✓ (45/45 pages)
```
Reproduce: the commands above, plus `npm run search-lab:audit`.

## 9. Residual risks

1. **Live seed-resolution ordering is not audited offline.** Production picks
   `matches[0]` from TMDB search results. `titleMatches` (the filter) is now safe,
   but the *ranking* of TMDB results is TMDB's and is only exercisable with a live
   key. Recommend a small live smoke test before full production.
2. **Same-name distinct TV shows over-collapse** (e.g. The Office US/UK) to
   `canonical_duplicate` because the TV canonical key omits year. This is the ONE
   audit residual (franchise-identity 0.933, not 1.0). It is the **safe** direction:
   it only ever *excludes* a candidate — it never surfaces the wrong title. Fixing
   it (adding year to the TV key) risks re-introducing seed leaks and is deferred as
   a deliberate, separately-reviewed change.
3. **Wholly-different alternate/international titles** (e.g. "Hausu" vs "House")
   cannot be matched by string alone; that needs TMDB's alternative-titles data
   (a live-data enhancement, out of scope for the offline identity core).
4. **Calibration/audit sets are reviewed samples, not exhaustive.** The active
   similarity config stays flagged `v1-calibrated` pending a larger human audit.
5. **Fingerprint coverage** depends on the classifier cache; sparse fingerprints
   correctly abstain (metadata-confidence gate) rather than guess.

## 10. Production recommendation

**Decision: CONDITIONAL GO.**

The change set is strictly safer and fully evidence-backed: zero dangerous false
positives, zero false negatives and 100% accuracy on the expanded identity audit,
zero contradiction leaks and precision 1.0 on the similarity calibration/holdout,
every suite green, and the production threshold configuration deliberately
unchanged. It is safe to open a PR and merge to a preview/staging environment now.

Before a **full production deployment**, satisfy these conditions (none blocking a
PR/merge to staging):

1. Run one **live TMDB resolution smoke test** to confirm `matches[0]` ordering on
   real search results for a handful of the audited queries (esp. one-word and
   close-but-wrong cases).
2. **Grow the calibration and audit sets** toward the larger human-audited target
   and re-run the sweep + audit before removing the `v1-calibrated` flag.
3. Product decision on the **TV same-name over-collapse** (accept the conservative
   exclusion, or schedule the year-in-TV-key change with its own regression pass).

No blocker requires you right now: the work is committed and pushed to the feature
branch; nothing is merged or deployed. The only true external dependency is item 1
(a live TMDB key), which is a pre-production smoke test, not a code gap.

## 11. Commits (this stage)

```
bf20bd3  Identity/resolution audit + fix dangerous title-match false positives
234f941  Decision 2: threshold calibration sweep + frozen v1-calibrated config
cc5ab45  Decisions 1 & 3: honest no-close-matches state + franchise identity plumbing
```
(This review doc is committed on top.)
