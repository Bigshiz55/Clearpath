# WATCHVERDICT PERSONAL EXPERT — ARCHITECTURE ASSESSMENT

Pre-implementation assessment. **No code written.** Produced by inspecting the
repository at `origin/main` = `314623e` plus the unmerged canonical-interpreter
branch `claude/canonical-interpreter-certification` @ `043f117`.

---

## THE HEADLINE FINDING

WatchVerdict does not lack personalization machinery. **It has three
recommendation stacks, and the personalization lives in the two that Ask does
not use.**

### Stack A — Ask / Search · PRODUCTION · query-driven · **NO TASTE DNA**

```
/api/ask → interpret() → CanonicalIntent → resolveCanonicalExecution
        → runFinder → finderExplain.buildItemExplanation → cards
```

`rankByDna`, `preferenceNudge`, `getUserDnaForTitle` and the dimension profile
are **never imported by `src/app/api/ask/route.ts`** (verified by grep: zero
hits). Ask ranks by the deterministic engine plus query-constraint satisfaction
and nothing about the person asking.

### Stack B — Watch / Browse · PRODUCTION · **DNA-driven**

```
/app/watch → getRecommendations → rankByDna
             (objective → dnaScore → dimensionMatch → preferenceNudge → rerank)
```

This is the blend the brief describes, already built, already bounded, already
tested. `/browse?sort=foryou` uses the same path.

### Stack C — RecoLab · **SYNTHETIC, NOT PRODUCTION**

```
reco/{rank,diversify,explain,funnel} → synthCatalog → RecoLabClient
```

`src/lib/reco/rank.ts`, `diversify.ts`, `explain.ts` and `funnel.ts` all import
`SynthTitle` from `synthCatalog`. Their only UI consumer is `RecoLabClient.tsx`
via `actions/recoLab.ts`. Production `/app/watch` touches `reco/` only for
`deck` (constants), `store` (impressions) and `accuracy`/`experiments`
(telemetry).

**So the most advanced algorithms in the codebase run on fake titles.**

---

## PHASE-BY-PHASE: WHAT EXISTS, WHAT IS MISSING

| Phase | Verdict | Evidence |
|---|---|---|
| **1 · DNA → recommendations** | **Real gap, but the parts exist.** `rankByDna` already blends objective + taste + dimensions + preference nudge. `preference/explain.explainTitle` already returns `{reasons, concerns, confidence}` — literally the Positive/Negative/Confidence the brief specifies. **The bridge is wiring, not invention.** | `dna.ts:157`, `preference/explain.ts:64-76` |
| **2 · Explanation engine** | **FOUR explanation modules already exist.** A fifth would be the parallel system the brief forbids. | `finderExplain.ts` (rose/heldBack/requirements, on every Ask result), `preference/explain.ts` (reasons/concerns/confidence), `reco/explain.ts` (Evidence + `unsupportedClaimCount` — an anti-generic guard), `critic/explain.ts` (comparative) |
| **3 · Critic personalities** | **Genuinely new.** Nothing resembling it exists. | — |
| **4 · Conversation memory** | **Largely exists.** `interpret()` already separates `background` / `taste` / `request` clauses — the burrito sentence is a passing test. `showdown/evidence.ts` already separates `PermanentTraitEvidence` from `SessionContextEvidence` with a bounded `MAX_SESSION_LEAN`. | `interpret/wiring.test.ts`, `showdown/evidence.ts:49-114` |
| **5 · Diversity** | **Exists, and is BETTER than the brief.** `reco/diversify.ts` implements MMR + per-franchise/director/performer/sequel caps + a **relevance floor** so variety never displaces a clearly better title. Lab-only. | `reco/diversify.ts:1-40` |
| **6 · "Why not"** | **Genuinely new**, but the raw materials exist: `diversify` computes `RemovalReason`, `explainTitle` computes `concerns`. | — |
| **7 · Verdict Room** | **Foundation exists** (`RoomShell`, `CourtRoom`, stage rail, panels). Brief asks only for architecture prep. | `components/court/` |
| **8 · Subscription intelligence** | **ALREADY SHIPPED.** `src/lib/subscriptionValue.ts` + `/app/subscriptions` render a per-service `verdict` with real cost figures. | `app/app/subscriptions/page.tsx` |

