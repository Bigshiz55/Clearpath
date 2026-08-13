# THE CRITIC — SHIP LEDGER

Make the AI the film critic, not the search parser. Continuation state across
sessions: read this, execute **NEXT ACTION**.

CURRENT SHA: `1a84d8e6a21ec6bedd631a5ee4deb51ef302a0f4`
BRANCH: `claude/critic-layer`, cut from `main` @ 6080287.
NEXT ACTION: none — GC1–GC12 complete. PR is open against `main`, awaiting
owner review. Do not merge without explicit approval.

STATE: GC1–GC12 complete (250 critic tests), merged with `main` @ ae25f6f. A comparative Ask parses the relation and both
anchors, resolves each identity through GC2, hydrates canonical fingerprints,
builds a GC4 plan, issues recall-safe GC5 strands, orders the real response by
`decisionScore = matchScore + planNudge`, and explains the winner from that same
contribution arithmetic, within a measured round-trip budget.

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

- [x] **GC1** Real Recommendation Objective construction on `/api/ask` —
      **COMPLETE, red-then-green**
- [x] **GC2** Anchor identity resolution — **COMPLETE, red-then-green**
- [x] **GC3** Anchor fingerprint hydration — **COMPLETE, red-then-green**
- [x] **GC4** Critic Reasoning stage — **COMPLETE, red-then-green**
- [x] **GC5** Anchors + objective reach candidate retrieval — **PRODUCTION WIRED
      by GC1** (contract red-then-green; strands now issued by `/api/ask`)
- [x] **GC6** Anchors + objective reach FINAL RANKING — **COMPLETE,
      red-then-green.** Audit done first; composition is explicit.
- [x] **GC7** Grounded comparative explanations — **COMPLETE, red-then-green**
- [x] **GC8** Material-dependence test — **COMPLETE, red-then-green**
- [x] **GC9** Counterfactual suite: anchors / DNA / relationship / modifiers / context each causal — **COMPLETE**
- [x] **GC10** Exact-query regression for `Better than Furious or Widows Bay` (structural, not hardcoded titles) — **COMPLETE**
- [x] **GC11** Latency budget + caching — **COMPLETE, red-then-green**
- [x] **GC12** Full gates + merge recommendation — **COMPLETE. Recommendation:
      MERGE.** PR open against `main`; not merged.

---

## GC12 — COMPLETE · full gates + merge recommendation

### Integration

`origin/main` verified at execution time as **`ae25f6f`** (9 commits ahead of
this branch's base `6080287`: the landing Example Verd1ct, the canonical
provider-brand registry, and verified brand marks). Integrated by **merge**
(`git merge origin/main`) rather than rebase, so the red-then-green history each
gate rests on stays intact and auditable.

**Conflicts: none.** Git auto-merged the two files both sides touched —
`verdictExplain.ts` and `WhyVerdict.tsx` — because main's changes were to the
`availability` shape and this branch's were the separate `comparison` field.

### Rollback audit

Four files differ from `origin/main`, and every difference was inspected line by
line. **All 27 deletions are this branch's own intentional work; none removes
anything main added.**

| file | delta | verdict |
|---|---|---|
| `WhyVerdict.tsx` | +`comparison` field, +FOR THIS REQUEST block | pure addition — main's `ProviderChip` availability row intact |
| `verdictExplain.ts` | +`comparison` field | pure addition — main's `service`/`logoPath`/`access` shape intact |
| `finder.ts` | +`minVotes`, one default expression widened | additive; unset behaves exactly as before |
| `BACKLOG.md` | critic entries | main's brand-registry entry preserved |

Remaining deletions, each accounted for: the old `searchTitles(name)[0]` block
(replaced by GC2 resolution + GC11's keyword split), the `anthropic` guard line
(GC1-correction added `!criticRequest`), the `lex` declaration and its comment
(moved to 0.6, above the AI orchestrator), the `minVotes` default, and
`rank.ts`'s options/`finalScore` lines (GC8's critic term).

**One accidental rollback WAS found and fixed.** `evaluation-results/*` — eval
evidence belonging to the DNA-showdown workstream — had been picked up by the
GC2–GC4 commits as auto-regenerated copies, rewriting main's recorded SHAs with
this branch's. Pass counts were unchanged, but the branch had no business
rewriting another workstream's evidence. Restored to main's version verbatim.

**The frozen search corpus was never touched.** `artifacts/search-audit/` is
byte-identical to `main`, and `search-corpus-1000.json` still hashes to
`32fbe023…11002`, matching its recorded `.sha256`.

### Final gate run, on the merged tree

| gate | exit | result |
|---|---|---|
| GC1 | 0 | 31 passed |
| GC2 anchor identity | 0 | 19 passed |
| GC3 hydration | 0 | 15 passed |
| GC4 plan | 0 | 20 passed |
| GC5 retrieval | 0 | 17 passed |
| GC6 | 0 | 22 passed |
| GC6 double-count audit | 0 | 5 passed |
| GC7 | 0 | 27 passed |
| GC8 material dependence | 0 | 8 passed |
| GC9 counterfactual causality | 0 | 30 passed |
| GC10 exact-query regression | 0 | 21 passed |
| GC11 latency + caching | 0 | 14 passed |
| serving-mode (GC1 correction) | 0 | 14 passed |
| production wiring | 0 | 7 passed |
| **all critic** | 0 | **250 passed** |
| `npx vitest run` | 0 | 3499 passed, 24 skipped, **0 failed** |
| `npm run typecheck` | 0 | clean |
| `npm run lint` | 0 | no warnings or errors |
| `npm run build` | 0 | clean |
| searchrouting Playwright | 0 | 21 passed |
| frozen corpus | 0 | P0 **635/635** · P1 **515/515** |

**Frozen delta: 0 PASS→FAIL, 0 FAIL→PASS.**

### Merge recommendation: **YES**

The incident that opened this workstream is closed at the mechanism, not the
symptom. `Better than Furious or Widows Bay` now keeps its relation, resolves
both anchors independently against decoy-first candidates, hydrates them from
the canonical cache, reasons about them with the user's own taste, retrieves
without letting a critic guess become a filter, orders the real `/api/ask`
response, and explains the winner from the same arithmetic that produced it —
without ever claiming the user liked a title merely because they named it.

Known limits, recorded rather than hidden: the `preference_rules` ↔ canonical
DNA overlap is bounded (±10) rather than eliminated and needs a separate
migration; `rankWithPreference` is now dead production code awaiting a
deliberate decision; and GC11 measured round-trip structure, not real TMDB
latency, which wants sampling once deployed. None blocks merge.

---

