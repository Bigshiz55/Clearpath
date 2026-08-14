import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * A NORMAL TEST RUN IS READ-ONLY.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * THE DEFECT. Five suites under `eval/` wrote `report.md` and `summary.json`
 * into `evaluation-results/` unconditionally, stamping each with
 * `git rev-parse --short HEAD` and `--abbrev-ref HEAD`. Those suites are part
 * of the default vitest include, so `npx vitest run` — an ordinary gate that
 * asserts nothing about the filesystem — rewrote eight TRACKED files on every
 * invocation.
 *
 * The scores never moved. Only the provenance did. The consequences were all
 * cost and no information:
 *   • every branch dirtied eight files with its own name, so a clean tree could
 *     not survive running the tests;
 *   • two branches running the same suite produced a conflict in shared
 *     evidence purely over which branch happened to execute it (this actually
 *     happened during the card-redesign rebase);
 *   • `main` ended up stamped with the name of a branch that had been deleted,
 *     which is FALSE PROVENANCE: the file claimed to describe an evaluation
 *     run on a ref that no longer exists.
 *
 * THE CONTRACT NOW.
 *
 *   Ordinary gates (vitest, typecheck, lint, build, Playwright) NEVER write
 *   here. The evaluation suites still run in full and still assert everything
 *   they asserted before — nothing is skipped, no score is relaxed. They simply
 *   compute their report and keep it in memory unless a refresh was ASKED FOR.
 *
 *   Regeneration is explicit: `npm run eval:refresh`, which sets EVAL_WRITE=1.
 *
 * WHY A WRITE GATE RATHER THAN CLEANING UP AFTERWARDS. Restoring the files
 * after the fact (a `git checkout` in a script or a hook) leaves the race in
 * place: the tests still write, so anything that reads the tree mid-run — a
 * concurrent build, a watch process, CI archiving artifacts — still sees the
 * mutation. The write is prevented at its source instead.
 *
 * PROVENANCE DESCRIBES THE EVALUATED SOURCE, NOT THE EXECUTING BRANCH.
 * The commit SHA identifies exactly what was evaluated; a branch name only
 * says which ref happened to be checked out, is unstable across branches, and
 * is what made this evidence conflict-prone. It is therefore not recorded.
 * There is deliberately no timestamp either: with the SHA identifying the
 * evaluated state, omitting the clock makes `eval:refresh` IDEMPOTENT for a
 * given commit — re-running it on the same source produces a byte-identical
 * file, so any diff in `evaluation-results/` means a real result moved.
 */

/** The one environment switch. Set by `npm run eval:refresh`, nothing else. */
export const EVAL_WRITE_ENV = 'EVAL_WRITE';

export function evaluationWritesEnabled(): boolean {
  return process.env[EVAL_WRITE_ENV] === '1';
}

function gitOr(cmd: string, fallback: string): string {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return fallback;
  }
}

/**
 * The commit that was evaluated. Short SHA, or `dev` outside a git checkout.
 * Deliberately NOT the branch — see the note above.
 */
export function evaluatedCommit(): string {
  return gitOr('git rev-parse --short HEAD', 'dev');
}

/**
 * Write one evaluation artifact — but only when a refresh was explicitly asked
 * for. Returns whether it wrote, so a caller can report honestly rather than
 * implying evidence was refreshed when it was not.
 */
export function writeEvaluationArtifact(suite: string, filename: string, contents: string): boolean {
  if (!evaluationWritesEnabled()) return false;
  const dir = join(process.cwd(), 'evaluation-results', suite);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), contents, 'utf8');
  return true;
}
