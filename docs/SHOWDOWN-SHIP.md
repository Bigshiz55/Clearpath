# SHOWDOWN — SHIP LEDGER

Authoritative continuation state for the flagship Showdown rebuild. A new
session starts by reading this file and executing **NEXT ACTION**. Do not
re-audit completed gates; do not restate accepted work.

CURRENT SHA: 5145a5b
CURRENT PREVIEW: https://clearpath-git-claude-showdown-flagship-bigshiz56.vercel.app (Vercel SSO-gated)
NEXT ACTION: G2 — consolidate mechanic evidence integrity (A4 named-axis-only + bounded weight; A6 YES/NO/GUT attribution; Rapid answer vs timeout) into one production-path proof.

---

## SHOWDOWN SHIP GATES

- [x] **G1** A9 permanent-vs-session evidence proof — COMPLETE
- [ ] **G2** A4 / A6 / Rapid Fire evidence-integrity proof
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
- **Status:** not started
- **Proof:** partial coverage already exists (`timeout.test.ts` proves rapid
  timeout folds no evidence and never borrows the recognition signal;
  `calibration.test.ts` proves the 1-10 weight cap and single-axis targeting;
  `arc.test.ts` proves the burst never lands on opening or final-two rounds).
  Gate requires these consolidated and the A6 YES / NO / GUT paths pinned.
- **Files:** —
- **Failures:** —

### G3 — downstream ranking divergence
- **Status:** not started
- **Proof:** —
- **Files:** —
- **Failures:** —
- **Constraint:** no ranking mocks, no injected scores, `MIN_RANK_CONF` must not
  be lowered. Supply legitimate repeated sessions until the real threshold is
  cleared.

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