## GC11 — COMPLETE · latency budget + caching (red-then-green)

### Definition, as recorded on this branch

Checklist: *"GC11 Latency budget + caching."* GC5 section: *"Strands run
concurrently … TMDB budget genuinely N×, capped at `MAX_STRANDS = 5` — **tuning
is GC11**."* BACKLOG: *"The critic path issues one `runFinder` per GC5 strand …
**Needs measuring and tuning against real pools.**"*

Latency is behavioural, so the gate is measured, not read: `gc11.test.ts`
instruments the real `buildCriticState` and counts what it actually does.

### Why serial depth, not milliseconds

Wall-clock in CI measures the machine. **Round-trip depth** — how many network
hops must happen one after another before an answer can exist — is what the code
controls and what a user feels. Assertions are on depth, peak concurrency and
call counts (all deterministic), with one wall-clock cross-check under simulated
latency whose bound only parallelism can meet.

### RED

```
Tests  5 failed | 8 passed (13)
  4 · anchors resolve CONCURRENTLY      peak concurrency = 1
  5 · serial depth bounded              depth 3, needed ≤ 2
  2 · keywords from resolved anchors    loader never called
  6 · wall-clock reflects parallelism   3 calls where ≥ 4 expected
 13 · no model call in request path     (docblock false positive — rescoped)
```

### Production defects found

1. **Identity resolved TWICE per anchor.** The route computed the soft keyword
   seed with `referenceKeywordIds(names)`, which ran `searchTitles` +
   `resolveAnchor` again for names GC2 had *already* resolved. A two-anchor
   comparison paid **four** identity searches and produced **two independent
   resolutions of the same title** — free to disagree, with no reconciliation.
2. **Anchors resolved serially.** `for (… ) { await searchCandidates(…) }` made
   each additional anchor cost a full extra round-trip before anything else
   could start.
3. **A cache with zero callers.** `loadPreferenceCached` (300s revalidate) had
   existed since before this workstream and was used nowhere; the critic path
   did a full preference-event read on every request.

### Fixes

| defect | fix | effect |
|---|---|---|
| duplicate resolution | `OrchestrateInput.loadAnchorKeywords(resolvedAnchors)` — the seed is derived from the anchors GC2 placed | identity searches per request **4 → 2**; one resolution, so disagreement is impossible |
| serial resolution | `Promise.all` over `referenceTitles`, order preserved for the authority arithmetic | peak concurrency **1 → 2**; anchor count no longer adds hops |
| serial hydration + keywords | both depend only on identity, so they run in one `Promise.all` | **depth 3 → 2** |
| unused cache | route now calls `loadPreferenceCached` | one event-table read removed per comparative request |
| cap unreadable | `MAX_STRANDS` extracted to pure `strandBudget.ts` (`strands.ts` is `server-only`) | the fan-out budget is now assertable |

Deriving keywords from the resolved anchor is also **more correct**, not just
cheaper: the old path fetched *Furious 7's* keywords for "Furious".

### Behavioural proof (GREEN, 14/14)

| measured | result |
|---|---|
| identity searches for a 2-anchor request | **2** (was 4) |
| keyword loader invocations | **1**, called with `[502, 602]` — the resolved, decoy-free ids |
| fingerprint reads | **1** batch, cache-only |
| peak concurrency | **> 1** |
| serial depth, 1 anchor vs 2 | **equal**, and ≤ 3 |
| wall-clock under simulated latency | **< 80%** of the serial sum |
| strands per relation | ≤ `MAX_STRANDS` for all four relations |
| strands vs anchor count | **unchanged** — naming more titles does not multiply the TMDB budget |

### Caching may not change meaning

Fingerprint miss → identity survives, authority 0, plan silent, **no retry
storm** (still exactly 2 searches). Keyword-loader throw → comparison intact,
plan intact, recall-floor intact; only the soft seed is lost. Repeated identical
requests → byte-identical plan and hints. No model call anywhere in
`src/lib/critic` (asserted against code, comments stripped).

### Contracts preserved

No change to `CRITIC_NUDGE_MAX`, `MIN_RANK_CONF`, `applied` semantics, Match vs
`decisionScore`, DNA double-counting, DNA writes, cache-only hydration, anchor
identity, hard constraints, or explanation grounding. GC8 8/8, GC9 30/30 and
GC10 21/21 all unchanged and green.

### Gates

| gate | exit | result |
|---|---|---|
| GC8 | 0 | 8 passed |
| GC9 | 0 | 30 passed |
| GC10 | 0 | 21 passed |
| GC11 | 0 | 14 passed |
| all critic | 0 | 250 passed |
| `npx vitest run` | 0 | 3460 passed, 24 skipped, **0 failed** |
| typecheck · lint · build | 0 · 0 · 0 | clean |
| searchrouting Playwright | 0 | 21 passed |
| frozen corpus | 0 | P0 635/635 · P1 515/515 |

Frozen corpus delta: **0 PASS→FAIL, 0 FAIL→PASS**.

---

## GC9 — COMPLETE · counterfactual causality suite

`src/lib/critic/gc9.test.ts`, 30 tests. All five factors changed ONE AT A TIME
through the real production functions. Passed on first run; no RED was
manufactured.

### The causal matrix

| factor changed | held constant | what changed downstream | why |
|---|---|---|---|
| **anchor** fingerprint | pool · DNA · relation · modifiers · context · base scores | plan axis set `[darkness,suspense]` → `[humor]`; **order flips** movie-1 ↔ movie-2; nudge gap > 2 pts | the anchor decides WHICH AXES earn an instruction, and (for a neutral user) the target itself |
| **anchor** identity | as above + per-title fingerprints | `502` → `701` reaches a different fingerprint → different order | identity → hydration → plan is a real chain, not a label |
| **Taste DNA** | anchor · pool · relation · modifiers · context · base | tense +9.51/funny −4.30 → tense **−4.45**/funny **+9.23**; order reverses | targets follow `effectiveTaste`, so opposite taste inverts every agreement |
| **relationship** | anchors · fingerprints · DNA · pool · modifiers · context | `like`(neutral) twin +9.80 → top=twin, applied **true**; `better_than`(neutral) **0 instructions**, applied **false**; `better_than`(confident) top=improved | GC4 lets `like` preserve on relation alone and forbids `better_than` from preserving on one fact |
| **modifiers** | everything else | "but faster" fast **+7.60**/slow −4.40; "but slower" fast **−4.40**/slow **+7.60**; order flips | a request modifier emits a `request`-provenance instruction with its own target |
| **hard context** | anchor · DNA · relation · modifiers | `hints.hard` changes; **plan byte-identical**; ranking identical | context is a retrieval fact, deliberately NOT a critic-interpretation fact |

