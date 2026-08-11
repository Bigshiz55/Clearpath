/**
 * Guards against a production deploy building from the wrong branch — work
 * has landed on branches Vercel doesn't deploy from before, invisibly. Fails
 * the build loudly for a PRODUCTION build off an unexpected branch; only
 * warns for a preview (a feature-branch preview deploy is normal and
 * expected to differ). A local `next build` has no VERCEL_ENV at all, so it
 * is a no-op there.
 */
/* Verified against the live deployment on 2026-08-11: `/api/version` reports
   `branch: main`, `sha: 350d874`. The previous value —
   'claude/watch-verdict-app-wwbtbg' — was stale, and this guard would have
   FAILED every production build had it been reachable.
   It is not currently reachable: `vercel.json` builds with
   `npm run check:schema && next build`, which never invokes `check:branch`.
   So the guard is dormant, not passing. Wiring it into the build command is a
   deploy-behaviour change and is deliberately left to the owner rather than
   slipped in with a constant fix. */
const EXPECTED_PRODUCTION_BRANCH = 'main';

function main(): void {
  const vercelEnv = process.env.VERCEL_ENV || '';
  if (!vercelEnv) {
    // Local build, not running on Vercel — nothing to guard.
    return;
  }

  const branch = process.env.VERCEL_GIT_COMMIT_REF || '';
  if (!branch) {
    console.warn('[check-branch] VERCEL_GIT_COMMIT_REF is not set — skipping the branch check.');
    return;
  }

  if (branch === EXPECTED_PRODUCTION_BRANCH) {
    console.log(`[check-branch] OK — building from "${branch}", the expected production branch.`);
    return;
  }

  if (vercelEnv === 'production') {
    console.error(
      `[check-branch] FAILED — this is a PRODUCTION build from branch "${branch}", but production is ` +
        `expected to deploy from "${EXPECTED_PRODUCTION_BRANCH}". If this is intentional (e.g. the ` +
        `production branch changed), update EXPECTED_PRODUCTION_BRANCH in scripts/checkBranch.ts.`,
    );
    process.exit(1);
  }

  console.warn(
    `[check-branch] Preview build from "${branch}" (production deploys from "${EXPECTED_PRODUCTION_BRANCH}") ` +
      '— not failing, this is a preview.',
  );
}

main();

// Module scope, so this script's `main` does not collide with another
// script's in the shared type-check.
export {};
