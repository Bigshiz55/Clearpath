import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertSameProject,
  projectRefFromDbUrl,
  projectRefFromSupabaseUrl,
  sanitizeDbUrl,
} from './adminMigrateUrl';

/**
 * MIGRATING THE WRONG DATABASE IS NOT RECOVERABLE BY RE-RUNNING ANYTHING.
 *
 * `validateDbUrl` only ever checked that a connection string was well-FORMED.
 * Nothing anywhere compared it to `NEXT_PUBLIC_SUPABASE_URL`, so any
 * syntactically valid Postgres URI was accepted and migrated — including one
 * belonging to a different Supabase project. A stale value left over from
 * another project, exactly the kind of thing that accumulates in a Vercel env
 * list, was enough to cause it, and the failure is silent in both directions:
 * migrations land where the app never reads, and a database the app DOES read
 * gets altered by a deployment that was not aiming at it.
 *
 * Every URL below uses a placeholder password. The refs are fabricated but have
 * the real shape (20 lowercase alphanumerics), because the extractor's job is
 * to tell a ref from a username and it can only be tested on the real form.
 */

const APP = 'https://abcdefghijklmnopqrst.supabase.co';
const REF = 'abcdefghijklmnopqrst';
const OTHER = 'zzzzzzzzzzzzzzzzzzzz';
const PW = 'PLACEHOLDER-NOT-A-REAL-PASSWORD';

const pooler = (ref: string, port = 5432) =>
  `postgresql://postgres.${ref}:${PW}@aws-0-us-east-1.pooler.supabase.com:${port}/postgres`;
const direct = (ref: string) =>
  `postgresql://postgres:${PW}@db.${ref}.supabase.co:5432/postgres`;

describe('project ref extraction', () => {
  it('reads the ref from the application URL', () => {
    expect(projectRefFromSupabaseUrl(APP)).toBe(REF);
  });

  it('reads the pooler ref from the USERNAME, not the host', () => {
    /* The pooler host is shared infrastructure — `aws-0-<region>.pooler.
       supabase.com` carries no ref at all. Looking there would find nothing and
       wrongly report "cannot determine" for the connection form Vercel actually
       needs. */
    expect(projectRefFromDbUrl(pooler(REF))).toBe(REF);
    expect(projectRefFromDbUrl(pooler(REF, 6543))).toBe(REF);
  });

  it('reads the direct ref from the host', () => {
    expect(projectRefFromDbUrl(direct(REF))).toBe(REF);
  });

  it('returns null for shapes it does not recognise', () => {
    expect(projectRefFromDbUrl('postgresql://user:pw@localhost:5432/postgres')).toBeNull();
    expect(projectRefFromDbUrl('postgresql://postgres:pw@10.0.0.1:5432/postgres')).toBeNull();
    expect(projectRefFromSupabaseUrl('https://example.com')).toBeNull();
    // `db` is a host label, never a project ref.
    expect(projectRefFromSupabaseUrl('https://db.supabase.co')).toBeNull();
  });
});

describe('the guard passes only when the target is provably this app’s database', () => {
  it('matching session-pooler ref passes', () => {
    const r = assertSameProject(APP, pooler(REF));
    expect(r.ok, r.ok ? '' : r.reason).toBe(true);
    if (r.ok) expect(r.ref).toBe(REF);
  });

  it('matching direct ref passes — direct URLs remain supported', () => {
    const r = assertSameProject(APP, direct(REF));
    expect(r.ok, r.ok ? '' : r.reason).toBe(true);
  });

  it('MISMATCHING ref fails closed', () => {
    const r = assertSameProject(APP, pooler(OTHER));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('project_ref_mismatch');
    // Both refs are named — "these do not match" is unactionable without them,
    // and a ref is not a secret: it is the subdomain of a NEXT_PUBLIC_ value.
    expect(r.reason).toContain(OTHER);
    expect(r.reason).toContain(REF);
  });

  it('mismatching DIRECT ref fails closed too', () => {
    const r = assertSameProject(APP, direct(OTHER));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('project_ref_mismatch');
  });

  it('fails closed when it CANNOT TELL, not just when it disagrees', () => {
    /* A guard that waves through everything it does not understand is not a
       guard, it is a comment. Both directions of "indeterminate" refuse. */
    const unknownDb = assertSameProject(APP, 'postgresql://u:pw@localhost:5432/postgres');
    expect(unknownDb.ok).toBe(false);
    if (!unknownDb.ok) expect(unknownDb.code).toBe('project_ref_indeterminate');

    const unknownApp = assertSameProject('https://example.com', pooler(REF));
    expect(unknownApp.ok).toBe(false);
    if (!unknownApp.ok) expect(unknownApp.code).toBe('project_ref_indeterminate');

    const noApp = assertSameProject(undefined, pooler(REF));
    expect(noApp.ok).toBe(false);
  });

  it('malformed URLs still fail', () => {
    for (const bad of ['', 'not-a-url', 'postgresql://', 'postgresql://postgres:pw@host with space/db']) {
      const r = assertSameProject(APP, sanitizeDbUrl(bad));
      expect(r.ok, `"${bad}" was accepted`).toBe(false);
    }
  });

  it('NO refusal ever contains the password', () => {
    const refusals = [
      assertSameProject(APP, pooler(OTHER)),
      assertSameProject(APP, direct(OTHER)),
      assertSameProject(APP, 'postgresql://u:pw@localhost:5432/postgres'),
      assertSameProject('https://example.com', pooler(REF)),
    ];
    for (const r of refusals) {
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.reason, 'a refusal leaked the password').not.toContain(PW);
      // Nor the connection string, nor the userinfo separator that implies one.
      expect(r.reason).not.toContain('postgresql://');
      expect(r.reason).not.toContain('@');
    }
  });
});