---

## ARCHITECTURAL RECOMMENDATIONS

### R1 — Do not build a fifth explanation module. Define one contract.

The four existing modules answer different questions and all deserve to live:
constraint satisfaction (finderExplain), taste fit (preference/explain),
comparison (critic/explain), evidence discipline (reco/explain). What is
missing is a single **`RecommendationEvidence`** contract they all emit into,
with the Phase 1 shape (`positive[]`, `negative[]`, `confidence`) and the
`supported` flag that `reco/explain` already pioneered.

### R2 — Promote the lab, do not rewrite it.

`reco/diversify.ts` and `reco/explain.ts` are coupled to `SynthTitle` only
through their type signatures. Making them generic over a minimal title
interface (`{id, franchiseId?, directorId?, leadId?, vector?}`) lets the SAME
tested algorithm serve real titles. This is the single highest-leverage change
in the whole plan and it deletes a parallel system rather than adding one.

### R3 — Phase 5 keeps MMR + caps. **DECIDED (owner).**

The brief proposed `-100 / -40 / -20 / -10`. The shipped lab uses MMR + caps +
a relevance floor, which is strictly better: flat penalties cannot distinguish
"similar" from "identical", and a −100 is a hard exclusion with no floor
protecting quality.

**Owner decision: keep the existing MMR + caps architecture. Add persistent
recommendation memory / impression tracking so diversity considers what the
user has ALREADY BEEN SHOWN, not just the current candidate list.** Diversity
must stay context-aware — avoid repeats, encourage exploration, respect
explicit user requests, preserve high-confidence matches. The target is human
recommendation behaviour: stop re-serving the same obvious titles, while still
returning the right film when it is specifically asked for.

`reco/store.recordImpressions` already writes the impression log this needs.

### R4 — Phase 1's ordering is right; Phases 2/5/8 are mostly consolidation.

Sequenced by real remaining work:
1. **Phase 1** (bridge DNA into Ask) — highest value, real gap.
2. **Phase 6** (why-not) — new, small, high trust value.
3. **Phase 3** (personalities) — new, presentation-only, low risk.
4. **Phase 5** (diversity promotion) — mostly R2.
5. **Phase 2** (explanation contract) — mostly R1.
6. **Phase 4** (conversation) — mostly wiring what exists.
7. **Phase 8** — extend the shipped page with per-title worth/avoid lists.
8. **Phase 7** — foundation only, as the brief says.

### R5 — Guard the ranking/explanation boundary with a test, not a convention.

Phase 3's "personality never changes ranking" is exactly the kind of rule that
erodes. It should be enforced the way the certification mutants are: assert the
ranked ID order is byte-identical across all four personalities.

---

## RISKS

1. **`MIN_RANK_CONF = 0.25` is a floor that must not move.** Prior sessions
   established it as a governed threshold. Phase 1 must not lower it to make
   personalization "appear" to work.
2. **No paid AI in bulk paths.** CLAUDE.md forbids per-title LLM calls in
   listing paths; `getTitleVector` embeds and costs money. Phase 1 must consume
   cached vectors only, or degrade honestly — the same constraint that shaped
   the canonical scoring contract.
3. **Ask currently has no per-user caching story.** Adding DNA to Ask adds a
   per-request profile read; `dna.ts` already has `profileMemo` (60s TTL) to
   copy.
4. **The frozen search corpus governs Ask.** Any change to Ask ranking must
   report the delta against baseline `68a5a93` and must not touch the corpus.
5. **Explanations must not become claims.** `reco/explain.unsupportedClaimCount`
   exists precisely to stop this; it must be applied to production output, not
   left in the lab.

---

## BRANCH POINT — **DECIDED (owner)**

The canonical interpreter is foundational architecture, not a feature
dependency, and Phase 1 must not stack on an unmerged branch — that creates
dependency chains and makes regression analysis harder.

Sequence:
1. Merge `043f117` into `main` (PR #77).
2. Verify the production deployment matches the merged SHA.
3. Cut a clean Phase 1 branch from updated `main`.
4. Build personalization on top of the canonical recommendation pipeline.

**The canonical interpreter remains the single semantic owner.**

## NEXT ACTION

Phase 1 — bridge Taste DNA into the Ask path, against the contract above.
