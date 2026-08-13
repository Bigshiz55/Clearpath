# THE CRITIC — SHIP LEDGER

Make the AI the film critic, not the search parser. Continuation state across
sessions: read this, execute **NEXT ACTION**.

CURRENT SHA: (see git log)
BRANCH: `claude/critic-layer`, cut from `main` @ 6080287.
NEXT ACTION: GC2 — entity resolution. **Blocker to handle first:**
`src/lib/packs/tmdbMatch.ts` does NOT exist on `main`; it lives on
`claude/showdown-flagship`. PORT it to this branch (it is pure and imports
nothing) rather than writing a second matcher. Then resolve anchors with exact
normalized title + media-type constraint + unambiguous winner, never
`searchTitles(name)[0]`, and ASK when confidence is insufficient instead of
silently dropping the anchor.

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
- [ ] **GC2** Entity resolution with confidence + disambiguation question; never silently drop an anchor
- [ ] **GC3** Anchor fingerprints loaded from `title_dimensions` (not keywords)
- [ ] **GC4** Critic Reasoning stage producing traitsToPreserve / improve / avoid
- [ ] **GC5** Anchors + objective reach candidate retrieval
- [ ] **GC6** Anchors + objective reach FINAL RANKING (the causality gate)
- [ ] **GC7** Grounded explanations — new reason kind carrying the comparison
- [x] **GC8** Material-dependence test — **COMPLETE, red-then-green**
- [ ] **GC9** Counterfactual suite: anchors / DNA / relationship / modifiers / context each causal
- [ ] **GC10** Exact-query regression for `Better than Furious or Widows Bay` (structural, not hardcoded titles)
- [ ] **GC11** Latency budget + caching
- [ ] **GC12** Full gates + merge recommendation

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
