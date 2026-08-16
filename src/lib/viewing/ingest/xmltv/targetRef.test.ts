import { describe, expect, it } from 'vitest';
import { supabaseProjectRef, verifyImportTarget } from './targetRef';

/**
 * THE IMPORT TARGET IS STATED, PARSED, AND MATCHED — OR NOTHING IS WRITTEN.
 *
 * The real import performs destructive reconciliation (stale-airing and
 * stale-position pruning), and the CLI used to write to WHATEVER project the
 * ambient NEXT_PUBLIC_SUPABASE_URL named — one wrong shell export away from
 * pruning production while trying to load a preview database. The acceptance
 * workflow (PR #75) depends on "this import can only hit the project I said":
 * the operator must declare --project-ref, the URL must parse to a ref, and
 * the two must agree, or the import refuses before any connection is made.
 */

describe('supabaseProjectRef', () => {
  it('extracts the project ref from a canonical Supabase URL', () => {
    expect(supabaseProjectRef('https://vajgviraxigkwlvysxfz.supabase.co')).toBe('vajgviraxigkwlvysxfz');
    expect(supabaseProjectRef('https://abc123xyz.supabase.co/')).toBe('abc123xyz');
  });

  it('refuses anything that is not a first-label supabase.co host — never a guess', () => {
    expect(supabaseProjectRef('https://supabase.co')).toBeNull();
    expect(supabaseProjectRef('https://evil.example.com/vajgviraxigkwlvysxfz.supabase.co')).toBeNull();
    expect(supabaseProjectRef('https://vajgviraxigkwlvysxfz.supabase.co.evil.example')).toBeNull();
    expect(supabaseProjectRef('https://deep.vajgviraxigkwlvysxfz.supabase.co')).toBeNull();
    expect(supabaseProjectRef('not a url')).toBeNull();
    expect(supabaseProjectRef('')).toBeNull();
    expect(supabaseProjectRef(null)).toBeNull();
    expect(supabaseProjectRef(undefined)).toBeNull();
  });
});

describe('verifyImportTarget — fail closed, keys never involved', () => {
  const URL = 'https://vajgviraxigkwlvysxfz.supabase.co';

  it('passes only when the declared ref matches the URL ref', () => {
    expect(verifyImportTarget(URL, 'vajgviraxigkwlvysxfz')).toEqual({ ok: true, ref: 'vajgviraxigkwlvysxfz' });
  });

  it('refuses a missing declaration — the operator must say which project', () => {
    const r = verifyImportTarget(URL, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('--project-ref');
  });

  it('refuses a mismatched declaration — the wrong-env accident, caught', () => {
    const r = verifyImportTarget(URL, 'someotherpreviewref');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('someotherpreviewref');
      expect(r.reason).toContain('vajgviraxigkwlvysxfz');
    }
  });

  it('refuses an unparseable URL rather than trusting it', () => {
    const r = verifyImportTarget('https://db.internal.example', 'whatever');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.toLowerCase()).toContain('project ref');
  });

  it('trims surrounding whitespace but never rewrites the declaration', () => {
    expect(verifyImportTarget(URL, '  vajgviraxigkwlvysxfz ')).toEqual({ ok: true, ref: 'vajgviraxigkwlvysxfz' });
  });
});