describe('both admin routes use the shared guard, before connecting', () => {
  const migrate = readFileSync('src/app/api/admin/migrate/route.ts', 'utf8');
  const dry = readFileSync('src/app/api/admin/reconcile-dry/route.ts', 'utf8');

  it('neither duplicates the check', () => {
    // One implementation, imported twice — a second copy would drift and the
    // drift would be invisible until it mattered.
    for (const [name, src] of [['migrate', migrate], ['reconcile-dry', dry]] as const) {
      expect(src, `${name} does not import the shared guard`).toContain('assertSameProject');
      expect(src.includes('projectRefFromDbUrl'), `${name} reimplements ref extraction`).toBe(false);
    }
  });

  it('refuses BEFORE opening a connection', () => {
    for (const [name, src] of [['migrate', migrate], ['reconcile-dry', dry]] as const) {
      const guard = src.indexOf('assertSameProject(');
      const connect = src.indexOf('new Client(');
      expect(guard, `${name}: no guard call`).toBeGreaterThan(-1);
      expect(connect, `${name}: no client construction`).toBeGreaterThan(-1);
      expect(guard, `${name} connects before checking the project`).toBeLessThan(connect);
    }
  });

  it('returns a machine-readable code for each distinct failure', () => {
    /* The admin page has to distinguish four states. String-matching prose is
       how that breaks the next time somebody edits a sentence. */
    for (const code of ['db_url_missing', 'db_url_invalid']) {
      expect(migrate, `migrate lacks ${code}`).toContain(code);
      expect(dry, `reconcile-dry lacks ${code}`).toContain(code);
    }
    expect(migrate).toContain('db_connect_failed');
  });

  it('neither route echoes the connection string back to the caller', () => {
    for (const [name, src] of [['migrate', migrate], ['reconcile-dry', dry]] as const) {
      // The sanitized value must never appear in a response body.
      expect(src.includes('error: dbUrl'), `${name} returns the URL`).toBe(false);
      expect(src.includes('${dbUrl}'), `${name} interpolates the URL into a message`).toBe(false);
      expect(src.includes('console.log(dbUrl)'), `${name} logs the URL`).toBe(false);
    }
  });
});

describe('the admin page no longer mistranslates the server', () => {
  const button = readFileSync('src/components/admin/ReconcileDryRunButton.tsx', 'utf8');

  it('stops mapping every 503 to "no database connection configured"', () => {
    /* THE BUG. A malformed URL, a project-ref mismatch and a genuinely missing
       variable all returned 503, and this replaced the server's reason with one
       hardcoded sentence that was wrong for two of the three — which is what
       sent the last investigation in the wrong direction. */
    expect(button).not.toMatch(/res\.status === 503\s*\?\s*'The server has no database connection configured\.'/);
  });

  it('prefers the server’s own error', () => {
    expect(button).toContain('json.error');
    const errBlock = button.slice(button.indexOf('if (!res.ok)'), button.indexOf('} else {'));
    expect(errBlock, 'json.error is not consulted in the failure branch').toContain('json.error');
  });

  it('keeps a safe generic fallback for unexpected shapes', () => {
    // An unhandled case must still read as a real error, not an empty box.
    expect(button).toMatch(/Failed \(\$\{res\.status\}\)/);
  });
});
