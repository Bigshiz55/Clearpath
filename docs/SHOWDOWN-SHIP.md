# SHOWDOWN — SHIP LEDGER

Authoritative continuation state for the flagship Showdown rebuild. A new
session starts by reading this file and executing **NEXT ACTION**. Do not
re-audit completed gates; do not restate accepted work.

CURRENT SHA: (see git log — updated each commit)
CURRENT PREVIEW: https://clearpath-git-claude-showdown-flagship-bigshiz56.vercel.app (Vercel SSO-gated)
NEXT ACTION: finish G3. Dump all three `deriveDna` channels (experience / attraction / discovery) for the dark and light users in `divergence.test.ts` and identify why the light profile nudges 0 — hypotheses (a) polarity===0 and (b) dark-skewed catalogue are written up under G3 below. Then either un-skip the order-swap test or, if (b) holds, record it as a catalogue-balance product finding and re-scope G3's order-swap requirement with the owner.

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
- **Status:** IN PROGRESS — divergence PROVED, order-swap NOT yet proved
- **Proof so far:** `src/lib/showdown/divergence.test.ts` (5 passed, 1 skipped,
  1 todo). Both users start from identical (empty) permanent DNA, play the same
  planner with a legitimate strategy (prefer the darker / lighter title of each
  pair, never "always left"), and are ranked over the same candidates by the
  real `preferenceNudge`. `MIN_RANK_CONF` is imported and pinned at 0.25.
  - PROVED: the same candidate scores differently for the two users
    (bleak thriller: dark **+6.23**, light **0**), and the causal trait is
    `darkness` — the dark profile prefers bleak over sunny (+6.23 vs -5.81).
  - PROVED: an empty profile nudges 0 (control).
- **THE BLOCKER, measured:** the LIGHT-preferring profile yields
  `preferenceNudge` of exactly **0** on both candidates. Scaled legitimate play
  to 4 / 8 / 16 / 30 sessions: dark scales +4.63 -> +6.23 -> +6.97 -> +7.07,
  light stays **0 at every level**. So this is STRUCTURAL, not a threshold more
  play would clear, and lowering `MIN_RANK_CONF` is both forbidden and the
  wrong fix.
- **NEXT DIAGNOSTIC STEP (do this first):** find which channel actually carries
  the signal. `deriveDna` returns experience/attraction/discovery channels; a
  probe of `experience.dims.darkness` showed `{pref:50, evidence:0}` for BOTH
  users even though dark ranks +6.23, so the darkness belief lives in another
  channel and the probe read the wrong one. Dump all three channels for both
  users and compare. Two live hypotheses:
  (a) the light user's belief lands near neutral so `polarity === 0` and
      `preferenceNudge` skips it at `rank.ts:104/124`;
  (b) the 113-title diagnostic catalogue is skewed dark, so "the lighter of the
      pair" is still above 50 darkness and a light-preferring player cannot
      develop a rankable light preference — which would be a real PRODUCT
      finding about catalogue balance, not a test problem.
- **Files:** `src/lib/showdown/divergence.test.ts` (new)

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
