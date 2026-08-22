/**
 * THE APPLY-MIGRATIONS WORKFLOW IS THE CANONICAL UNATTENDED MIGRATION PATH —
 * validated here as a FILE, not just through the helpers it calls. A workflow
 * defect (a step condition inverted, a referenced script renamed, a secret
 * echoed) only surfaces on a manual dispatch against production, which is the
 * single worst moment to learn about it. These assertions are the offline
 * dispatch.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';

const ROOT = join(__dirname, '..', '..');
const RAW = readFileSync(join(ROOT, '.github', 'workflows', 'apply-migrations.yml'), 'utf8');

interface Step { name?: string; if?: string; run?: string; uses?: string; env?: Record<string, string> }
interface Job { needs?: string | string[]; steps: Step[]; outputs?: Record<string, string> }
interface Workflow { on: unknown; jobs: Record<string, Job> }

// YAML 1.1 parsers read a bare `on` key as boolean true; js-yaml 4 keeps it a
// string, but reading both makes the test robust to a parser swap.
const doc = load(RAW) as Workflow & { [k: string]: unknown };
const on = (doc.on ?? (doc as Record<string, unknown>)[String(true)]) as Record<string, unknown>;
const jobs = doc.jobs as { preflight: Job; apply: Job; verify: Job };

function step(job: Job, match: RegExp): Step {
  const found = job.steps.find((s) => match.test(s.name ?? s.uses ?? ''));
  if (!found) throw new Error(`no step matching ${match}`);
  return found;
}

describe('the workflow file parses and has the manual-only shape', () => {
  it('parses as YAML with the three jobs', () => {
    expect(Object.keys(doc.jobs).sort()).toEqual(['apply', 'preflight', 'verify']);
  });

  it('is workflow_dispatch ONLY — a merge must never apply DDL to production', () => {
    expect(Object.keys(on)).toEqual(['workflow_dispatch']);
    const dispatch = on.workflow_dispatch as { inputs: Record<string, { required: boolean }> };
    expect(dispatch.inputs.confirm!.required).toBe(true);
  });

  it('the apply job refuses unless the confirm input is exactly APPLY', () => {
    const refuse = step(jobs.apply, /Refuse unless explicitly confirmed/);
    expect(refuse?.if).toBe("inputs.confirm != 'APPLY'");
    expect(refuse?.run).toMatch(/exit 1/);
  });
});

describe('execution channels: direct DB preferred, deployment endpoint fallback, no-credential fails loudly', () => {
  it('PATH 1 (direct) runs exactly when the repo has SUPABASE_DB_URL, via npm run migrate with the secret only in env context', () => {
    const p1 = step(jobs.apply, /Apply migrations directly/)!;
    expect(p1.if).toBe("needs.preflight.outputs.has_db_url == 'true'");
    expect(p1.run?.trim()).toBe('npm run migrate');
    expect(p1.env).toEqual({ SUPABASE_DB_URL: '${{ secrets.SUPABASE_DB_URL }}' });
  });

  it('PATH 2 (deployment endpoint) runs only without a DB URL and with BOTH the migrate secret and site URL', () => {
    const p2 = step(jobs.apply, /Apply migrations via the deployment/)!;
    expect(p2.if).toBe(
      "needs.preflight.outputs.has_db_url != 'true' && needs.preflight.outputs.has_migrate_secret == 'true' && needs.preflight.outputs.has_site_url == 'true'",
    );
    // The deployment's own HTTP verdict is the step's verdict — a route that
    // answers non-200 on a failed migration fails this step and the job.
    expect(p2.run).toMatch(/test "\$code" = "200"/);
    expect(p2.run).toMatch(/Authorization: Bearer \$\{\{ secrets\.MIGRATE_SECRET \}\}/);
  });

  it('with neither credential the run FAILS with instructions rather than skipping quietly', () => {
    const none = step(jobs.apply, /No credential available/)!;
    expect(none.if).toBe(
      "needs.preflight.outputs.has_db_url != 'true' && (needs.preflight.outputs.has_migrate_secret != 'true' || needs.preflight.outputs.has_site_url != 'true')",
    );
    expect(none.run).toMatch(/exit 1/);
    expect(none.run).toMatch(/SUPABASE_DB_URL/);
  });

  it('the three step conditions cover every credential combination with exactly one outcome', () => {
    // Truth table over (db_url, migrate_secret, site_url) — one and only one
    // of the three apply-channel steps may fire for each combination.
    for (const db of [true, false]) for (const ms of [true, false]) for (const site of [true, false]) {
      const p1 = db;
      const p2 = !db && ms && site;
      const none = !db && (!ms || !site);
      expect([p1, p2, none].filter(Boolean).length, `db=${db} ms=${ms} site=${site}`).toBe(1);
    }
  });
});

describe('preflight and verify', () => {
  it('preflight reports WHICH secrets exist as booleans and never a value', () => {
    const check = jobs.preflight.steps.find((s) => s.run)!;
    for (const name of ['SUPABASE_DB_URL', 'MIGRATE_SECRET', 'SITE_URL']) {
      expect(check.run).toContain(`secrets.${name} != ''`);
    }
    // No line may interpolate a secret's value into echo/output — every
    // secrets.* reference in this job is inside a boolean comparison.
    for (const line of (check.run ?? '').split('\n')) {
      if (line.includes('secrets.')) expect(line, line).toMatch(/!= ''/);
    }
  });

  it('verify runs AFTER apply and asks the live deployment, not the exit code', () => {
    expect(jobs.verify.needs).toBe('apply');
    const v = step(jobs.verify, /Verify the live schema/)!;
    expect(v.run).toContain('scripts/verifyProductionSchema.ts');
  });

  it('every script the workflow references exists in the repository', () => {
    expect(existsSync(join(ROOT, 'scripts', 'verifyProductionSchema.ts'))).toBe(true);
    expect(existsSync(join(ROOT, 'scripts', 'migrate.ts'))).toBe(true);
    expect(existsSync(join(ROOT, 'scripts', 'checkMigrationsRegistered.ts'))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    // `npm run migrate` resolves, and its premigrate gate catches an
    // unregistered migration file OFFLINE, before any database connection.
    expect(pkg.scripts.migrate).toContain('scripts/migrate.ts');
    expect(pkg.scripts.premigrate).toContain('scripts/checkMigrationsRegistered.ts');
  });

  it('secret values can only travel through the secrets context — never a literal, never an echo', () => {
    // Every ${{ secrets.* }} occurrence must be one of the audited shapes:
    // an env assignment, a boolean existence check, a curl Bearer header,
    // or a URL argument. Anything new must be added here deliberately.
    const uses = RAW.match(/[^\n]*\$\{\{\s*secrets\.[A-Z_]+[^\n]*/g) ?? [];
    for (const line of uses) {
      const audited =
        /^\s*SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}\s*$/.test(line) ||
        /secrets\.[A-Z_]+ != ''/.test(line) ||
        /-H "Authorization: Bearer \$\{\{ secrets\.MIGRATE_SECRET \}\}"/.test(line) ||
        /"\$\{\{ secrets\.SITE_URL \}\}\/api\/admin\/migrate"/.test(line) ||
        /\$\{\{ secrets\.SITE_URL \|\| '[^']+' \}\}/.test(line);
      expect(audited, `unaudited secret usage: ${line.trim()}`).toBe(true);
    }
    // And no run line echoes a secret interpolation.
    expect(RAW).not.toMatch(/echo[^\n]*\$\{\{ secrets\.[A-Z_]+ \}\}/);
  });
});
