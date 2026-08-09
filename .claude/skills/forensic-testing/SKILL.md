---
name: forensic-testing
description: >-
  How to test WatchVerdict adversarially — seeded randomized generators,
  independent oracles, frozen corpora, and reproducible failing seeds. Use when
  adding or changing evaluation for search/eligibility/personalization, or when a
  single visible fix might be hiding a weak underlying architecture.
---

# forensic-testing — adversarial evaluation

## Golden rules (do not violate)
1. **Test the architecture, not the anecdote.** One passing case proves nothing.
   Generate MANY random combinations across independent dimensions (subject ×
   time × country/language × availability × tone) and check invariants that must
   hold for every case, not a hand-picked few.
2. **Independent oracle.** The grader must share no code with the thing it
   grades (see `eval/redteam` and `src/lib/knowledge/knowledgeChaos.test.ts`).
   An evaluator that can rationalize a pass afterward is worthless.
3. **Seed everything; persist failing seeds.** Use a deterministic PRNG
   (mulberry32). Every random failure must be reproducible — write failing seeds
   to `evaluation-results/…` so they become permanent regression cases.
4. **Zero-tolerance invariants.** For subject search: no false positives (an
   absent/incidental title must never be CENTRAL), full recall on genuinely
   central titles, and keyword-presence never equals centrality. Assert a second
   unseen seed so you are not overfit to one.
5. **Never weaken a test to pass.** A failed generated case is a regression case,
   not a nuisance — keep it. Never modify the frozen oracle/corpus/seed.

## The existing harnesses (extend, don't duplicate)
- `eval/generator` — seeded synthetic NL query generator (smoke/standard/full/
  stress). `node eval/cli.mjs <mode>` (or the `watch-verdict-eval` skill).
- `eval/redteam` — seeded decoy-pool subject-centrality red-team with an
  independent judge (precision + recall, zero-FP invariant).
- `scripts/searchAudit/` — frozen 1,000-query live corpus + `layerBext` 1,200
  seeded cases; oracle written BEFORE execution.
- `src/lib/knowledge/knowledgeChaos.test.ts` — offline cross-domain
  generalization proof for the Knowledge Layer.

## Step 1 — Pick the smallest honest layer
Prefer a pure function (parser, `evaluateSubjectCentrality`, `compileTitle`,
`deriveDna`) so the test is deterministic and fast.

## Step 2 — Generate + judge
Correct-by-construction cases (label first, render surface after) + an
independent oracle. Run enough cases to expose domain-specific hacks.

## Step 3 — Report honestly
total / passed / failed / false positives / false negatives / seeds. If live
evidence is required (real TMDB), say what remains OFFLINE-VERIFIED.

## Notes
- Live modes need `TMDB_API_KEY` and a budget (`--max-api-calls`/`--max-cost`);
  offline generalization proofs must never depend on a key.
