---
name: release-governance
description: >-
  The non-negotiable release + repository governance for WatchVerdict — gates,
  frozen search corpus rules, migration authorization, branch/deploy discipline,
  and honest reporting. Use before integrating any change, running gates,
  registering a migration, or claiming something is done/green.
---

# release-governance — how work ships here

## Golden rules (do not violate)
1. **Run the real gates, report real exit codes.**
   `npm run typecheck && npm run lint && npx vitest run && npm run build`, plus
   `npx playwright test -c playwright.searchrouting.config.ts`. Never claim green
   when output went through `| tail`/`| grep` that masked the exit code — check
   the command's true status (`scripts/gates.sh` exists for this reason).
2. **Never edit the frozen corpus, oracle, or seed to make a regression pass.**
   The corpus is evidence, not code (`docs/SEARCH-BASELINE-GOVERNANCE.md`).
   Baseline SHA `68a5a93`, tag `watchverdict-search-baseline-2026-08-06`. Compare
   search changes against it and report PASS→FAIL / FAIL→PASS deltas.
3. **Migrations: create + register, never auto-apply.** Write
   `supabase/migrations/NNNN_name.sql` (idempotent), register it in
   `src/lib/pendingMigrations.ts` (base64) or exclude it in
   `src/lib/excludedMigrations.ts` with a reason — `check:migrations` fails the
   build otherwise. Declare every table the code touches in
   `src/lib/schemaContract.ts` (`check:schema`). APPLYING is an owner action via
   `npm run migrate` or the gated `POST /api/admin/migrate`. Never run `0001`
   against real data. Never re-arm withdrawn `0042`.
4. **Branch/deploy.** Develop on `claude/watch-verdict-app-wwbtbg` (production
   deploys from it). Never force-push `main`. Do not open a PR unless asked.
5. **Honest reporting.** If tests fail, say so with output. If a step was
   skipped, say that. Never call the assignment complete if release evidence
   does not justify it — pick the accurate status
   (COMPLETE / OFFLINE-VERIFIED / PARTIAL / BLOCKED).

## Step 1 — Pre-integration checklist
typecheck ✓ · lint ✓ · vitest ✓ · build ✓ · searchrouting ✓ · (search change →
frozen corpus + baseline delta) · no secret leakage.

## Step 2 — Secrets
`TMDB_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` are server-only,
never `NEXT_PUBLIC_`, never imported into a client component. Env is validated at
runtime, not import/build time — keep it that way so `next build` works without
secrets.

## Notes
- Update `BACKLOG.md` at the end of a work order (Now/Next/Blocked/Done).
- Owner actions must be isolated to the exact command the owner runs — never ask
  for credentials, and do anything Claude can do itself.
