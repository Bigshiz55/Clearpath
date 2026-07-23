# Search DNA — Phase 2 + Phase 4 comparison checkpoint

Isolated branch `feature/search-dna-and-search-lab`. **Nothing merged or deployed;
no database migration; no production data changed.**

## Commits (this work)
- `6b7c748` — Phase 1: Rocky forensic analysis (analysis only).
- `ba1247e` — Phase 2: frozen seed-similarity regression suite + saved baseline.
- `d43465a` — Phase 4: seed-similarity qualification gate + production wiring.
- Production baseline this branched from: `ef79637` (origin/main).
- Unrelated i18n/card work (untouched): `6977c70` on `ui/watchverdict-coherence-i18n-refinement` (PR #1).

## Exact reproduction commands
```
git checkout feature/search-dna-and-search-lab
npm ci
npm run search-lab:baseline    # current-engine reference → search-lab-results/runs/baseline
npm run search-lab:gated       # the gate on dev + holdout (asserts 0 critical)
npm run search-lab:compare     # baseline vs gated → search-lab-results/runs/compare
npx vitest run src/lib/search/seedSimilarity.test.ts   # gate unit tests
npx vitest run                 # full unit suite (216)
npx vitest run eval/selftest.test.ts                   # unrelated voice-search intents (17)
npm run build                  # 45/45 static pages
```

## Exact root cause (from Phase 1)
`askSimilarTo` (src/lib/askJudge.ts) generated candidates 100% from TMDB
recommendations/similar, excluded the seed by a single TMDB id, and ranked the
survivors by the **personalized score alone** — no seed-similarity gate and no
contradiction model. So a weakly-related but personally-appealing neighbour
(Edward Scissorhands) sorted to the top, and a duplicate/alternate seed record
could slip past the single-id filter.

## Files changed
- `src/lib/search/titleDna.ts` (new) — pure Title-DNA contract + fingerprint math + `canonicalKey`.
- `src/lib/search/seedSimilarity.ts` (new) — the gate + ranker (pure, title-agnostic).
- `src/lib/search/seedSimilarity.test.ts` (new) — 6 unit tests.
- `src/lib/askJudge.ts` — wired the gate into `askSimilarTo`.
- `eval/searchlab/*` (new) — frozen fixtures, gold cases, current-engine reference, grader, runner, CLI, config.
- `package.json` — `search-lab:*` scripts.
- `search-lab-results/runs/{baseline,gated,compare}` — saved artifacts.
- `docs/search-dna-rocky-failure-analysis.md`, this file.

## How canonical seed exclusion works
`canonicalKey({title,year,mediaType})` normalizes the title (lowercase, strip
accents/punctuation) and appends the release year for movies. Seed exclusion and
duplicate exclusion compare **this identity**, never a bare TMDB id — so a
re-release, alternate-language record, or provider copy of the seed (a different
id, same work) is excluded, and two records of the same work can't both appear.
The seed is kept only when the request explicitly allows it (where-to-watch /
"include Rocky").

## How the similarity gate works (before personalization)
For each candidate, `qualify(seed, candidate, {lens})` computes an assessment
from Title-DNA and passes only if **all** hold:
- `metadataConfidence ≥ 0.4` (blends fingerprint coverage + genres + keywords;
  a missing fingerprint degrades to genre+keyword gating rather than emptying);
- lens keyword family matched, when a lens is set (underdog / boxing / sports);
- **no hard grounded↔fantastical clash** (`realism` split ≥ 50);
- `contradictionScore ≤ 0.42`;
- **a defining shared anchor exists** — a non-generic shared genre (Sport, not
  the generic Drama/Comedy), a shared keyword, or a shared salient defining
  fingerprint axis;
- `sharedAnchorScore ≥ 0.28` (weighted blend of genre + keyword + aligned-dim evidence).

Ranking then sorts **only the survivors** by personal fit and applies a franchise
cap; a failed candidate is dropped outright, so personalization, popularity, or
the requested count can never rescue it, and fewer results are returned rather
than padded. Every candidate keeps a full trace
(`hardConstraintsPassed / seedSimilarityGatePassed / sharedAnchorCount /
sharedAnchorScore / contradictionScore / metadataConfidence / positive & negative
contributions / personalFit / qualifiedForRanking / exclusionReason`).

## How contradictions are calculated
Over the 15 fingerprint axes present in both titles: when the seed is salient on
an axis and the candidate sits on the **opposite** pole with a gap ≥ 30, that
axis adds to the contradiction score, weighted higher on the six *defining* axes
(realism, darkness, humor, character, violence, romance). The total is normalized
by the number of comparable defining axes. Separately, a `realism` split ≥ 50 is
a **hard** contradiction (grounded vs fantastical) that fails the candidate on its
own — the exact Rocky↔Edward Scissorhands signal, generalized.

## Before → after (Rocky, `rocky.default`)
| | Baseline (current engine) | Gated (fix) |
|---|---|---|
| Edward Scissorhands (personalScore 90) | **returned** | **rejected** — `hard_contradiction_grounded_vs_fantastical` |
| The Shape of Water | returned | rejected — hard contradiction |
| La La Land | returned | rejected — `insufficient_seed_similarity` |
| Rocky (seed, both records) | could leak (single-id) | **excluded** — `excluded_seed_canonical` |
| Creed / The Fighter / Warrior | crowded out (missing) | **qualify** |
| Franchise in top 5 | 2 (uncapped) | ≤ 1 |

## Non-Rocky examples
- **`rocky.underdog`** (lens=underdog): non-boxing **Rudy** qualifies; Edward/La La Land rejected.
- **`rocky.no_sequels`**: franchise hard-excluded (Rocky II/IV gone); genuine matches remain.
- **`rocky.include_franchise`**: franchise allowed; seed still excluded.
- **Holdout — Jaws** (gate NOT tuned on it): **Finding Nemo rejected** (shares only "ocean"; grounded↔animated clash); The Shallows qualifies.
- **Holdout — Groundhog Day**: **Triangle rejected** (bleak time-loop horror; humor/warmth/darkness contradictions); Palm Springs / About Time qualify.

## Suite results
| suite | baseline | gated |
|---|---|---|
| cases passed | 1 / 7 | **7 / 7** |
| seedLeak | 2 | **0** |
| contradictionLeak | 9 | **0** |
| duplicate | 0 | 0 |
| hallucination | 0 | 0 |
| franchise-cap violations | 3 | **0** |
| genuine-match recall misses | 8 | **0** |

- **Dev (Rocky):** 5/5 pass. **Holdout (Jaws, Groundhog):** 2/2 pass — the gate
  generalizes to seeds it was not tuned against.
- **Compare** asserts the gate removes every baseline critical failure and
  introduces none.

## Multilingual
The gate is **language-neutral by construction**: it operates on resolved
Title-DNA (fingerprint + genres + keywords), which carry no language. Each gold
case lists EN/ES/ZH utterances that must normalize to the same Search DNA
(intent + seed); given the same resolved seed, the gate output is identical
across languages. Parser-level EN/ES/ZH normalization is unchanged by this patch
(that layer lives in askParse/finderParse and is covered by the existing eval
framework).

## Degraded metrics / remaining failures
- **No degraded metric** in the suite: every baseline critical failure is fixed
  and none introduced; the full unit suite (216), voice-search selftest (17), and
  build all pass.
- **Franchise saturation control in production is best-effort:** `TitleMetadata`
  does not carry a collection id, so same-franchise capping is a no-op at runtime
  until collection ids are plumbed (the logic is proven in the lab where ids
  exist). Seed/duplicate exclusion and the contradiction gate are unaffected.
- **Live runtime not exercised here:** no TMDB/OpenAI/Supabase credentials in this
  environment, so the production `askSimilarTo` path is verified by typecheck +
  build + the deterministic lab, not a live call.

## Product decisions requiring human review
1. **When zero candidates qualify** (e.g. a seed whose TMDB neighbours are all
   contradictions), `askSimilarTo` returns null and the route falls back to the
   generic Finder, which has no gate. Options: (a) show an honest "no close
   matches" state, or (b) keep the Finder fallback. Currently (b).
2. **Threshold calibration** (MIN_ANCHOR 0.28 / MAX_CONTRADICTION 0.42 /
   HARD_REALISM_GAP 50) was tuned on the dev set and validated on the holdout;
   broaden with more human-reviewed seeds before shipping.
3. **Franchise collection-id plumbing** (above) is a product/infra decision.

## Confirmation
Nothing was merged, deployed, or applied to a database. All changes are on
`feature/search-dna-and-search-lab`.
