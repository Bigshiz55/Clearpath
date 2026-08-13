/**
 * IS THIS TREE FIT TO STAMP A COMMIT SHA ONTO?
 *
 * `evaluatedCommit()` records `git rev-parse --short HEAD`. That is only
 * truthful when the evaluated working tree MATCHES that commit — otherwise the
 * report names a commit which did not contain all of the source actually
 * evaluated, which is worse than no provenance: it looks precise and is wrong.
 *
 * So a refresh runs only from a clean, committed tree. The decision is
 * expressed purely over `git status --porcelain` output, which means it is
 * exhaustively testable without a repository, and which also gives the right
 * answer about ignored files for free: porcelain already omits them, and build
 * output or local scratch cannot have been evaluated.
 *
 * `.mjs` rather than `.ts` because the refresh entrypoint is a plain Node
 * script that must run before any TypeScript tooling is loaded — the whole
 * point is that this happens BEFORE vitest starts.
 */

export const REFUSAL =
  'Refusing to refresh evaluation evidence from a dirty working tree. Commit or restore source changes first.';

/**
 * Every entry `git status --porcelain` reported. Porcelain v1 is
 * `XY <path>`, where the two status characters cover both the index and the
 * working tree, so a STAGED-but-uncommitted change is dirty exactly as an
 * unstaged one is — committed is the bar, not staged.
 */
export function dirtyEntries(porcelain) {
  return String(porcelain ?? '')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => ({ status: line.slice(0, 2), path: line.slice(3).trim() }));
}

export function isCleanTree(porcelain) {
  return dirtyEntries(porcelain).length === 0;
}

/** The refusal, naming what is in the way so the operator can act on it. */
export function refusalMessage(porcelain) {
  const entries = dirtyEntries(porcelain);
  const lines = [
    REFUSAL,
    '',
    'A committed SHA is useful provenance precisely because it identifies an',
    'immutable source state. Stamping one over a mutable tree would claim a',
    'commit that did not contain everything that was evaluated.',
    '',
    `In the way (${entries.length}):`,
    ...entries.map((e) => `  ${e.status} ${e.path}`),
    '',
    'Nothing has been stashed, restored or written. Commit the changes (or',
    'restore them) and run `npm run eval:refresh` again.',
  ];
  return lines.join('\n');
}