### A weak fixture caught and fixed (disclosed)

The first GC9-A draft used two anchors expressing the SAME axes for a user
confident on all of them. `planNudge` consumes `target` and `strength` only —
`kind` is explanatory — so with a confident user the target follows the USER and
both anchors produced nearly the same numbers: **9.51 → 9.64, order unchanged**.
It passed `not.toBeCloseTo(…, 3)` while proving nothing.

That is not a defect in the system: "preserve at 85" and "avoid, move to 86"
genuinely point at the same destination and *should* score alike. It was a
defect in the test. Rewritten to exercise the two real causal channels — axis
selection, and target-when-the-user-is-neutral — and to demand an **order flip**
plus a material (> 2 point) gap. GC9-A3 then caught a second fixture error of
mine (`like` + neutral DNA preserves warmth too, so one candidate resembled both
anchors); fixed with a pool where each candidate resembles exactly one.

### Negative controls (GC9-F)

Determinism (identical inputs → byte-identical plan and decisions) · unhydrated
anchor → authority 0, no invented effect, input order preserved · partial
resolution → strictly lower but positive authority · non-comparative requests
critic-silent · ungrounded comparative ("better acted") changes **no** ranking
instruction and leaves the nudge identical to 10dp · zero contribution →
`eligible: true`, `applied: false` · bound holds (≤ 10) across 18 combinations of
DNA × relation × anchor.

---

## GC10 — COMPLETE · the original failure, exact sentence

`src/lib/critic/gc10.test.ts`, 21 tests. Literal sentence, structural mechanism.

### The incident, end to end

```
"Better than Furious or Widows Bay"
  relation      better_than
  anchors       Furious=movie:502, Widows Bay=movie:602   (decoys 501/601 rejected)
  authority     1.000  (both resolved, both hydrated)
  strands       recall-floor, anchor-keywords, anchor-genres, acclaim
  plan          darkness:preserve@85  humor:avoid@10
                suspense:preserve@87  complexity:preserve@81
  order         movie-3002 (+9.70)   movie-3001 (+6.07)   movie-3003 (+2.58)
  applied       true
  WHY           Drops the high humour of Furious and Widows Bay, which tends to
                work against it for you.
                Keeps Furious and Widows Bay's high suspense, which fits your taste.
                Keeps Furious and Widows Bay's high darkness, which fits your taste.
```

Base scores are identical across the pool, so the entire order is the critic's.

### The regression anchor

Test 1 asserts the **untouched shipped parsers still fail**: `extractReference`
→ null, `classifySearch().mode` → `exact_title` with the whole sentence as the
title, `applyTurn().referenceTitles` → `[]`. That is the fallback the request
lands in if the critic path ever becomes unreachable — so it is pinned rather
than assumed. Test 2 proves the critic claims the sentence first, in all three
serving modes.

### Invariants asserted (not a frozen winner)

relation survived · both identities survived and resolved independently · both
hydrated · authority honest under full/partial/no hydration · plan grounded with
`preserve` on suspense and `avoid` on humour · recall-floor ungated · hard
constraints intact with no inference joining them · pool reaches ranking with
identical membership · order materially critic-dependent (vs `undefined` plan) ·
explanation sums to the nudge (6dp) and speaks only about axes that participated
· anchors named collectively · no "you liked/loved/rated/watched" · no claim of
objective superiority · `matchScore`/`generalScore` untouched · no coefficients
in prose · bound holds against a 25-point-stronger baseline.

**No expected winner is frozen.** Nothing asserts a particular title must rank
first forever.

### No special-casing

Test 20 strips comments from all 12 production modules in `src/lib/critic/` and
asserts the remaining CODE matches neither `Furious` nor `Widows Bay`. Test 21
runs the same shapes on `Better than Heat or Sicario`.

### Control

`Something like Furious or Widows Bay` — same fixtures, same two identities
(`movie:502`, `movie:602`), yet relation `like` vs `better_than` and different
strand sets. The two requests do not collapse into one search, which is the
defect class that started this workstream.

---

## GC7 — COMPLETE (red-then-green)

### Pre-GC7 correction — `applied` meant standing, not influence

`rankCriticCandidates().applied` returned `true` whenever a plan existed, had
instructions and held positive authority — **even when every candidate lacked a
cached fingerprint, or every contribution landed at exactly 0**. In both cases
the returned order is the incoming order, so `finalRankingConsumesPlan: true`
asserted a causal influence that never happened.

Two notions, now separate and both reported:

| field | means | measured from |
|---|---|---|
| `eligible` | the plan had STANDING to act | plan exists · instructions > 0 · authority > 0 |
| `applied` | the plan actually MOVED something | `decisions.some(d => d.criticNudge !== 0)` |

`eligible && !applied` is the honest description of "ready to reason, nothing to
reason about". Ordering is unchanged — this only governs what is claimed.
Pinned by gc7 tests 0a/0b/0c.

### Existing explanation path — the gap, recorded

```
runFinder  scoreCandidate
  buildItemExplanation(q, facts)               finderExplain.ts:95
    -> explainVerdict({ matchScore, generalScore, matchedTraits, riskTraits,
                        requirements, ratingSourceCount, availability })
       -> VerdictExplanation { rose, heldBack, requirements,
                               availability, confidence }
  FinderItem.explain = explain                 finder.ts:622
```

It is built **inside `runFinder`, before GC6 exists**. It therefore knows the
durable Match, general quality, hard requirements, availability and the normal
reasons for/against — and **nothing whatsoever about why a comparative request
reordered this title**. There was no field it could have gone in.

### Contribution-trace contract — one arithmetic, one story

`planNudge` now returns `contributions: CriticAxisContribution[]`:

```
axis · kind · candidateValue · target · anchorValue · strength
     · evidence[] · agreement · points
```

`points = agreement × strength × (CRITIC_NUDGE_MAX × authority / mass)` — a
DECOMPOSITION of the ranking arithmetic, not a second calculation. gc7 test 1
asserts `Σ points ≈ criticNudge` to 6dp. `CriticDecision` carries the trail, and
`explain.ts` is asserted to contain no `CRITIC_NUDGE_MAX` and no agreement
formula, so it cannot drift from the decision it describes.

### Provenance → language rules

| evidence | wording | why |
|---|---|---|
| `request` | "Moves toward more pacing — **the change you asked for**." | the only class the user stated outright; leads the section always |
| `anchor` + `user_dna`, preserve | "Keeps Furious's high suspense, **which fits your taste**." | two facts stated as two facts |
| `anchor` + `user_dna`, avoid | "Drops the high humour of Furious, **which tends to work against it for you**." | anchor possession + user rejection |
| `anchor` only | "Tracks Furious closely on suspense." | no claim about the user is licensed |

