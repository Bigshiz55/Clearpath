import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { evaluationWritesEnabled, writeEvaluationArtifact, evaluatedCommit } from './artifacts';

/**
 * THE PERMANENT GUARD: AN ORDINARY TEST RUN MAY NOT MUTATE TRACKED EVIDENCE.
 *
 * Two halves, because either one alone can be defeated:
 *
 *   1. BEHAVIOURAL — the gate itself actually gates. Proven by calling the
 *      writer under the ordinary environment and asserting it declines.
 *   2. STRUCTURAL — no evaluation suite reaches around the gate. A future
 *      suite that imports `node:fs` and writes its own report would pass (1)
 *      while reintroducing exactly the defect, so the source is checked too.
 *
 * This is deliberately NOT solved by restoring the files after the run. A
 * cleanup step leaves the write in place, so anything reading the tree while
 * the suite is in flight still sees the mutation; and it silently repairs the
 * symptom every time, which is how the problem survived this long.
 */

const EVAL_ROOT = join(process.cwd(), 'eval');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(ts|tsx|mjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('evaluation artifacts are written only on an explicit refresh', () => {
  it('the gate declines to write unless a refresh was explicitly requested', () => {
    // BOTH BRANCHES, DRIVEN EXPLICITLY. An earlier version of this test simply
    // asserted `process.env.EVAL_WRITE !== '1'` — true under `vitest run` and
    // false under `npm run eval:refresh`, so the guard failed the very command
    // it exists to protect. A guard that only holds under one of the two ways
    // it is invoked is not a guard.
    const prev = process.env.EVAL_WRITE;
    try {
      delete process.env.EVAL_WRITE;
      expect(evaluationWritesEnabled()).toBe(false);
      // Safe AND inert — and it REPORTS that it did not write, so no caller can
      // claim evidence was refreshed when it was not.
      expect(writeEvaluationArtifact('__guard__', 'must-not-appear.md', 'x')).toBe(false);

      process.env.EVAL_WRITE = '0';
      expect(evaluationWritesEnabled(), 'only an exact "1" opens the gate').toBe(false);
      process.env.EVAL_WRITE = 'true';
      expect(evaluationWritesEnabled(), 'only an exact "1" opens the gate').toBe(false);

      process.env.EVAL_WRITE = '1';
      // The predicate only — deliberately NOT calling the writer here, because
      // a test that proves writing works by writing would put a `__guard__`
      // directory into the evidence folder it is protecting.
      expect(evaluationWritesEnabled()).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.EVAL_WRITE;
      else process.env.EVAL_WRITE = prev;
    }
  });

  it('provenance records the evaluated commit and NOT the executing branch', () => {
    const sha = evaluatedCommit();
    expect(sha).toMatch(/^[0-9a-f]{7,40}$|^dev$/);
    // A branch name is unstable across branches and is what made this evidence
    // conflict-prone; `main` was even left stamped with a deleted branch.
    expect(sha).not.toMatch(/\//);
  });

  it('no evaluation suite writes to evaluation-results outside the gate', () => {
    // SCOPED TO WHAT VITEST ACTUALLY EXECUTES: `.ts` under eval/ — the suites
    // and everything they import. The `.mjs` scripts (cli, live/audit,
    // live/forensic) are user-invoked entry points that vitest never loads, so
    // they cannot dirty an ordinary run; the CI outcome guard
    // (`git diff --exit-code -- evaluation-results`) still covers them if that
    // ever changes.
    //
    // MATCHED ON THE WRITE DESTINATION, not on merely mentioning the folder.
    // `eval/runner/datasets.ts` writes `eval/gold/regression.json` and only
    // READS the untracked `evaluation-results/runs` directory fifty lines away
    // — flagging it would be a false positive that trains people to add
    // exemptions, which is how a guard stops guarding.
    const WINDOW = 300;
    const offenders: string[] = [];
    for (const file of walk(EVAL_ROOT)) {
      if (!file.endsWith('.ts')) continue;
      if (file.endsWith(join('runner', 'artifacts.ts'))) continue;
      if (file.endsWith('artifacts.arch.test.ts')) continue;

      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\b(writeFileSync|writeFile|appendFileSync|createWriteStream)\s*\(/g)) {
        const from = Math.max(0, m.index! - WINDOW);
        const near = src.slice(from, m.index! + WINDOW);
        if (near.includes('evaluation-results')) {
          offenders.push(`${file.replace(process.cwd() + '/', '')} (near offset ${m.index})`);
        }
      }
    }
    expect(
      offenders,
      `these write evaluation output directly instead of via writeEvaluationArtifact():\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the suites that produce tracked evidence all route through the gate', () => {
    // The counterpart to the rule above: proving nobody writes directly is only
    // half of it — the five suites that own tracked evidence must still be
    // producing it, or a future edit could delete a report and pass silently.
    const SUITES = [
      'eval/critical/run.critical.test.ts',
      'eval/critical/campaign.test.ts',
      'eval/adversarial/run.adversarial.test.ts',
      'eval/difficult/run.difficult.test.ts',
      'eval/search/run.matrix.test.ts',
    ];
    for (const rel of SUITES) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(src, `${rel} no longer produces its report`).toMatch(/writeEvaluationArtifact\(/);
      expect(src, `${rel} still reaches the filesystem directly`).not.toMatch(/\bwriteFileSync\s*\(/);
    }
  });

  it('no evaluation suite stamps the executing branch into its report', () => {
    const offenders: string[] = [];
    for (const file of walk(EVAL_ROOT)) {
      if (file.endsWith('artifacts.arch.test.ts')) continue;
      const src = readFileSync(file, 'utf8');
      if (/rev-parse\s+--abbrev-ref/.test(src)) offenders.push(file.replace(process.cwd() + '/', ''));
    }
    expect(offenders, `these stamp a branch name into shared evidence:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});
