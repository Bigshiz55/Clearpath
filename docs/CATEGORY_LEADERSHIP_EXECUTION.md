# WATCHVERD1CT — Category Leadership Execution

> Official brand: **WATCHVERD1CT** · Official tagline: **THOUSANDS OF TITLES. ONE VERD1CT.**
> Living checkpoint for the category-leadership mission. Everything below is
> **code-verified** (file paths cited), not remembered.

_Last updated: 2026-07-25 · baseline commit `48ac980` on `claude/watch-verdict-app-wwbtbg`_

## 1. Current WORKING features (code-verified)
- **Natural-language search pipeline**: `src/app/api/ask/route.ts` → search-mode
  classifier (`src/lib/nlu/searchMode.ts`), query planner (`nlu/queryPlan.ts`),
  media/source ontologies (`nlu/mediaOntology.ts`), hard-constraint validator
  (`nlu/constraintValidator.ts`), result guard (`nlu/resultGuard.ts`), final
  media-type guard in the route. 517 unit tests green.
- **Deterministic scoring engine** (`src/lib/scoring/`, pure, 7 spec scenarios) +
  AI adjust (±15, fail-open) + DNA fingerprint (±8, cache-only) outside it.
- **Refinement state** (`src/lib/refineState.ts`): layered constraints,
  deterministic canonical query key, staleness banner + Update results CTA,
  latest-request-wins in FinderUI and ReleaseWall.
- **FOR / PASS / SAVE** on every card (order + size + containment
  Playwright-verified in `tests/mobile/controls.spec.ts`).
- **Watch DNA**: three-DNA model, confidence, calibration quiz, packs, founder
  test environments (`src/lib/preference/*`, `src/lib/founder/*`).
- **On TV**: schedule contracts + mock/prod adapters, Worth Joining Late rules
  engine, time-window utils (`src/lib/tv/*` per prior phase), sports filtered.
- **New Releases wall** with truthful diagnostic empty states
  (`src/lib/releasesDiagnostics.ts`).
- **Availability honesty**: audio-availability adapter with 6 states; TMDB
  "not listed" is *unverified*, never "confirmed absent" (`src/lib/askJudge.ts`).
- **Household seeds**: single-watcher match scoring (`finder.ts` Watcher),
  Take-to-Court group flow, **NEW** floor-weighted `householdVerdict` engine.
- **Explanations**: **NEW** `verdictExplain.ts` (rose / held back / requirements
  / availability / explained confidence).
- **Brand**: `WatchVerdictWordmark` renders WATCHVERD1CT with the signature 1;
  `Tagline` renders the official tagline; metadata + PWA manifest updated.
- Auth (Supabase, `getUser()`), RLS everywhere, share via SECURITY DEFINER RPC,
  build badge on every screen, overflow guard (140 checks), interaction
  manifest with CI coverage gate (`src/lib/qa/interactionManifest.ts`).

## 2. Current BROKEN / at-risk (honest)
- None known-broken offline. **Unverifiable here**: live TMDB data quality,
  real Safari/WebKit rendering, authenticated `/app/*` E2E (no keys/WebKit in
  sandbox — external blockers, not code defects).

## 3. PARTIAL features
- Household intelligence: engine is pure + tested; **not yet wired into result
  cards/UI** (next wiring step: surface `householdVerdict` in Finder results
  when watchers are selected).
- Verd1ct Jury: critics-panel (`swarm.ts`) is deterministic-transparent, but a
  real similar-taste community layer needs live user data (external).
- Live TV: rules + adapters exist; a real EPG schedule source is not
  contracted (mission rule: no fabricated listings — honest states shipped).
- Imports (IMDb/Letterboxd/Trakt/CSV): **not implemented** — largest missing
  competitive feature (see matrix).
- Context DNA: context detection exists in parsing; per-context preference
  learning is not yet persisted.

## 4. Regression risks & protections
- Backup branch + tag at `4461bba`; no force-push; every prior defect has a
  permanent test (62+ test files, 517+ unit tests, 243 Playwright checks).

## 5. Execution order status
| # | Phase | Status |
|---|---|---|
| 1-2 | Protection, baseline, audit | ✅ this doc |
| 3-8 | Broken criticals, search correctness, constraints, refinement, availability, responsive | ✅ prior missions (evidence in `FINAL_RELEASE_EXECUTION.md`) |
| 9 | Core DNA architecture | ✅ existing (three-DNA + confidence) |
| 10 | Context DNA | ◐ parsing-level only |
| 11 | Household intelligence | ◐ engine done (`householdVerdict.ts`, 8 tests) — UI wiring next |
| 12 | Explanation system | ◐ engine done (`verdictExplain.ts`, 3 tests) — UI wiring next |
| 13 | Live-TV intelligence | ◐ rules done, EPG source external |
| 14 | Onboarding | ✅ value-before-signup (home ask works pre-account) |
| 15 | History & imports | ✗ not started (biggest gap) |
| 16 | Verd1ct Jury | ◐ deterministic panel only |
| 17-23 | Enhancements → release evidence | ongoing |

## 6. Next actions
1. Wire `householdVerdict` + `explainVerdict` into the Finder result cards and
   title page ("Why this Verd1ct?" sheet).
2. Context-DNA persistence (per-context preference deltas keyed by
   weeknight/weekend/solo/couple).
3. Import pipeline (CSV first — no external API needed; Letterboxd/Trakt need
   API terms review).
4. EPG data-source contract for real live-TV.

## 7. External blockers
- Live keys (TMDB/OpenAI/Supabase) absent in sandbox; WebKit absent; EPG
  schedule source and import-API agreements are business decisions.