**FORBIDDEN, and asserted absent:** `you liked` / `you loved` / `you enjoyed` /
`you rated` / `you watched` / `your favourite`. Naming a title in "Better than
X" is not evidence the user liked X — wanting *better* is, if anything, mild
evidence against it. Test 5 sweeps every relation × both DNA profiles.

`better_than` never claims objective superiority (test 8: no
`objectively better|superior|higher rated|acclaim`). Anchors are named
collectively when several resolved, so **`blend` cannot assign a trait to one
anchor** — `readAnchors` averages, so per-anchor ownership is not in the data.
Unresolved anchors are never spoken of (test 18 → explanation is `null`).

### RED → GREEN

```
RED    6 failed | 20 passed (26)
GREEN  27 passed (27)
```

RED failures were production wiring (20–23) plus two real defects:

1. **Test 11 — the requested shift was being crowded out.** "Furious but faster"
   ranked pacing 4th by points, and `MAX_REASONS = 3` dropped it, so the one
   thing the user said outright never appeared. Fixed in the CODE, not the test:
   `request` provenance now sorts ahead of every inference regardless of
   magnitude.
2. **Test 3 was over-specific** — it banned the literal `spokenAs)`, which is
   legitimate property access on an already-resolved anchor. Narrowed to what it
   meant: no `searchTitles` / `pickMatch` / `resolveAnchor` in the explainer.

### A false anchor fact, caught by inspecting the real copy

The `avoid` line originally read its level from `target` / `candidateValue` and
emitted **"Drops the low humour of Furious"** — while Furious sits at **80** on
humour. Fluent, confident, and about the wrong title. `TraitInstruction` now
carries `anchorValue` (the anchors' own mean) and the claim is made only when
that reading exists. Pinned by test 7b.

### Winner explanation proof (real output)

`Better than Furious`, dark DNA, nudge **+9.89**:

```
Drops the high humour of Furious, which tends to work against it for you.
Keeps Furious's high suspense, which fits your taste.
Keeps Furious's high darkness, which fits your taste.
```

Preserve axes that helped, the avoided axis that helped, correct provenance
(`anchor` + `user_dna`), resolved anchor identity — and no claim the user liked
anything.

### Opposite-user proof

Same anchor, same candidates, opposite mature DNA → nudge **−4.02** and the
winner itself flips:

```
Still carries the suspense your profile tends to reject.
Sits further from the humour your profile favours.
Still carries the darkness your profile tends to reject.
```

Test 10 also bans generic filler (`strong match for you|great fit|you'll love`).

### Explicit-modifier proof

`Furious but faster` → relation `like_but`, modifiers `{pacing: 'higher'}`, and
pacing carries `request` provenance:

```
Moves toward more pacing — the change you asked for.
Drops the high humour of Furious, which tends to work against it for you.
Keeps Furious's high suspense, which fits your taste.
```

Test 12 asserts the pacing line is NOT described as a Taste-DNA preference.

### Zero-impact silence proof

`buildComparativeExplanation` returns **null** when: no contributions, `nudge`
is exactly 0, no material contribution, or no anchor resolved. Tests 13
(no fingerprint), 14 (authority 0), 18 (unresolved anchor). Cautions require a
real negative contribution — **placing second is never evidence** (test 15).
Prose carries no coefficients (test 19: no `\d+\.\d+`, no `nudge`/`decisionScore`).

### Production wiring

`/api/ask`, after GC6 ranking: each item's `explain` payload gains a
`comparison` section built from that item's own `CriticDecision`. It is
assembled **before** the `NODE_ENV` diagnostics gate (test 21 compares indices),
so the customer-facing reason ships in production while `criticAttribution`
stays development-only. `VerdictExplanation.comparison` was added as an explicit
optional field rather than relying on structural pass-through.

### Display semantics

`matchScore` remains what the card shows; `decisionScore` is never rendered
(test 22 asserts it appears nowhere in `WhyVerdict.tsx`). The new **FOR THIS
REQUEST** section renders first and only when grounded evidence exists — a
heading with nothing under it would imply a comparison happened. Non-comparative
cards have no `comparison` field and render byte-identically. No card redesign,
no new modal.

### GC8 regression

Unchanged and green (8/8).

### Gates

| gate | exit | result |
|---|---|---|
| GC7 focused | 0 | 27 passed |
| all critic (GC1–GC8, wiring, audit) | 0 | 185 passed |
| `npx vitest run` | 0 | 3395 passed, 24 skipped, **0 failed** |
| `npm run typecheck` | 0 | clean |
| `npm run lint` | 0 | no warnings or errors |
| `npm run build` | 0 | clean |
| `npx playwright test -c playwright.searchrouting.config.ts` | 0 | 21 passed |
| frozen corpus `layerBext` | 0 | P0 635/635 · P1 515/515 |

Frozen corpus delta: **0 PASS→FAIL, 0 FAIL→PASS**.

---

## GC6 — COMPLETE (audit first, then red-then-green)

### PHASE 1 · SCORE-COMPOSITION FORENSIC AUDIT

Traced on this branch. `FinderItem.matchScore` is **not** a quality number:

```
runFinder
  basePersonal = getPersonalContext(supabase, userId, null)   profile.ts:144
                   -> getProfile           (profiles.liked_franchise_ids)
                   -> getRawPreferenceRules (preference_rules)
                   -> hasSignal = rules.length > 0 || likedFranchiseIds.length > 0
  buildVerdict({ meta, providers, personal })                 verdict.ts:251
    general = computeGeneralScore(meta, providers)
    match   = computePersonalMatch(meta, general.score, personal)   personal.ts:41
              hasSignal === false -> score = general.score, adjustments = []
              else  score = clamp(general.score + Σ rule.weight  where
                                  detectTrait(rule.trait, meta) fires)
  effectiveMatch = household ? household.score : report.personal.score   finder.ts:538
  FinderItem.matchScore = effectiveMatch                               finder.ts:592
  items.sort((a, b) => b.matchScore - a.matchScore)                    finder.ts:719
```

#### Term table

| term | source data | durable vs request | production surfaces | bound | can overlap? |
|---|---|---|---|---|---|
| `computeGeneralScore` | TMDB meta + providers | neither (title quality) | everywhere | 0–100 | — |
| `preference_rules` weights | `preference_rules` table | **durable** | `runFinder` → Ask, Finder | unbounded sum, clamped 0–100 | **yes — with canonical DNA** |
| `liked_franchise_ids` | `profiles` | durable | same | via a rule weight | no (franchise identity) |
| `deriveDna` → `effectiveTaste` | `preference_events` | **durable** | `rankByDna`, GC4 `buildPlan` | pref 0–100 + confidence | **yes — with rules** |
| `preferenceNudge` | canonical DNA | durable | **`rankByDna` only** | ±`PREF_NUDGE_MAX` = 10 | yes |
| `dimensionMatch` → dim nudge | `title_dimensions` + profile | durable | `rankByDna` only | ±`DIM_NUDGE_MAX` = 8 | yes |
| `rerankNudge` | learned weights | durable | `rankByDna` only | model-bounded (currently no-op) | yes |
| `dnaScore` (embeddings) | `title_vectors` | durable | `rankByDna` only | blends into base | yes |
| **`planNudge` (GC4)** | anchors + relation + DNA + modifiers | **request-specific** | **Ask comparative (GC6)** | ±`CRITIC_NUDGE_MAX` = 10 × authority | yes |

#### The decisive structural finding

**`rankByDna` is never called by `/api/ask`.** Its only callers are
`src/app/app/watch/page.tsx` and `src/lib/browse.ts`. It also builds its score
from `computeGeneralScore`, **not** from `matchScore` — it is a parallel
composition on other surfaces, not a layer above this one.

So on the Ask comparative path the only personalization present is
`preference_rules`, and canonical event-derived DNA reaches Ask ordering
**nowhere at all**.

### DOUBLE-COUNT FINDING — overlap is REAL

Not answered by "different tables". The vocabularies genuinely collide:

| legacy rule trait | canonical DNA axis | relationship |
|---|---|---|
| `slow_burn` | `pacing` (low) | **same preference, two vocabularies** |
| `grounded_crime` | `realism` + `darkness` | partial |
| `noir` | `darkness` + `morality` | partial |
| `serial_killer` | `violence` + `darkness` | partial |
| `psychological_thriller` | `suspense` + `complexity` | partial |
| `supernatural` / `fantasy` / `science_fiction` | `realism` (inverse) | partial |
| `franchise_favorite` | — | **none** |

`src/lib/critic/doubleCount.test.ts` prints the real terms:

| case | general | rule term | matchScore | criticNudge | decisionScore |
|---|---|---|---|---|---|
| 1 · rule only, no DNA | 72 | **+12** | 84 | **0** | 84 |
| 2 · DNA only, no rule | 72 | 0 | 72 | **+9.77** | 81.77 |
| 3 · both, SAME preference | 72 | **+12** | 84 | **+9.77** | **93.77** |
| 4 · both, CONFLICTING | 72 | +12 | 84 | **−3.59** | 80.41 |

**Case 3 is a genuine overlap and it is not eliminated — it is bounded.** The
critic contributes at most ±10 no matter how many vocabularies agree, and the
two terms answer different questions (see the formula below). Fully removing the
overlap means consolidating `preference_rules` with canonical DNA, which is a
data migration touching `rankByDna`, `browse`, `/app/watch` and the legacy rules
UI. **Recorded in BACKLOG rather than forced into GC6**, per the scope rule.

### FINAL-SCORE FORMULA — proved, not assumed

```
decisionScore = matchScore + planNudge(candidate.dims, criticPlan)
```

**NOT** `matchScore + preferenceNudge + planNudge`, and the reason is in the
code rather than in a preference: `buildPlan` already consumes canonical DNA —
its targets are literally `effectiveTaste(dna)[axis].pref`, asserted by
doubleCount CASE 5:

```
plan.instructions.pacing.target === effectiveTaste(DNA_SLOW).pacing.pref
plan.instructions.pacing.evidence includes 'user_dna'
```

So the plan term **already is** the canonical DNA, applied through the request.
Adding the raw per-axis preference nudge beside it would move the same candidate
on the same evidence twice, and it would be invisible — both terms are bounded,
so the output would simply look more confident.

`rankWithPreference` was therefore deliberately **not** wired: it composes
`objective + preferenceNudge + critic`, which is exactly the rejected formula.
It remains with zero production callers, still pinned by
`productionWiring.test.ts`, now flagged as dead code needing a deliberate
decision.

### Three concepts, kept apart

| concept | field | question it answers | persisted? |
|---|---|---|---|
| GENERAL QUALITY | `generalScore` | is this title any good? | — |
| DURABLE MATCH | `matchScore` | what do we lastingly know about this user? | yes |
| REQUEST DECISION | `criticNudge` → `decisionScore` | which of these best answers what you asked **right now**? | **no** |

### RED → GREEN

`rankCriticCandidates` was first written to model today's behaviour (plan
reaches the pool and stops):

