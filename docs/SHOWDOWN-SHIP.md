# SHOWDOWN — SHIP LEDGER

Authoritative continuation state for the flagship Showdown rebuild. A new
session starts by reading this file and executing **NEXT ACTION**. Do not
re-audit completed gates; do not restate accepted work.

CURRENT SHA: (see git log — updated each commit)
CURRENT PREVIEW: https://clearpath-git-claude-showdown-flagship-bigshiz56.vercel.app (Vercel SSO-gated)
NEXT ACTION: implement the C fix. Add the comparative signal
`dims[axis] = 50 + (winner - loser)/2` over separating axes only to
`src/lib/taste/crossing.ts`, emitted alongside the existing absolute winner
event, with weight capped BELOW an explicit absolute rating. Then: (1) assert a
mature absolute profile is not overpowered by comparative events, (2) re-run
`divergence.test.ts`, (3) un-skip the order-swap test and delete the `it.todo`,
(4) if light still fails, address B by widening low-darkness representation in
the diagnostic pool via the coverage mechanism — never by hand-picking
convenient light titles. Do NOT change MIN_RANK_CONF (0.25).
---

## SHOWDOWN SHIP GATES

- [x] **G1** A9 permanent-vs-session evidence proof — COMPLETE
- [x] **G2** A4 / A6 / Rapid Fire evidence-integrity proof — COMPLETE
- [ ] **G3** two-profile downstream ranking divergence
- [ ] **G4** deterministic real-state-machine A7 discovery render
- [ ] **G5** complete desktop E2E
- [ ] **G6** complete mobile E2E
- [ ] **G7** real-poster + real-results visual QA on exact Vercel SHA
- [ ] **G8** full gates + clean diff + merge recommendation

---

### G1 — A9 permanent vs session
- **Status:** COMPLETE (10/10 green)
- **Proof:** `src/lib/showdown/persistence.test.ts` — runs the production chain
  `session -> sessionToEvents -> PreferenceEvent[] -> deriveDna -> preferenceNudge`.
  Nothing mocked; `MIN_RANK_CONF` untouched.
  - one contradictory session does not invert a mature preference's ranking sign
  - repeated consistent sessions raise the ranking signal
  - more evidence never reduces what is known
  - a `tonight` run emits `[]` permanent events (structural, not conditional)
  - a tonight run leaves the permanent profile byte-identical
  - a rapid TIMEOUT adds no event at the persistence layer either
  - independent sessions/users produce independent state; a fresh session is empty
- **Files:** `src/lib/showdown/persistence.test.ts` (new)
- **Finding worth keeping:** `canonicalTitleId()` / `mediaTypeFor()` take the
  CATALOGUE ID STRING, not the title object. Passing the object yields
  `titleId: null` on every event — a whole session contributing nothing to the
  engine, silently and with no error. Cost ~2 debug cycles here; would be
  invisible in production.
- **Failures:** none

### G2 — mechanic evidence integrity
- **Status:** COMPLETE (17/17 green)
- **Proof:** `src/lib/showdown/mechanicIntegrity.test.ts` — drives the real state
  machine and diffs profiles before/after.
  - A4 moves EXACTLY one axis (`movedAxes()` returns `['horrorTolerance']`), a
    low answer moves it down, and 40 units of accumulated evidence are not
    erased by one tap (weight capped)
  - A6 YES persists the named reason; GUT is recorded as a real answer distinct
    from ABSENT and leaves the profile byte-identical; SKIP converts no
    uncertainty into certainty but still spends the interruption budget
  - Rapid ANSWER is ordinary evidence; TIMEOUT changes nothing, adds no
    decision, does not touch `unseenTitles`, and does not appear in
    `calibrationObservations` (so it cannot steer the planner either)
  - clock never on opening rounds, never on the final two, burst contiguous and
    a minority of the run, and the timer stops for an untimed follow-up
- **Files:** `src/lib/showdown/mechanicIntegrity.test.ts` (new)
- **Failures:** none

### G3 — downstream ranking divergence
- **Status:** IN PROGRESS — DIAGNOSIS COMPLETE, fix not yet implemented
- **Verdict: HYPOTHESIS C (root cause) COMPOUNDED BY HYPOTHESIS B. A is FALSE.**

**A — neutral polarity: FALSE.** Both users have `polarity: 1`. The light user
is not being skipped for neutrality; it is being skipped for CONFIDENCE.

| | pref | evidence | confidence | polarity | tier |
|---|---|---|---|---|---|
| DARK  `effectiveTaste.darkness`  | 89.28 | 2.128 | **0.183** | 1 | weak |
| LIGHT `effectiveTaste.darkness`  | 56.67 | 0.756 | **0.012** | 1 | learning |

