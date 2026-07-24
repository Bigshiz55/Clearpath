# Rocky similarity failure — forensic analysis (Phase 1)

**Status:** analysis only. No engine code changed. No hard-coding, no blacklist, no
title-specific special-case. This document establishes *why* the failure happens
before any fix is designed.

**Branch:** `feature/search-dna-and-search-lab` (off `origin/main`).
**Production baseline commit:** `ef79637098c744144bec97bed463114c129221e9`.
**Baseline test suite:** 210 passed (21 files). **Baseline build:** ✓ compiled, 45/45 static pages.
**Session HEAD carrying unrelated i18n/card work (untouched here):** `6977c70` on `ui/watchverdict-coherence-i18n-refinement` (PR #1).

---

## 0. The incident

Request: **“I like movies like Rocky. Give me some things you think I would like.”**
Returned: **Rocky** (the seed itself) and **Edward Scissorhands**.

Both are defects: the seed should be excluded by default, and Edward Scissorhands
should fail a Rocky-similarity request — broad overlap (older, popular, emotional,
character-driven, outsider protagonist) is outweighed by contradictions in genre,
realism, tone, narrative promise, setting, and structure.

---

## 1. The actual pipeline (traced through real code)

Entry point: `POST /api/ask` → `src/app/api/ask/route.ts`.

```
route.ts:53   askJudgeTitle(text)          → null for this query (not a confident single-title lookup)
route.ts:67   reference = ai.similarTo || extractReference(text)   → "Rocky" (see §2, note the fragility)
route.ts:70   askSimilarTo(supabase, userId, "Rocky", wantCount)   ← THE similar-to path
              └ if it returns null → falls through to runFinder() (plain discovery, §1.5)
```

### `askSimilarTo` — `src/lib/askJudge.ts:84`

1. `cleanTitleText("Rocky")` → `"Rocky"`.
2. `searchTitles("Rocky")` (TMDB) → `matches = results.filter(titleMatches("rocky", …))`.
3. **Seed = `matches[0]`** (`askJudge.ts:94`) — the *first* fuzzy title match. No
   year/canonical disambiguation; whatever TMDB ranks first wins.
4. **Candidate source = `getSimilar(seed.mediaType, seed.id)`** (`askJudge.ts:97`).
   In `src/lib/tmdb/client.ts:572` this is TMDB **`/{type}/{id}/recommendations`**
   (primary) plus **`/{type}/{id}/similar`** (only if fewer than 4), deduped by id,
   capped at 12. **This is the *only* candidate generator.**
5. Exclusions (`askJudge.ts:116`): drop the candidate whose key `==` `${seed.mediaType}-${seed.id}`
   (a **single-TMDB-id** seed filter) and anything in the user's watched/dropped set.
6. For each of the ≤16 survivors: `getScoringData` + `buildVerdict` →
   `matchScore = report.personal.score` (`askJudge.ts:131`).
7. **Rank = `sort((a,b) => b.matchScore - a.matchScore)`** (`askJudge.ts:149`) — the
   *personalized* score alone. Slice to the requested count.

The fallback `runFinder` (`src/lib/finder.ts:128`) generates candidates from
`discoverTitles` (TMDB Discover by genre/popularity) and **excludes only `seen`
titles — it has no seed exclusion at all** (`finder.ts` candidate loop, line ~80).

---

## 2. Why the seed extraction is also fragile (secondary defect)

`extractReference` (`askJudge.ts:61`) takes the text after the **last** comparison
cue. On the exact incident text the last cue is the trailing *“like”* in
“things you think I would **like**”, so the regex returns `""` → **null**. The
regex fallback therefore **misses “Rocky”**; only the LLM parser (`ai.similarTo`)
recovers it. Verified:

```
last cue matched: "like" at index 64
extracted reference: ""  → regex returns null (Rocky missed; only the LLM catches it)
```

This makes behaviour depend on whether an OpenAI key is present and how the LLM
parses — a source of non-determinism and of “sometimes it seeds Rocky, sometimes
it drops to generic discovery.”

---

## 3. Root causes

### RC-1 — Seed exclusion is by single TMDB id, not canonical identity
`askJudge.ts:116` removes only the exact `mediaType-id` of the resolved seed. It does
**not** collapse canonical duplicates (re-releases, alternate-language records,
provider copies, a “Rocky” short vs the 1976 film) to one identity, and the
`runFinder` fallback excludes **no** seed at all. Either path can surface the seed
(or a duplicate record of it). *Violates acceptance #1, #16.*

### RC-2 — Single-source candidate generation
Candidates come **100%** from TMDB `recommendations`/`similar`
(`tmdb/client.ts:591`). That is one opaque collaborative/keyword signal used as the
*whole* retrieval stage, not “one input among many.” Edward Scissorhands is a
plausible TMDB neighbour of Rocky (both are older, popular, emotionally resonant →
“users who liked X also liked Y”). *Violates Phase 9 (“Do not depend on one retrieval
method”) and “External provider recommendations as one input only.”*

### RC-3 — No qualification gates
There is no hard-constraint gate beyond “seen,” **no seed-similarity anchor gate,
no contradiction gate, no quality/explanation gate.** Every TMDB neighbour flows
straight into ranking. *Violates Phases 8 & 10.*

### RC-4 — Ranking is the personalized score alone
`askJudge.ts:149` sorts by `report.personal.score`. Seed similarity is **never a
term in the ranking.** A title that is only weakly Rocky-like but personally
appealing (Edward Scissorhands, for a user who likes character-driven emotional
films) sorts to the top. **Personalization rescues an unqualified candidate.**
*Violates acceptance #8, #10, #11 and the core standard.*

### RC-5 — No contradiction model
Nothing subtracts score for Rocky↔Edward Scissorhands contradictions
(grounded-sports-realism vs gothic-fantasy-whimsy; earned-underdog payoff vs
fabulist tragedy; 1970s vérité vs stylized suburbia). Several weak generic
similarities are never outweighed by one strong contradiction. *Violates Phase 8.*

### RC-6 — No similarity lens
“movies like Rocky” always resolves to the same thing (“TMDB neighbours ranked by
personal fit”). Boxing / underdog-feeling / 1970s-style / Stallone / romance lenses
are indistinguishable. *Violates Phase 4.*

### RC-7 — Explanations are not similarity-grounded
The per-item `reason` is `report.oneLiner` (`askJudge.ts:134`) — the candidate's own
verdict blurb about *personal fit*, generated independently of any seed-similarity
evidence. A recommendation can be explained as “a strong match for you” without any
support for *why it is like Rocky.* *Relevant to Phase 15.*

---

## 4. Per-candidate contribution trace (adapted to the real architecture)

The current engine stores **no** seed-similarity, anchor, or contradiction
contributions — only `report.personal.score` / `report.general.score` and the
per-trait `report.personal.adjustments` (personal fit only). So today's *actual*
trace for the two returned titles is:

```jsonc
// Rocky (seed) — how it can slip through
{
  "candidateTitle": "Rocky",
  "candidateSource": "tmdb_recommendations | finder_discover_fallback",
  "seedExclusion": { "method": "single_tmdb_id_equality", "canonicalDedup": false, "passedThrough": true },
  "seedSimilarity": null,          // not computed
  "contradictionScore": null,      // not computed
  "qualificationGates": null,      // none exist
  "matchScore": "report.personal.score",   // the ONLY ranking term
  "rankedBy": "personal_score_desc"
}

// Edward Scissorhands — why it ranks
{
  "candidateTitle": "Edward Scissorhands",
  "candidateSource": "tmdb_recommendations(rocky_seed)",
  "seedSimilarity": null,          // not computed → broad overlap never tested against contradictions
  "contradictionScore": null,      // not computed → fantasy/tone/realism/structure mismatch unpenalised
  "qualificationGates": null,      // none → cannot be filtered out
  "matchScore": "report.personal.score",   // high personal fit → sorts to top
  "qualifiedForRanking": true,     // (there is no notion of "unqualified")
  "exclusionReason": null
}
```

The **target** trace (what the new architecture must produce) is the structure the
brief specifies — `hardConstraintsPassed`, `seedSimilarityGatePassed`,
`sharedAnchorCount`, `sharedAnchorScore`, `contradictionScore`, `metadataConfidence`,
positive/negative contributions, `personalFit`, `qualifiedForRanking`,
`exclusionReason` — none of which exist today.

---

## 5. Metadata available today (for the two titles)

`buildVerdict` (`src/lib/scoring/`) consumes `TitleMetadata` from `getScoringData`
(TMDB: genres, runtime, year, cast/crew, vote data, providers) plus the optional
content-DNA/dimension signals. There is **no** stored, provenance-tracked Title-DNA
for *narrative premise, central conflict, tone, realism, emotional arc, narrative
structure, or setting* — precisely the dimensions on which Rocky and Edward
Scissorhands diverge. So even if a contradiction model existed, the grounded inputs
it needs are not persisted with confidence/provenance today (Phase 6/7 gap).

---

## 6. Honest reproduction limitation

The **exact** live output (which TMDB recommendations come back for the specific
Rocky record, and whether a duplicate Rocky record exists in that list) cannot be
captured in this environment because it requires live `TMDB_API_KEY` /
`OPENAI_API_KEY` / Supabase credentials, which are not present. What *is* definitive
from the code is the set of structural defects in §3 — each is a property of the
pipeline, independent of the specific TMDB payload, and each is directly testable by
the Search Lab with frozen fixtures (Phase 8+). The Rocky regression cases (below)
encode the required behaviour so the fix is verified against fixtures, not against a
one-off live call.

---

## 7. Rocky regression cases to encode (created next, not hard-coded into prod)

Behavioural requirements (fixtures + gold expectations, never production shortcuts):

- `movies like Rocky` → seed **Rocky excluded**; **Edward Scissorhands fails** the
  default similarity gate; **≤1 franchise** result in the top 5.
- `I loved Rocky, what next?` → same as above.
- `more boxing movies like Rocky` → lens=sport/boxing; boxing/fight-drama emphasised.
- `more underdog movies like Rocky` → lens=underdog; legitimate non-boxing underdog
  stories (e.g. Rudy-like) may qualify; Edward Scissorhands still fails.
- `something with Rocky's emotional feeling` → lens=emotional payoff.
- `movies with Rocky's 1970s style` → lens=era/style.
- `more Stallone movies like Rocky` → lens=actor (still weighs tone/story).
- `like Rocky, but no sports` → negative constraint honoured.
- `like Rocky, but no sequels` → franchise excluded.
- `include the Rocky franchise` → franchise allowed; seed still handled per request.
- `where can I watch Rocky?` / `show me Rocky` → where-to-watch / exact lookup;
  seed intentionally allowed.
- `Rocky and Rudy are the kind of movies I like` → multi-seed underdog lens.
- `something like Rocky that Heather would also like` → household hard-nos applied.
- Spanish + Simplified Chinese equivalents → equivalent Search DNA.
- Voice-transcription variants ("movies like rocky", "rockey", trailing "like").

Acceptance for the eventual fix (subset of the brief's list):
1. Exact seed excluded unless explicitly requested. 2. Edward Scissorhands fails the
default gate. 3. **No** Rocky-specific hack. 8. Seed similarity qualifies before
personalization. 10. Popularity/personal fit cannot qualify an irrelevant candidate.

---

## 8. What happens next (order, per the brief — not started yet)

1. Create the Rocky/seeded **regression fixtures + gold expectations** and wire them
   into the existing `eval/` framework (the Search Lab foundation already on `main`).
2. Establish the **baseline run** through those fixtures.
3. Define the four DNA layers + intent taxonomy + Search DNA contract + ontology +
   contradiction model as **schemas/modules**, reusing current data contracts.
4. Implement the **smallest generalizable fix**: canonical seed exclusion + a
   seed-similarity qualification gate with a contradiction penalty applied **before**
   personalization, plus a multi-signal candidate ensemble.
5. Compare against baseline + holdout; reject any critical regression; produce a
   reviewable patch. **No merge, no deploy.**

Nothing in §8 has been implemented. This document is the Phase-1 deliverable only.
