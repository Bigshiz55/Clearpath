# Recommendation P0 — integration owner audit record (2026-08-14)

Single write owner session. All shared branches frozen; verified unmoved across
the audit window (last sweep 12:38 UTC):

| surface   | branch                              | SHA       | state |
|-----------|-------------------------------------|-----------|-------|
| main      | main                                | `4c3649f` | integration target |
| PR #69    | claude/person-subject-collision     | `e5b44f2` | open, green, **live-proven** |
| PR #64    | claude/canonical-interpretation     | `0d71b1f` | open draft, wired, audited |
| PR #70    | claude/nl-request-canonical-route   | `e97d00d` | opened this session, CI 8/8 green |
| PR #68    | claude/person-role-execution        | `536073d` | FROZEN, audit only |
| proof     | claude/pr69-blackbox-proof          | `a268582` | disposable; = e5b44f2 + gate infra only |

## PR #69 live proof (black-box, exit 0, 9/9)

Run: actions/runs/31800847138 · deployment `clearpath-5t1xhv1cv-bigshiz56.vercel.app`
(env=preview, sha=a268582 = PR #69 head + gate infra; semantic modules
byte-identical to `e5b44f2`, delta = `.github/workflows/…`, `eval/preview/…`,
`src/app/api/preview-test-login/*` only).

- anecdote ask → `castIds [16483]`, subject surface EMPTY, 24 items (Rocky,
  Creed, First Blood, …) — retrieval no longer starved
- control `a Tom Hanks courtroom movie` → `castIds [31]`,
  `subjectCanonical "courtroom"`, kw `[33519]`, no `hanks` subject
- GAPs (not FAILs, per owner ruling): GotG Vol. 2/3 supporting credits
  unprovable from top billing; full-credits tier activates when
  `TMDB_API_KEY` is added to GitHub Actions secrets
- observed, not asserted: `requestedCount=null → returned 24` (legacy
  count-scoping defect, PR #64's scope, confirmed live)

## PR #64 audit highlights (head `0d71b1f`)

- WIRED into /api/ask; person/subject/count canonical-owned behind
  `canonicalOwnsLanguage`; ownership enforced by source-analysis tests
- Phase 3A REDs measured live in the interpreter at this head:
  - `Show me The Lego movie` → `people ["Lego"]`
  - `Show me The Lego Movie` → `subjects ["lego"]`
  - `Show me A Goofy Movie` → `subjects ["goofy"]`, count 1
  (suite green because assertions dodge these combinations; shadowed at the
  route by the earlier `askJudgeTitle` lookup, but the canonical receipt is wrong)
- Partial ownership: genres/media/date/runtime/providers still read from
  whole-utterance parsers (`parseAskWithAI`/`naiveParseQuery`) on the canonical
  path; `anthropic` serving mode bypasses the canonical layer entirely
- Black-box red = oracle gap (top-billed-only cast prover), per owner ruling
- Funnel "died at: semantically evaluated" = renderer bug: `finder.ts` returns
  `semanticEvaluatedCount 0` as a "not applicable" sentinel when no subject is
  required; the gate's first-zero heuristic reports it as a death stage

## Ask-route conflict resolution (trial-proven)

Files: `resolved-ask-route.ts.txt`, `resolved-ownership.test.ts.txt` (this dir).
Three hunks:
1. imports: union; keep PR #69's `resolvePerson`, drop `resolvePersonId`
2. person block: PR #64's canonical block verbatim; legacy `else if` arm uses
   PR #69's `resolvePerson` + `consumedEntities` recording
3. subject application: `if (text && !canonicalOwnsLanguage)` +
   `applyRequiredSubject(query, text, { consumedEntities })` — both guards live
4. `ownership.test.ts`: helper list renames `resolvePersonId` → `resolvePerson`
   (successor function, identical fence contract)

Trial merge (#69 ← #64 with this resolution): typecheck 0; 37 test files /
933 tests green including both PRs' suites.

## Decision & order (proposed, NOT executed — owner approval required)

Decision A+: merge #69 (fixes shared legacy + /api/finder); #64 rebases onto it
with the resolution above; neither supersedes the other (#64 never touches
/api/finder; #69 never fixes count scoping).

1. PR #70 (transport; zero overlap)
2. PR #69 (live-proven)
3. PR #64 rebased with the documented resolution — after fixing the 3A title
   ownership holes (range ownership, no title lists), the gate oracle
   (full credits) and the funnel renderer
4. PR #68 rebased last: keep role execution (constraint.ts, finder, tmdb);
   canonical path takes the role from `CanonicalIntent.people[].role`; the
   raw-text `requestedCreditRole` reader survives only on legacy paths
5. Phase 7 governed regression + Phase 8 exact-journey black-box on the
   integration preview before any merge

## Owner actions needed

- `gh secret set TMDB_API_KEY` (GitHub Actions) — activates the full-credits
  oracle tier; turns the GotG GAPs into proofs
- `curl -s https://watchverdict.com/api/version` — production SHA is
  unverifiable from the sandboxed session (proxy 403)