`experience.darkness` and `discovery.darkness` are `{pref:50, evidence:0}` for
BOTH users — all Showdown signal lands in the **attraction** channel
(DARK 89.28/3.04, LIGHT 56.67/1.08). `MIN_RANK_CONF` is 0.25, so light at 0.012
is nowhere near it.

**C — COMPARATIVE INFORMATION IS DISCARDED. This is the root cause.**
Measured: 20 decisions produce exactly **20 events**, all action
`unseen_interested`, one per decision, on the WINNER only, carrying the winner's
**absolute** fingerprint. The loser emits nothing (correct — no fabricated
dislike) but the comparison itself is not recorded anywhere.

Worked example from the real dump:
`Titanic(50) vs The Silence of the Lambs(95) -> Titanic(50)`
A strong statement of preferring less darkness is recorded as *"positive
attraction to a title whose darkness is 50"* — a NEUTRAL absolute. Seventeen
such events average to 56.67 → confidence 0.012 → invisible to the ranker.
Opposite comparative behaviour cannot produce opposite canonical DNA.

**B — CATALOGUE SKEW. Real, and it compounds C.** Full 113-title darkness
distribution: min 10, max 100, mean 57.79, median 50, q1 50, q3 50 —
`<35: 5` · `<50: 5` · `50–64: 82` · `>=65: 26` · `>80: 24`.
**26 dark titles vs 5 light ones — a 5.2x skew**, with 82 titles asserting no
darkness at all. Chosen-title darkness: LIGHT mean 49.5 (17 of 20 exactly 50,
only 2 below 50); DARK mean 65.75 (8 of 20 at >=65). A light-preferring player
can rarely even be OFFERED a low-darkness title to like.

**FIX DESIGNED (not yet built).** Add a bounded comparative signal to the
canonical engine — not Showdown-only state:

    dims[axis] = 50 + (winner[axis] - loser[axis]) / 2   // separating axes only

  - Titanic(50) over Silence(95) -> 27.5 ("leans lighter") ✅
  - Silence(95) over Titanic(50) -> 72.5 ("leans darker") ✅
  - 50 vs 50 -> 50, contributes nothing ✅

Satisfies every stated requirement: bounded; only touches axes the pair
meaningfully separated; preserves actual separation magnitude; asserts nothing
about the loser; append-only and re-derivable; belongs in
`src/lib/taste/crossing.ts` (already the axis-level crossing module) so the
canonical engine owns it. Must carry LOWER authority than an explicit absolute
rating — cap its weight below the absolute-rating weight and assert that a
mature absolute profile is not overpowered by comparative events.

**Files:** `src/lib/showdown/divergence.test.ts` (5 passed, 1 skipped, 1 todo)
- **Failures:** order-swap still skipped, by design, until C is fixed.

### G4 — render a real discovery
- **Status:** not started
- **Proof:** —
- **Note:** A7 has never been visually observed. Two full QA play-throughs
  produced zero discoveries, which is consistent with "rare" but is not
  verification. Seed legitimate decision history that satisfies the REAL
  trigger; do not lower the threshold and do not mount `DiscoveryCard` directly.

### G5 — desktop E2E
- **Status:** not started

### G6 — mobile E2E
- **Status:** not started

### G7 — real posters / real results
- **Status:** BLOCKED (recorded, not deferred silently)
- **Blocker:** the local QA harness reports `poster coverage: 0/113` — poster
  paths resolve through `/api/showdown/catalogue`, which needs a TMDB key the
  container does not have. The Vercel preview for the exact SHA is behind
  Vercel Authentication: `GET /api/version` on the preview host returns
  `302 -> vercel.com/sso-api`, so this agent cannot reach it.
  **Resolution requires either** a preview with Deployment Protection disabled,
  or a `VERCEL_AUTOMATION_BYPASS_SECRET`, or the owner performing the visual
  check. Synthetic poster fixtures are explicitly NOT an acceptable substitute.
- **Allowed to remain the last unresolved gate.**

### G8 — ship gate
- **Status:** not started

---

## Standing constraints

- Do not weaken a production threshold to make a gate pass.
- Do not mock the thing under proof.
- Rendered QA must rebuild first — `npm start` serves the last `npm run build`,
  and a stale bundle already produced one round of misleading screenshots.
- Local QA drives `/dev/dna-showdown` (the real component, no auth); `/app/*`
  is gated by middleware and redirects.