```
RED    10 failed | 12 passed (22)
GREEN  22 passed (22)
```

RED failures were the causality gate itself: test 1 returned
`['movie-9001','movie-9002']` (input order) where `['movie-9002','movie-9001']`
was required; tests 3, 4, 5 failed on `criticNudge` being 0 everywhere.

Two RED failures (16, 17) were the test correctly catching **my own docblock
prose** — the module named `preferenceNudge(` and `preference_events` while
explaining why it does not use them. Reworded rather than relaxing the guard.

### Same-pool proof (GC6, not GC5)

Test 2 asserts membership is identical before and after ranking:
`poolOf(ranked) === sorted(POOL keys)`, `decisions.length === POOL.length`. Only
the sequence moves. Every causal test uses the same frozen `POOL` — same ids,
same base scores, same dims.

### Realistic critic case

Anchor is strong on three axes the user loves (`darkness` 85, `complexity` 82,
`suspense` 88) **and** on one they reject (`humor` 80). Plan verified:
`darkness/complexity/suspense → preserve`, `humor → avoid`. Candidate A keeps
the three and fixes the fourth; candidate B is merely more different. **A wins**
— which undirected "be different from the anchor" could never have produced.

### Opposite-user proof

Same anchors, same candidates, same base scores, opposite mature DNA. Plans
differ (test 6) and the order flips: dark-loving DNA → A first, light-loving DNA
→ B first, with identical pool membership.

### Authority / bounds

- `CRITIC_NUDGE_MAX` = 10, unchanged and asserted
- `MIN_RANK_CONF` = 0.25, unchanged and asserted
- authority scaling preserved (`planNudge` × authority)
- **no plan / authority 0 → input order returned byte-identical**, `applied: false`
- **missing candidate dims → contribution exactly 0**, `fingerprinted: false`,
  `decisionScore === matchScore` — never a neutral 50
- a candidate 25 points better on durable merit and worst-possible plan fit
  still wins (max swing is 20 < 25)
