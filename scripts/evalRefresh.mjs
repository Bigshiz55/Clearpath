#!/usr/bin/env node
/**
 * `npm run eval:refresh` — the ONE way tracked evaluation evidence is
 * regenerated.
 *
 *     verify the repository is clean  →  set EVAL_WRITE=1  →  vitest run eval/
 *
 * WHY THE CHECK IS HERE AND NOT IN `writeEvaluationArtifact()`. The moment the
 * first artifact is intentionally written, the tree IS dirty. A per-writer
 * cleanliness check would therefore pass for the first suite and refuse every
 * one after it, leaving the evidence half-regenerated — a worse state than
 * either extreme. The question "is this source fit to stamp a SHA onto?" is
 * asked exactly once, before any generation starts.
 *
 * NO AUTOMATIC CLEANUP. It does not stash, does not restore, does not derive a
 * synthetic SHA from the diff. It reports what is in the way and stops.
 *
 * `--check-only` runs the preflight and exits without generating anything —
 * useful on its own ("is my tree ready?") and what makes the allowed path
 * testable without running the full suite.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { isCleanTree, refusalMessage } from '../eval/runner/preflight.mjs';

const checkOnly = process.argv.includes('--check-only');

let porcelain;
try {
  porcelain = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
} catch {
  // Not a git checkout at all: there is no commit to stamp, so there is
  // nothing honest to write.
  console.error('Refusing to refresh evaluation evidence outside a git checkout — there is no commit to attribute it to.');
  process.exit(1);
}

if (!isCleanTree(porcelain)) {
  console.error(refusalMessage(porcelain));
  process.exit(1);
}

if (checkOnly) {
  console.log('Working tree is clean — safe to refresh evaluation evidence.');
  process.exit(0);
}

const result = spawnSync('npx', ['vitest', 'run', 'eval/'], {
  stdio: 'inherit',
  env: { ...process.env, EVAL_WRITE: '1' },
});
process.exit(result.status ?? 1);
