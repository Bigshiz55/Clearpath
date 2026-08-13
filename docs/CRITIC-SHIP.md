# THE CRITIC — SHIP LEDGER

Make the AI the film critic, not the search parser. Continuation state across
sessions: read this, execute **NEXT ACTION**.

CURRENT SHA: (see git log)
BRANCH: `claude/critic-layer`, cut from `main` @ 6080287.
NEXT ACTION: GC5 — anchors + objective reach candidate RETRIEVAL. The plan now
decides ranking; retrieval is still keyword-driven, so a candidate the critic
would argue for can never appear if the keyword filter did not surface it.

---

## 1. ROOT CAUSE — why production returned Cool Hand Luke

Traced end to end for `Better than Furious or Widows Bay`. **The comparative
relationship is destroyed at parse time and never exists again.** Cool Hand Luke
is not a ranking bug; it is the correct output of a pipeline that was never told
a comparison was requested.

### Where each piece of meaning dies

| Meaning | Fate | Evidence |
|---|---|---|
| **"better than"** | **Never represented anywhere.** `FinderQuery` (`src/lib/finder.ts:69-140`) has no relationship, comparison or objective field. `"Better than X"` and `"Something like X"` produce **byte-identical queries**. | `finder.ts:69+` |
| **Furious** (entity) | Resolved by `searchTitles(name)[0]` — popularity-first, no year, no media type, no disambiguation, no confidence check. Then **discarded as an entity**. | `src/app/api/ask/route.ts:48` |
| **Widows Bay** (entity) | Same. If either fails to resolve it is silently skipped (`if (!hit) continue`) and the request proceeds as generic. | `route.ts:49` |
| **Two anchors** | **Flattened into one union of keyword IDs.** Which keyword came from which anchor is unrecoverable, so "outperform BOTH" is unrepresentable. | `route.ts:45-57` |
| **Anchor characteristics** | Reduced to **≤6 TMDB keyword strings each**, mapped to ≤8 keyword IDs, capped at 12 total. No fingerprint, no `title_dimensions`, no Taste DNA axes. | `route.ts:51-56` |
| **My taste relationship to those characteristics** | **Never computed.** Nothing correlates anchor attributes against the user's DNA. | — |
| **"should outperform the anchors for me"** | **Never represented.** | — |

### The two lines that are the whole failure

```ts
// route.ts:45-57 — an anchor becomes a bag of keywords
const hit = (await searchTitles(name).catch(() => []))[0];
const kwNames = (detail?.keywords ?? []).slice(0, 6);
ids.slice(0, 8).forEach((id) => out.add(id));

// route.ts:401 — the anchor's only other trace is a CAPTION
q.similarTo = s.referenceTitles.join(' / ');
```

**`similarTo` is never read by ranking.** It appears in exactly two places in the
repo: its declaration (`finder.ts:138`) and a human-readable summary string
(`finderParse.ts:169`, `more like ${q.similarTo}`). It is display text.

### Why the explanation said what it said

**CORRECTION to an earlier draft of this audit:** `whyThisTitle` DOES have an
anchor input. `src/lib/reasons/whyThisTitle.ts:40` declares
`similarTo?: string[]` and line 130-133 emits
`Similar to X, which you rated highly`. `preference/explain.ts:156` has its own
`Similar to X` reason at strength 0.6. So the explanation layer is not blind to
anchors, and any plan built on "it has no anchor concept" would be wrong.

Two real gaps remain, and they are different from that:

1. **The existing reason is the WRONG RELATION.** `Similar to X, which you rated
   highly` answers *"is this like X?"* — the question the user did NOT ask. There
   is no reason kind expressing *"this beats X for you, and here is the trade"*.
   A comparative request cannot be explained by a similarity sentence.