- `decisionScore === matchScore + criticNudge` asserted to 10dp — no hidden term

### Production call site

`/api/ask`, immediately after `runStrands`:
batch `getCachedDimensions` (cache-only, composite `mediaType + tmdbId`) →
`rankCriticCandidates` → items re-ordered by decision → response.
`finalRankingConsumesPlan` is set from `ranked.applied` — **the report of what
happened**, not a claim. `orchestrate.ts` initialises it via a named
`NOT_YET_RANKED` constant because at that point in the pipeline ranking has not
run.

### Displayed Match vs decision score

`matchScore` and `generalScore` pass through untouched (test 14). The card keeps
showing the durable Match it earned; `decisionScore` only orders the list and is
never written onto the card or into Taste DNA (tests 15, 17). No card copy was
redesigned — GC7 will explain why the winner won.

### GC8 regression

Unchanged and green (8/8). GC6 did not touch `rankWithPreference`, so GC8
remains the lower-level invariant; GC6 completion rests on the real Ask path.

### Gates

| gate | exit | result |
|---|---|---|
| GC6 focused | 0 | 22 passed |
| double-count audit | 0 | 5 passed |
| all critic (GC1–GC6, GC8, wiring) | 0 | 158 passed |
| `npx vitest run` | 0 | 3368 passed, 24 skipped, **0 failed** |
| `npm run typecheck` | 0 | clean |
| `npm run lint` | 0 | no warnings or errors |
| `npm run build` | 0 | clean |
| `npx playwright test -c playwright.searchrouting.config.ts` | 0 | 21 passed |
| frozen corpus `layerBext` | 0 | P0 635/635 · P1 515/515 |

Frozen corpus delta: **0 PASS→FAIL, 0 FAIL→PASS**.

---

## GC1 — COMPLETE (red-then-green)

### The defect, measured on this branch

All three shipped ask parsers were run over the target sentence. The result is
worse than "anchors are flattened":

| parser | `Better than Furious or Widows Bay` | `Something like Furious or Widows Bay` |
|---|---|---|
| `extractReference` | **null** | `"Furious or Widows Bay"` (one flat string) |
| `classifySearch().mode` | **`exact_title`** | `similar_to` |
| `classifySearch().requestedTitle` | **the entire sentence** | null |
| `applyTurn().referenceTitles` | **`[]`** | `["Furious", "Widows Bay"]` |

`REF_CUE` in `askJudge.ts` has no "better than" branch, and the conversational
extractor's regex is literally `/\b(?:like|similar to)\s+.../`. So the anchors
were not lost in transit — **they were never extracted**, and the whole sentence
was looked up as if it were the name of a film. That lookup finds nothing, the
request degrades to generic discovery with no anchors, and Taste DNA alone picks
a drama. **That is the Cool Hand Luke mechanism, end to end.**

`like_but` and `blend` failed the same way (`Furious but funnier` and
`Furious meets Widows Bay` both classified `exact_title`).

### Production parse path, after GC1 + the serving-mode correction

```
POST /api/ask
  0.6  lexicalIntent(text)
  0.65 routeAsk(text, aiMode)            ← COMPARATIVE INTENT BOUNDARY
         consumer = 'critic'          -> canonical GC1–GC5 path
         consumer = 'ai_discovery'    -> provider brain (non-comparative only)
         consumer = 'legacy_discovery'-> existing pipeline
  0.7  AI orchestrator                   guarded by `!criticRequest`
  0.9  critic path (uses 0.65's request)
         null  -> every existing path runs untouched
         hit   -> critic path:
           hard  = stateToQuery(convState)            (conversational)
                 | augmentInternational(naiveParseQuery(text))  (fresh)
           GC2   resolveAnchor(spokenAs, searchTitles candidates)
           GC3   hydrateAnchors(getCachedDimensions)
                 anchorsToObjective(requested = names the user typed)
           GC4   buildPlan(relation, anchors, DNA, modifiers, authority)
           GC5   planToHints -> runStrands (concurrent, base query per strand)
           ──────── GC6 BOUNDARY ────────  items stay in finder matchScore order
  1)   askJudgeTitle …           (unchanged, now guarded by !criticRequest)
  2a)  conversational discovery  (unchanged)
  2)   AI / naive discovery      (unchanged)
```

Placed **above** the exact-title lookup deliberately — that is the branch that
was swallowing the sentence — and **above the AI orchestrator**, for the reason
in the next section.

### CORRECTION — the critic must survive AI discovery mode

The first GC1 commit put the critic at 0.9 and left the AI orchestrator at 0.7.
`runAiDiscovery` returns a **finished search response**, so in
`AI_DISCOVERY_MODE='anthropic'` a comparative sentence never reached
`parseCriticRequest` at all. The claim *"one pure parser for conversational, AI
and naive modes"* was therefore **not true when written**. It is true now.

The default mode being `legacy` did not make this safe — it made it latent, and
the failure would have appeared the moment a provider flag flipped.

**Root cause:** provider selection was happening *before* comprehension. The
route decided WHO answers before deciding WHAT was asked.

**Fix:** `src/lib/critic/gate.ts` — `routeAsk(text, mode, opts)`. `mode` is read
only *after* comparative intent, and a comparison returns before any expression
a serving flag could evaluate differently. It is a pure function rather than the
physical order of two blocks, because an ordering rule that exists only as
block position is one refactor away from silently reversing.

RED was behavioural — `routeAsk` first modelled the shipped ordering:

```
RED    7 failed | 7 passed (14)   ← anthropic → 'ai_discovery' on both sentences
GREEN  14 passed (14)
```

| assertion | result |
|---|---|
| all three modes route a comparative to the critic | ✅ |
| anthropic may NOT consume a comparative | ✅ |
| canonical `CriticRequest` byte-identical across modes | ✅ |
| legacy vs anthropic canonical shape (relation, anchors, resolution, hydration, authority, plan, strands) | ✅ identical |
| conversational agrees with both | ✅ |
| non-comparative asks still reach the provider brain | ✅ unchanged |
| `discoveryBridge.ts` contains no critic parser/objective/relation | ✅ |
| route consults the gate BEFORE `runAiDiscovery` (index-compared) | ✅ |

**One contract, no duplication.** `parseCriticRequest` is not reimplemented
inside `runAiDiscovery`; there is no Anthropic-specific `CriticObjective` and no
provider-specific ranking semantics. Downstream candidate pools may legitimately
differ if the retrieval brain differs — the *meaning* of the request may not.

### RED → GREEN

`src/lib/critic/gc1.test.ts`, behavioural not module-absent: section 1 runs the
SHIPPED parsers and pins what they really do, so those assertions hold before
and after; everything downstream failed because nothing built an objective.

