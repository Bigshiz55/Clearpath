import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isCleanTree, dirtyEntries, refusalMessage, REFUSAL } from './preflight.mjs';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * EVIDENCE MAY ONLY BE GENERATED FROM AN IMMUTABLE SOURCE STATE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * THE HOLE THIS CLOSES. `evaluatedCommit()` reads `git rev-parse --short HEAD`,
 * which is only truthful if the evaluated working tree MATCHES that commit.
 * `eval:refresh` could be run with uncommitted source changes: it would then
 * evaluate the dirty code and stamp the PREVIOUS commit, producing a report
 * that names a commit which did not contain all of the source actually
 * evaluated. The first version of this very PR demonstrated it — the tracked
 * evidence said `29fe520` while the implementation being proposed was at
 * `54252b1`.
 *
 * A committed SHA is useful provenance precisely BECAUSE it identifies an
 * immutable state. Stamping one over a mutable tree throws that away and
 * leaves something worse than no provenance: provenance that looks precise and
 * is wrong.
 *
 * THE ANSWER IS REFUSAL, NOT REPAIR. No silent stash, no restore, no synthetic
 * SHA derived from a diff. If the tree is dirty the operator commits or
 * restores, and then asks again.
 *
 * WHERE THE CHECK LIVES. ONCE, before vitest starts — not inside
 * `writeEvaluationArtifact()`. The moment the first artifact is intentionally
 * written the tree IS dirty, so a per-writer check would refuse every writer
 * after the first and leave the evidence half-regenerated. That is why this is
 * a preflight on its own entrypoint rather than a guard on the write.
 *
 * Written to FAIL before `preflight.mjs` and `scripts/evalRefresh.mjs` exist.
 */

// ── The pure decision, exhaustively ────────────────────────────────────────
describe('the cleanliness decision', () => {
  it('an empty porcelain listing is a clean tree', () => {
    expect(isCleanTree('')).toBe(true);
    expect(isCleanTree('\n')).toBe(true);
    expect(dirtyEntries('')).toEqual([]);
  });

  it('a modified tracked file is dirty', () => {
    expect(isCleanTree(' M src/lib/finder.ts\n')).toBe(false);
    expect(dirtyEntries(' M src/lib/finder.ts\n')).toEqual([{ status: ' M', path: 'src/lib/finder.ts' }]);
  });

  it('a STAGED change is dirty too — committed is the bar, not staged', () => {
    expect(isCleanTree('M  src/lib/finder.ts\n')).toBe(false);
    expect(isCleanTree('A  eval/runner/new.ts\n')).toBe(false);
  });

  it('an untracked file is dirty — it may well be source that was evaluated', () => {
    expect(isCleanTree('?? eval/runner/scratch.ts\n')).toBe(false);
  });

  it('a deletion and a rename are dirty', () => {
    expect(isCleanTree(' D eval/gold/cases.json\n')).toBe(false);
    expect(isCleanTree('R  a.ts -> b.ts\n')).toBe(false);
  });

  it('the refusal names the offenders and says what to do', () => {
    const msg = refusalMessage(' M src/lib/finder.ts\n?? eval/scratch.ts\n');
    expect(msg).toContain(REFUSAL);
    expect(msg).toContain('src/lib/finder.ts');
    expect(msg).toContain('eval/scratch.ts');
  });
});

// ── The real entrypoint, against real git repositories ─────────────────────
/**
 * Each case builds a throwaway repository in the OS temp dir and runs the
 * actual refresh entrypoint in `--check-only` mode. Nothing here touches THIS
 * repository — a test that dirtied the tree to prove dirtiness is refused
 * would be creating the very condition it is meant to detect, and any
 * concurrent `git status` would see it.
 */
const SCRIPT = join(process.cwd(), 'scripts', 'evalRefresh.mjs');

function repo(build: (dir: string) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'wv-preflight-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Preflight Test');
  writeFileSync(join(dir, 'seed.txt'), 'seed\n');
  git('add', '-A');
  git('commit', '-qm', 'seed');
  build(dir);
  return dir;
}

function checkOnly(dir: string): { code: number; out: string } {
  try {
    const out = execFileSync('node', [SCRIPT, '--check-only'], { cwd: dir, encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('the refresh entrypoint refuses a dirty tree', () => {
  it('a clean committed tree is allowed through', () => {
    const dir = repo(() => {});
    try {
      const { code } = checkOnly(dir);
      expect(code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('MODIFIED TRACKED SOURCE is refused', () => {
    const dir = repo((d) => writeFileSync(join(d, 'seed.txt'), 'changed\n'));
    try {
      const { code, out } = checkOnly(dir);
      expect(code).toBe(1);
      expect(out).toContain(REFUSAL);
      expect(out).toContain('seed.txt');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an UNTRACKED file is refused — it may be source that was evaluated', () => {
    const dir = repo((d) => writeFileSync(join(d, 'extra.ts'), 'export const x = 1;\n'));
    try {
      const { code, out } = checkOnly(dir);
      expect(code).toBe(1);
      expect(out).toContain('extra.ts');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('…unless it is GENUINELY IGNORED by git', () => {
    // Build output, caches and local scratch cannot have been evaluated, so
    // they must not block a refresh. `git status --porcelain` already excludes
    // them, which is exactly why the check is expressed in its terms rather
    // than by walking the filesystem.
    const dir = repo((d) => {
      writeFileSync(join(d, '.gitignore'), 'noise/\n');
      execFileSync('git', ['add', '-A'], { cwd: d, stdio: 'ignore' });
      execFileSync('git', ['commit', '-qm', 'ignore noise'], { cwd: d, stdio: 'ignore' });
      execFileSync('mkdir', ['-p', join(d, 'noise')]);
      writeFileSync(join(d, 'noise', 'build.log'), 'lots of output\n');
    });
    try {
      const { code } = checkOnly(dir);
      expect(code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a STAGED but uncommitted change is refused', () => {
    const dir = repo((d) => {
      writeFileSync(join(d, 'staged.ts'), 'export const y = 2;\n');
      execFileSync('git', ['add', '-A'], { cwd: d, stdio: 'ignore' });
    });
    try {
      const { code, out } = checkOnly(dir);
      expect(code).toBe(1);
      expect(out).toContain('staged.ts');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