2. **It also requires the user to have RATED the anchor** ("which you rated
   highly"), so it cannot fire for a title merely NAMED in the request. On this
   path `input.similarTo` was not populated from `s.referenceTitles` at all.

With the similar branch unable to fire and nothing else qualifying, the LAST
RESORT branch (line 179-187) is reached — correctly reporting that nothing about
the request had arrived:

```ts
if (out.length === 0 && genres.length > 0 && (input.ratedCount ?? 0) > 0) {
  out.push({ kind: 'general', text: `Matches your general ${...} preferences` });
}
```

So the copy was not lying about its own evidence — it was accurately reporting
that nothing about the request had reached it. **The explanation layer is
behaving correctly given its inputs; the failure is upstream.** GC7 is therefore
narrower than "teach the explainer about anchors": it is (a) populate
`similarTo` from the request's anchors rather than only from rated history, and
(b) add a genuinely COMPARATIVE reason kind, because "similar to" is not
"better than".

### AI-theater audit (section 20) — three confirmed instances

1. **LLM identifies anchors, but only keywords reach retrieval.** (`route.ts:381`)
2. **Anchor influences copy but not recommendations** — `convInterpretation.push('kept the feel of ...')` is pushed to the user-visible interpretation while only keyword IDs reach `runFinder`. The UI claims anchor influence the ranker never received. (`route.ts:383`)
3. **Result would have been near-identical for another user** — anchors contribute keyword filters, which are user-independent; only the generic DNA nudge personalises.

---

## SHIP GATES

- [ ] **GC1** Recommendation Objective type + LLM extraction; `relationship` survives parse
- [x] **GC2** Anchor identity resolution — **COMPLETE, red-then-green**
- [x] **GC3** Anchor fingerprint hydration — **COMPLETE, red-then-green**
- [x] **GC4** Critic Reasoning stage — **COMPLETE, red-then-green**
- [ ] **GC5** Anchors + objective reach candidate retrieval
- [ ] **GC6** Anchors + objective reach FINAL RANKING (the causality gate)
- [ ] **GC7** Grounded explanations — new reason kind carrying the comparison
- [x] **GC8** Material-dependence test — **COMPLETE, red-then-green**
- [ ] **GC9** Counterfactual suite: anchors / DNA / relationship / modifiers / context each causal
- [ ] **GC10** Exact-query regression for `Better than Furious or Widows Bay` (structural, not hardcoded titles)
- [ ] **GC11** Latency budget + caching
- [ ] **GC12** Full gates + merge recommendation

---

## GC4 — COMPLETE (red-then-green)

### RED
`Cannot find module './plan'`, then the substantive failure the gate exists for.
The fixture is built so the two models disagree:

- **anchors** carry qualities the user loves (suspense ~89, darkness ~84) AND
  one they reject (warmth ~86)
- **user** confidently likes suspense/darkness, rejects warmth
- **candidate A** keeps suspense 90 / darkness 86, fixes warmth to 10
- **candidate B** is simply farther from the centroid on everything — including
  the qualities that were working (suspense 12, darkness 14)

Under centroid-departure B wins on every axis of distance. Under a plan A wins.

### Why centroid departure was insufficient
"Better than X" does not mean "different from X". Someone naming two films they
love and asking for better is not asking to flee them, and a candidate can be
dramatically different from an anchor and dramatically worse. Undirected
distance cannot tell those apart because it has no idea WHICH of the anchor's
qualities were the good ones. It was correct for what GC8 needed — proving
causality — and wrong as semantics.

### CriticPlan contract
```ts
TraitInstruction { axis, kind: 'preserve'|'improve'|'avoid', target, strength, evidence }
CriticPlan      { instructions, authority, relation }
```
Structured claims only; no prose is ever ranking evidence.

**PRESERVE** requires TWO facts — the anchor expresses it AND the user's
confident taste agrees. Anchor possession alone is one fact and is explicitly
insufficient under `better_than`.
**IMPROVE** requires a supported direction: a confident user preference pointing
elsewhere, or an explicit modifier. Always improve FOR THIS USER — there is no
objectively better value of an axis.
**AVOID** requires grounded negative evidence: the anchor is strong on
something the user confidently rejects. Never inferred from possession.

### Provenance rules
Three classes kept apart on every instruction: `anchor` (a fact about the
films), `user_dna` (a fact about the person), `request` (a fact about what they
asked). Confidence reuses `MIN_RANK_CONF` rather than a critic-only threshold,
so there is one answer to "do we know this about the user". A `request` carries
strength 0.95 — higher than any inference — so an explicit modifier outranks
inferred anchor similarity, and a test pins that ordering.

### Silence over fake certainty
An axis the anchors do not express produces no instruction. A user with no
confident direction gets none invented. **Contradictory anchors are not
averaged**: 10 and 90 do not become 50. With a confident user preference the
plan picks a side; without one the axis stays unresolved and silent.

### Opposite-user proof
Identical anchors, identical relation, opposite confident DNA -> the plans are
not identical (`JSON.stringify` differs) and they disagree about `darkness`
specifically, in both `target` and `kind`.

### Mature-evidence proof
Anchors at darkness ~11, user's mature DNA (40 events) at darkness 95: the
instruction targets **above** 50. The plan cannot decide "lighter is objectively
better" for someone whose explicit evidence says otherwise. Low-confidence DNA
(1 event) produces strength < 0.6 on every `user_dna` instruction.

### Production ranking proof
`planNudge` replaces centroid distance as the authoritative critic input inside
`rankWithPreference`. Agreement is centred at 0 (+1 on target, -1 as far as
possible), so satisfying the plan gains and violating it loses — a reward-only
score would shift every candidate equally and reorder nothing. Candidate A now
ranks first with a strictly greater `criticNudge`, and `criticAxes` names
`suspense` and `warmth` as the movers.

`opts.critic` (GC8's objective form) is retained for callers without a
reasoning stage; a plan supersedes it when present.

### GC8 regression
Unchanged file, **8 passed / 8**. GC2 19/19, GC3 15/15, GC4 20/20 — critic
suites **62 / 62**.

### Gates
typecheck 0 · lint 0 · **vitest 3272 passed / 0 failed** · build 0.

---

## GC3 — COMPLETE (red-then-green)

### RED
`Cannot find module './hydrate'` — and, more usefully, the BEFORE assertion that
now lives permanently beside the AFTER one in `GC3 — the same anchor, two
states`:

```
BEFORE — resolved but unhydrated: authority 0, ranking identical to baseline
  objective.anchors[0].dims === undefined
  objective.authority === 0
  finalScore[] === baseline finalScore[]
```

Both states use the SAME `widowsBay()` resolution, the same DNA, the same
candidates and the same ranker. The test was not rewritten between RED and
GREEN — the AFTER case simply had no `hydrateAnchors` to call.

### Canonical fingerprint source
`title_dimensions`, read through `getCachedDimensions` -> `getCachedDimsBatch`
— the same table, reader and `isValidDimensions` gate the production ranker
already trusts. **No** `critic_dimensions`, no critic-only classifier, no second
enrichment path, no hard-coded anchor dims. One title, one fingerprint
vocabulary.

### Hydration contract
`hydrateAnchors(resolutions, load)` returns the resolutions **in the same order
and shape**, attaching `dims` only to resolved anchors whose canonical key hits
a VALID cached row. The loader is injected, so this module performs no I/O of
its own; production passes `getCachedDimensions`.

**Cache-only, architecturally.** `getCachedDimensions` never classifies, so no
AI or remote call enters the request path. The backfill that populates the cache
(`/api/cron/classify` -> `getTitleDimensions`) is a recorded DEPENDENCY, not
something hydration bypasses: an anchor the classifier has not reached is silent
until it does. That is a coverage question, not a correctness one.

**Identity survives.** Lookup is `tmdbId` + `mediaType` only. A test asserts the
loader is asked for `[{ tmdb_id: 555, media_type: 'movie' }]` and that the
request contains no title text at all.

**The composite key is load-bearing.** `title_dimensions` is queried by
`tmdb_id` ALONE (`.in('tmdb_id', ids)`), so returned rows can include a series
sharing a film's numeric id. Keying on `media_type-tmdb_id` is the only thing
stopping a movie anchor adopting a TV fingerprint — which would error nowhere
and make the critic confidently wrong. Proven: `movie:555` does not hydrate from
a `tv-555` row, and 1984 *Dune* does not hydrate from the 2021 film's row.

### Missing-dimension behaviour
Cache miss, malformed dims, empty object, or a loader that throws all leave the
anchor unhydrated, authority 0, and `finalScore[]` identical to the
critic-absent baseline. Malformed is rejected by the EXISTING
`isValidDimensions` gate — a partial blob is not a weaker fingerprint, it is not
one — rather than by a new critic confidence system.

### Partial-authority proof
- 1 hydrated + 1 ambiguous, `requested: 2` -> `0 < authority < 1`
- 1 hydrated + 1 resolved-but-unfingerprinted -> `0 < authority < 1`
- 2 hydrated -> `authority === 1`

The renormalisation trap is closed: `anchorsToObjective` pads the denominator
with anchors it could not place, so authority is measured against what was
ASKED rather than what happened to work.

### Production ranking proof
Same anchor, same everything: hydrating flips `criticNudge` from 0 to non-zero
and the returned **order changes** versus baseline — the GC8 property, reached
through the real GC2 -> GC3 path rather than hand-built anchors.

### GC8 regression
Unchanged file, **8 passed / 8**. All critic suites: **42 passed / 42**.

### Gates
typecheck 0 · lint 0 · **vitest 3252 passed / 0 failed** · build 0.

---

## GC2 — COMPLETE (red-then-green)

### RED
Two failures, captured in order.
1. **Module absent** — `Cannot find module './anchor'`. A weak proof on its own,
   so it was not relied on.
2. **The substantive one, now PINNED PERMANENTLY** as
   `describe('RED — the popularity-first strategy cannot satisfy identity')`.
   It models `ask/route.ts:48` (`candidates[0]`) against the same deterministic
   fixtures and shows it is structurally incapable of the identity contract:
   returns 2021 *Dune* when 1984 was asked for; always answers where the truth
   is ambiguous; ignores media type (*Fargo* the film when the series was
   asked for); accepts *The Fast and the Furious* as "Furious". It stays in the
   suite so the unsafe strategy cannot quietly return.

### Matcher provenance
`src/lib/packs/tmdbMatch.ts` + its 14 tests, ported **unchanged in behaviour**
from `origin/claude/showdown-cold-start-scanner` (PR #53, the Lifetime work
where the same popularity-as-identity defect was first found). Its own suite
passes 14/14 on this branch. No second matching algorithm was written.

**One concrete incompatibility, fixed minimally:** `MIN_NORMALIZED_LENGTH`
rejected titles under 3 characters outright, so `It (2017)` could not resolve
even with a year. The rule's OWN comment is conditional — *"Without a year there
is no way to tell them apart"* — so the floor now applies only when no year is
supplied. Nothing else was loosened: the year branch still requires exact
normalized title, in-range year and a unique winner. Both suites green.

### Identity contract
`resolveAnchor(request, candidates)` -> `resolved` | `ambiguous` | `not_found`.
Evidence: canonical TMDB id, media type as a HARD constraint (a stated type
excludes rather than down-weights), exact normalized title (case, accents,
punctuation, leading article are noise; a different WORD is a different title),
year as filter and tie-break. Popularity is never consulted. A `resolved`
anchor carries `titleId` (`tv:60622`), `tmdbId`, `mediaType` — never a display
string as identity.

### Ambiguous behaviour
Returns every exact-title alternative with id/title/mediaType/year, which is
enough for an interactive surface to ask *"which Dune did you mean?"*. It
contributes **zero** to ranking: `anchorsToObjective` keeps only resolved
anchors AND pads the authority denominator with the ones it could not place, so
one-of-two resolved yields PARTIAL authority rather than a request reported as
fully understood. Proven: `finalScore` array identical to baseline.

### Not-found behaviour
Reported with `spokenAs` so a caller can say *"I don't know that one"*. Also
contributes zero — proven against baseline.

### Production call path
**`ask/route.ts:48` does NOT own critic anchors.** `grep` confirms nothing
outside `src/lib/critic/` constructs a `CriticObjective`; the only importer is
`preference/rank.ts`. `referenceKeywordIds` feeds the legacy `runFinder`
keyword path. Per the scope instruction this was RECORDED, not casually fixed:

> **DEFECT — `src/app/api/ask/route.ts:45-57`.** `searchTitles(name)[0]` +
> keyword extraction. **Owning gate: GC1** (Recommendation Objective
> construction), which is where anchors will start being built and where this
> call must be replaced with `resolveAnchor`. Not GC2's scope, and expanding
> into it would have turned this gate into a repo-wide TMDB rewrite.

The layering is enforced and unchanged: parsing -> identity resolution ->
resolved `CriticObjective` -> `criticNudge` -> `rankWithPreference`.
`criticNudge` remains pure; `anchor.ts` performs no network call (it takes
candidates); no request-path AI call was added.

### GC8 regression
`materialDependence.test.ts` unchanged, **8 passed / 8**.

### Gates
typecheck 0 · lint 0 · **vitest 3237 passed / 0 failed** · build 0.
preference + critic + taste + packs: 257 passed / 0 failed.

---

## GC8 — COMPLETE (red-then-green)

### RED (before the ranking term existed)
`rankWithPreference` was widened to ACCEPT `opts.critic` while doing nothing
with it, so the failure would be behavioural rather than a compile error:

```
× THE GATE — swapping the anchors materially changes the order
  → expected [ 'tense-thriller', 'warm-comedy' ]
    to not deeply equal [ 'tense-thriller', 'warm-comedy' ]
× and it moves in the direction a critic would actually argue
  → expected 'tense-thriller' to be 'warm-comedy'
Tests  2 failed | 6 passed (8)
```

Two completely different anchor pairs produced the **identical order**. That is
the proof the ranker had no causal dependency on the critic output. The other 6
assertions (bounds, inertness, authority) passed in RED — correctly, because a
term that does nothing is trivially bounded.

### GREEN (after)
`Tests 8 passed (8)`. Same test file, unchanged assertions.

### Implementation
- `src/lib/critic/objective.ts` — `CriticObjective` / `CriticRelation` /
  `ResolvedAnchor`, plus `objectiveAuthority()`: unresolved anchors score 0,
  partial resolution scores proportionally (`mean confidence x coverage`).
- `src/lib/critic/nudge.ts` — `criticNudge()`. One mechanism over a relation,
  not a branch on the phrase "better than": `better_than` rewards DEPARTURE from
  the anchor centroid (a bar that was not cleared, not a template to copy),
  `like`/`like_but`/`blend` reward proximity. Distance is centred at 0.5 so the
  term reorders rather than shifting every candidate the same way.
- `src/lib/preference/rank.ts` — `finalScore = objective + nudge + critic.nudge`,
  with `criticNudge` and `criticAxes` exposed on `RankOutput` as the attribution
  trail.

### Guarantees pinned by the test
- **Bounded** at ±`CRITIC_NUDGE_MAX` (10) — a candidate 40 points ahead on the
  deterministic score is not overtaken.
- **Authority-scaled** — an anchor with no fingerprint contributes exactly 0.
- **Shared axes only** (min 2) — silence on an axis is not evidence.
- **Inert when absent** — every existing caller's `finalScore` is byte-identical.
- Taste DNA remains the personalization source; `preferenceNudge` is untouched.
- `MIN_RANK_CONF` imported and asserted at 0.25, never redefined.

### Identity-resolution audit (done, nothing introduced)
GC8 supplies anchors already resolved, so it needed no title lookup, and
`grep` confirms the critic layer performs **zero** calls to `searchTitles`,
`searchKeywords` or `getTitle`. The `searchTitles(name)[0]` anti-pattern at
`ask/route.ts:48` is untouched and remains GC2's job.

### Regression
typecheck 0 · lint 0 · **vitest 3204 passed / 0 failed** · build 0.
Preference/ranking/taste suites specifically: 191 passed, 0 failed.

---

## The smallest first cut (COMPLETE — kept for the record)

Before any LLM work, prove the plumbing can carry meaning:

1. Add `objective` to `FinderQuery` — `{ relationship: 'better_than' | 'like' | ..., anchors: ResolvedAnchor[] }`.
2. Make **one** ranking term read it. Even a crude one.
3. Write **GC8 first** — two anchor pairs, everything else constant, assert the
   result ordering differs. **It must FAIL before the ranking term is added and
   PASS after.** That failing-first run is the only proof the wiring is causal
   rather than decorative, and it is exactly the test the current architecture
   would silently pass if written after the fact.

Only then add the LLM critic stage on top of proven plumbing.

## Standing constraints

- Do not reduce the LLM to a query parser.
- Do not build a parallel preference engine — the Taste DNA/fingerprint work
  already exists and must be the source (`title_dimensions`, `deriveDna`,
  `preferenceNudge`).
- Do not hardcode `Furious` / `Widows Bay` to particular recommendations.
- Do not weaken tests to make the implementation pass.
- `searchTitles(name)[0]` is the same popularity-as-identity anti-pattern already
  fixed once in the packs work (`src/lib/packs/tmdbMatch.ts`) — reuse that
  matcher's discipline (exact normalized title, media-type constraint,
  unambiguous winner) rather than re-inventing it.