```
RED    2 failed | 27 passed (29)   ← both failures were the route wiring
GREEN  31 passed (31)              ← +2 added for the no-anchor fall-through
```

A parser bug the RED surfaced and fixed before wiring: `better` sat in the
`NOT_COMPARATIVE` guard list, so `"but better acted"` produced no unresolved
modifier. It is a genuine comparative; the relation cue never reaches that scan
because the modifier region starts after the last anchor.

### Relationship

Canonical enum only — `like` / `better_than` / `like_but` / `blend`. Natural
variants are recognised in `request.ts` and never leak downstream. `like_but` is
derived (`like` + grounded modifiers), not a separate cue; a comparative keeps
its own identity, so "better than X but funnier" stays `better_than`.
No title is special-cased — proved on `Heat`/`Sicario`/`Arrival`.

### Anchor identity

`searchTitles(name)[0]` is **gone from the route entirely**, including from
`referenceKeywordIds`, which now resolves through GC2 as well. That was not
merely a latent risk: "like Furious" was fetching **Furious 7's** keywords, so
the search was biased toward a film the user never named while the read-back
claimed we had kept the feel of the one they did.

Test 9 makes the decoys **first** in both candidate lists, so any code trusting
search order fails. Ambiguous → `authority: 0`, no guess, and the route falls
through rather than answering (test 31) — GC2's refusal is worth nothing if the
caller answers anyway.

### Modifiers

Grounded only where honest, and every target asserted against `DIMENSION_KEYS`
at module load so a renamed axis breaks the build. `funnier→humor↑`,
`less depressing→darkness↓`, `faster→pacing↑`, `less sentimental→emotion↓`, etc.
Deliberately ungrounded: "better acted", "prettier", "more original" — directional
but not *about* an axis. They surface as `unresolvedModifiers`, never bent onto
the nearest-looking axis.

### GC5 — now production wired

`runStrands` issues every strand through the **same `runFinder` with the same
base query**, so subject strictness, providers, runtime, years, exclusions and
media type are enforced on every strand. A strand may only ADD soft seeds; there
is no code path that removes a constraint. Strands run concurrently (wall-clock
≈ one strand; TMDB budget genuinely N×, capped at `MAX_STRANDS = 5` — tuning is
GC11). `FinderQuery.minVotes` was added, optional and additive, because the
ungated recall floor needs its own popularity bar.

### ACCLAIM STRAND — corrected semantics

`vote_average` is a crowd average and is **not** the definition of "better".
"Better for this user" is decided by the GC4 plan and final ranking. The strand
is an **additive recall heuristic only**: it can put a well-reviewed,
modest-audience title in front of the judge; it cannot make it the answer and
carries no ranking weight. Comments in `retrieval.ts` updated accordingly.

### Observability

`CriticAttribution` — relation, cue, requested anchors, GC2 status per anchor,
GC3 hydrated flags, authority, GC4 instructions with provenance, GC5 strand
labels, ranking-only axes, unresolved modifiers, candidate ids, per-strand
counts. Non-production responses only. Enums, ids, labels and numbers —
structured evidence, never a prompt or free-text reasoning (test 25).

### Baseline inertness

`parseCriticRequest` returns null for every non-comparative ask, and null means
the existing pipeline runs untouched. Pinned on "three wrestling movies",
"a boxing movie", "crime dramas on BritBox", "Gone on BritBox", bare titles, and
the `X but <ungroundable>` form.

### GC6 — STILL OPEN, and not quietly crossed

`strandRun.items` stay in the finder's own `matchScore` order. The plan is built,
carried and reported, and reorders nothing. `rankWithPreference` still has zero
production callers. `attribution.finalRankingConsumesPlan` is hard-coded `false`
and `productionWiring.test.ts` asserts that literal, so flipping it without
wiring GC6 fails the suite.

### Gates

| gate | exit | result |
|---|---|---|
| GC1 focused | 0 | 31 passed |
| GC2 / GC3 / GC4 / GC5 / GC8 + wiring | 0 | 117 passed (all critic files) |
| `npx vitest run` | 0 | 3327 passed, 24 skipped, **0 failed** |
| `npm run typecheck` | 0 | clean |
| `npm run lint` | 0 | no warnings or errors |
| `npm run build` | 0 | clean |
| `npx playwright test -c playwright.searchrouting.config.ts` | 0 | 21 passed |
| frozen corpus `layerBext` | 0 | P0 635/635 · P1 515/515 |

**Frozen corpus delta vs the pre-GC1 baseline captured on this branch: 0
PASS→FAIL, 0 FAIL→PASS.** Byte-identical, because `extractReference`,
`classifySearch` and `resolveSearchDestination` — the surfaces the corpus judges
— were not modified. `layerA` was not run: it measures the live deployment, not
this branch.

---

## GC5 — CONTRACT COMPLETE (red-then-green) · PRODUCTION WIRED BY GC1

### The production retrieval path, traced on THIS branch (not assumed from GC1)

Verified by reading the current files, because the GC1 audit is no longer
guaranteed exact:

```
POST /api/ask  (src/app/api/ask/route.ts)
  ├─ conversational branch  ~L352
  │    stateToQuery(s) -> FinderQuery
  │    subjects        -> resolveSubjectRequirementForTerms
  │                       q.subjectKeywordIds / subjectLexemes / subjectStrict   HARD
  │    referenceTitles -> referenceKeywordIds(names)            L45
  │                         searchTitles(name)[0]               L48   <-- no identity check
  │                         -> q.keywordIds  (union of anchors)  L385  SOFT
  │    similarTo       -> q.similarTo = names.join(' / ')        L402  READ-BACK COPY ONLY
  └─ discovery branch       ~L430
       parseAskWithAI / naiveParseQuery -> FinderQuery
       augmentInternational, deterministic year/genre overlay
       parseTopicTerms -> searchKeywords -> q.keywordIds merged  L524  SOFT
       applyRequiredSubject                                      L566  HARD

runFinder  (src/lib/finder.ts:277)
  discoverTitles(...)                                           L362
    keywordIds: q.subjectKeywordIds?.length ? q.subjectKeywordIds : q.keywordIds   L387
      ^^ WITH A SUBJECT PRESENT, THE ANCHOR UNION IS DROPPED ENTIRELY
  candidate map -> normalization -> scoring
  items.sort((a, b) => b.matchScore - a.matchScore)             L708
  relaxation ladder:
    subject present      -> NEVER relaxed, honest shortfall     L723
    isKeywordStarved()   -> retry with keywordIds: undefined    L736  (SOFT, relaxable)
    minMatch/onMyServices-> retry relaxed                       L756
```

