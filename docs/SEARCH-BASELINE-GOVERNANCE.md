# WatchVerd1ct Known-Good Search Baseline — governance record

## The baseline

- **SHA:** `68a5a9359a034e7a5224c8b8474dd88d491268bf`
- **Date:** 2026-08-06
- **Production:** https://clearpath-pearl-chi.vercel.app (verified serving this SHA via `/api/version`)
- **Tag:** `watchverdict-search-baseline-2026-08-06` (annotated; the annotation carries the full release notes)

### Verified gates at this baseline

| Gate | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | clean |
| ESLint (`next lint`) | clean |
| Production build (`next build`) | clean |
| Unit tests (`npx vitest run`) | 2,667 passed, 23 skipped |
| Extended deterministic corpus (1,200 cases, `scripts/searchAudit/layerBext.ts`) | P0 635/635, P1 515/515 — 100% |
| Frozen 1,000-query live corpus (`scripts/searchAudit/layerA.ts`, seed `WATCHVERDICT_FORENSIC_SEARCH_20260805`) | 828/900 judged = 92.0%, 0 transport errors |
| Authenticated 11-query semantic harness (`scripts/searchAudit/authJudge.ts`) | 11/11 |

### Known external limitations (not product defects)

- **TMDB catalog naming** — 5 frozen-corpus P0s (Poirot, Dateline NBC, Murder She Baked ×2,
  Hannah Swensen, Aurora Teagarden): the correct entity IS returned first; the oracle's
  string equality cannot match TMDB's official titles.
- **TMDB search depth** — bare "Go" is buried by TMDB's own multi-search ranking
  ("Go 1999" resolves correctly via the year-scoped search).
- **TMDB keyword tagging is sparse** — subject asks honestly label shortfalls
  ("Only 7 titles are tagged with that exact subject…").
- **TMDB ordering drift** — ~2 P1 results flap between identical runs.

### Regression policy

**No search modification merges without running the frozen regression corpus**
(`AUDIT_PASS=1 npx tsx scripts/searchAudit/layerA.ts` against production, or the offline
layers during development) **and comparing against baseline SHA `68a5a93`.** The frozen
corpus, its oracle, and its seed are never edited to make a regression pass.

## Required merge checks (real names)

The `CI` workflow (`.github/workflows/ci.yml`) provides the gate checks. The exact
status-check contexts to require on `main`:

- `CI / typecheck`
- `CI / lint`
- `CI / unit-tests`
- `CI / build`
- `CI / browser-routing`

Deliberately **not** blanket-required:

- `WatchVerdict Voice-Search Eval / eval` — path-filtered to search surfaces; a required
  check that doesn't trigger reports "expected" forever and would block every unrelated
  PR. Leave it required-on-paths as GitHub now supports, or advisory.
- Schema/migration checks — `Apply database migrations` is `workflow_dispatch`-only **by
  design** (migrations are applied deliberately, never as a side effect of a merge);
  schema-honesty assertions live inside the unit-test suite, which IS required.

## Main-branch ruleset (owner applies — see "Owner console steps")

Ruleset `protect-main`, target `main`, enforcement **active**:

- Restrict deletions ✓
- Block force pushes ✓
- Require a pull request before merging — **0 required approvals** (solo-owner workflow;
  the gate is the checks, not a second human), dismiss stale approvals off
- Require status checks to pass — the five `CI / *` contexts above, **strict**
  ("require branches to be up to date before merging") ✓
- Require conversation resolution before merging ✓
- Bypass list: **repository admin (owner) only** — the documented emergency bypass.
  Everyday work goes through PRs + checks; the bypass exists so the owner can never be
  locked out, and every bypass is recorded in the audit log.

This blocks ordinary automated sessions (which authenticate as non-admin apps/actors)
from writing to `main` directly, while the owner retains full control.

### Owner console steps (~3 minutes, one pass)

1. **Tag + release** — GitHub → Releases → "Draft a new release" →
   Tag: `watchverdict-search-baseline-2026-08-06` → "Create new tag on publish",
   Target: `68a5a9359a034e7a5224c8b8474dd88d491268bf` →
   Title: `WatchVerd1ct Known-Good Search Baseline — August 6, 2026` →
   paste the "Verified gates / Known external limitations / Regression policy" sections
   above as the notes → Publish.
   (The session's git proxy rejects `refs/tags` pushes and the GitHub MCP toolset has no
   release/tag-creation endpoint, so this cannot be done from an automated session.)
2. **Ruleset** — Settings → Rules → Rulesets → New branch ruleset → configure exactly as
   listed above. (No branch-protection/ruleset endpoint exists in the session toolset.)
3. **Supabase test user** — Auth → Users → `bigshiz55@gmail.com` → Delete user. Its
   password has already been rotated to a random value and all sessions/refresh tokens
   revoked from the session, so the exposed credential is already dead; deletion is the
   final cleanup. (No service-role key is available to sessions, by design — do not hand
   one out for this.)