`discoverTitlesChecked` (`src/lib/tmdb/client.ts:378`) is the honesty boundary.
`with_keywords` and `with_genres` are **OR** (`join('|')`); `without_*` are
AND-NOT. Mirrored into `TMDB_QUERYABLE` in `src/lib/critic/retrieval.ts`.

### What the anchors actually contribute today

A **union of TMDB keyword ids, and nothing else.** Identity, relation and plan
are all absent from retrieval. Two consequences, both confirmed in code:

- **Too strong.** `with_keywords` is the discovery *gate*. A title carrying none
  of the anchors' keywords cannot enter the pool at any rank. The right answer
  is removed before judgment, so a causal ranker (GC8/GC4) orders survivors of
  an arbitrary tag filter.
- **Too weak.** `better than X` and `like X` issue a byte-identical search.
  `q.similarTo` exists but is read-back copy, never a retrieval input.

### RED

`src/lib/critic/retrieval.test.ts`, 17 items, against `planToHints` written as a
faithful port of today's single keyword-union query:

```
Test Files  1 failed (1)
     Tests  8 failed | 9 passed (17)
```

The decisive one: `pool = ['anchor-alike']` — `the-answer` was not retrievable
at all, so tests 1, 2 and 5 failed on an empty or one-title pool.

### GREEN — same file, unedited

```
Test Files  1 passed (1)
     Tests  17 passed (17)
```

### One test corrected BEFORE the RED baseline (disclosed)

Test 17 originally asserted "with the same pool, relation alone changes the
order". **GC4 does not do that, by design.** Probed with the real `buildPlan`:
for a user with confident DNA, `like` and `better_than` return an *identical*
instruction set, because GC4 decided the target follows the USER. The test was
rewritten to assert what GC5 actually owns — relation changes the **pool** —
before the RED baseline was taken, and never touched afterwards. Weakening a
test after seeing GREEN fail would be the forbidden move; this was a
mis-specification caught against GC4's documented semantics.

### The contract — `src/lib/critic/retrieval.ts`

`CriticRetrievalHints = { strands, hard, rankingOnly, relation }`.

**Retrieval maximises recall; ranking supplies judgment.** A critic inference
widens the pool by adding a *strand* (an extra legitimate query, results
UNIONED) and may never narrow it.

| class | contents | may remove a title? |
|---|---|---|
| **HARD** | media type, year bounds, providers, explicit exclusions, named subject — facts of the sentence | **yes** — applied to every strand |
| **SOFT** | anchor keywords, anchor genres — critic *inferences* | **no** — seeds a strand, never gates one |
| **RANKING-ONLY** | every fingerprint axis | **no** — no search representation exists |

Strands emitted:

1. `recall-floor` — HARD constraints only, popularity-sorted. **Always present.
   This is the load-bearing property**: because a strand exists that no
   inference gates, a wrong keyword union can only fail to *add* a title, never
   remove one. Test 6 pins it.
2. `anchor-keywords` — today's only strand, demoted to one of several.
3. `anchor-genres` — a wider net than tags.
4. `acclaim` — `better_than` only.

### No fake filters

TMDB cannot query a single one of `DIMENSION_KEYS` — there is no
`with_darkness`, no `warmth.gte`. Every dimension instruction is therefore
classified `rankingOnly` and applied by `planNudge`, never converted into a
proxy filter ("high violence, so require Action"), which would be a fabricated
constraint wearing the authority of a real one. Tests 8–10.

### Relation reaches retrieval — legitimately

- `better_than` adds the `acclaim` strand. **This is not a proxy**: "better" is
  a quality claim and `vote_average.gte` is genuinely that claim. It *trades*
  the vote bar for a rating bar rather than stacking both, so it reaches the
  acclaimed-but-less-popular title a popularity sweep hides.
- `like` / `like_but` get no acclaim floor — resemblance is not a quality claim,
  and adding one would refuse the mediocre-but-similar title that was asked for.
- `blend` emits one strand **per seed** rather than a single OR union, so the
  better-tagged side cannot fill the cap and drop the other. Named per-*seed*,
  not per-*anchor*, because `ResolvedAnchor` carries no keywords and the ids
  arrive flattened — per-anchor grouping needs that shape to exist first.

### Starvation: measured, and structurally impossible

The brief asked whether using GC4 instructions as retrieval hints starves the
pool. **It cannot**, and not by tuning: dimension instructions are classified
`rankingOnly` and never become filters, so a richer plan adds zero constraints.
Test 14 asserts a rich plan retrieves ≥ an empty one. `MIN_RANK_CONF` was not
touched and test 15 pins it at `0.25`.

### GC5 blockers — PROVEN, not assumed (`src/lib/critic/productionWiring.test.ts`)

The brief required proving the dependency rather than faking a production path.
There were **two**, and the second was not previously known.

1. ~~**GC1 blocks it.**~~ **CLOSED BY GC1.** `/api/ask` now constructs the
   objective and issues the strands; `searchTitles(name)[0]` is gone from the
   route. The assertions were inverted rather than deleted, so they now guard
   the wiring against regressing. See the GC1 section above.
2. **`rankWithPreference` has ZERO production callers.** This is the bigger
   find. GC8 and GC4 proved causality against a function whose own docblock
   says it is "exposed as a pure helper so the before/after report reflects
   production behavior". `runFinder` sorts by `matchScore` and mentions neither
   `rankWithPreference` nor `criticPlan`; `rankByDna` (`src/lib/dna.ts`) calls
   `preferenceNudge` **directly**, reaching past it.

   **This changes GC6's scope.** GC6 was written as "wire the objective into
   the ranker". The ranker it would wire into is not the one production uses,
   so GC6 must first choose and change a real call site — `runFinder`'s
   `matchScore` sort or `rankByDna` — which is a larger change than GC6 was
   scoped for. Do not start GC6 assuming a one-line hookup.

The test file pins both, so it FAILS the day either blocker closes and tells the
next session the constraint is gone.

### Gates

| gate | exit | result |
|---|---|---|
| `npm run typecheck` | 0 | clean |
| `npm run lint` | 0 | no warnings or errors |
| `npx vitest run` | 0 | 3294 passed, 24 skipped, **0 failed** |
| `npm run build` | 0 | clean |
| `npx playwright test -c playwright.searchrouting.config.ts` | 0 | 21 passed |

Frozen search corpus (`layerA` / `layerBext`) **not run, and not required**:
`retrieval.ts` is a new pure module with zero callers (blocker 2 above proves
it), so no search surface changed. It becomes required the moment GC6 wires a
real call site.

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
