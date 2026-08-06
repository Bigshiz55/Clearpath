import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * The founder gate is one boolean, so it is worth being sure it cannot reject a
 * correct address over formatting — the failure mode that looks like "the
 * deployment is broken" when it is really a stray space.
 */
async function withAdmins(value: string | undefined, fn: (isAdminEmail: (e?: string | null) => boolean) => void) {
  vi.resetModules();
  const prev = process.env.ADMIN_EMAILS;
  if (value === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = value;
  const { isAdminEmail } = await import('./admin');
  try { fn(isAdminEmail); } finally {
    if (prev === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = prev;
  }
}

afterEach(() => { vi.resetModules(); });

describe('founder gate', () => {
  it('matches regardless of case', async () => {
    await withAdmins('Owner@Example.com', (is) => {
      expect(is('owner@example.com')).toBe(true);
      expect(is('OWNER@EXAMPLE.COM')).toBe(true);
    });
  });

  it('tolerates the ways a list gets pasted in', async () => {
    for (const raw of [
      'a@x.com,b@y.com',
      'a@x.com, b@y.com',
      ' a@x.com ,  b@y.com ',
      'a@x.com b@y.com',
      'a@x.com,b@y.com,',
      '\na@x.com\nb@y.com\n',
    ]) {
      await withAdmins(raw, (is) => {
        expect(is('a@x.com'), raw).toBe(true);
        expect(is('b@y.com'), raw).toBe(true);
      });
    }
  });

  it('denies everyone when the list is unset or empty', async () => {
    await withAdmins(undefined, (is) => expect(is('anyone@example.com')).toBe(false));
    await withAdmins('', (is) => expect(is('anyone@example.com')).toBe(false));
    await withAdmins('   ', (is) => expect(is('anyone@example.com')).toBe(false));
  });

  it('denies a missing or blank email rather than matching an empty entry', async () => {
    await withAdmins('a@x.com,,b@y.com', (is) => {
      expect(is(null)).toBe(false);
      expect(is(undefined)).toBe(false);
      expect(is('')).toBe(false);
    });
  });

  it('does not match a partial or lookalike address', async () => {
    await withAdmins('owner@example.com', (is) => {
      expect(is('owner@example.com.evil.com')).toBe(false);
      expect(is('notowner@example.com')).toBe(false);
      expect(is('owner@example.co')).toBe(false);
    });
  });
});

/**
 * The shared founder-or-admin gate for shared founder DIAGNOSTIC pages
 * (/founder/search-proof). The live defect: it gated on ADMIN_EMAILS only, so a
 * configured founder not duplicated there got a hidden 404.
 */
async function withEnv(
  env: { admin?: string; scott?: string; heather?: string; amy?: string },
  fn: (h: {
    isFounderOrAdminEmail: (e?: string | null) => boolean;
    isFounderEmail: (e?: string | null) => boolean;
    isAdminEmail: (e?: string | null) => boolean;
  }) => void,
) {
  vi.resetModules();
  const keys = ['ADMIN_EMAILS', 'FOUNDER_SCOTT_EMAIL', 'FOUNDER_HEATHER_EMAIL', 'FOUNDER_AMY_EMAIL'] as const;
  const prev = keys.map((k) => [k, process.env[k]] as const);
  const set = (k: string, v?: string) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
  set('ADMIN_EMAILS', env.admin);
  set('FOUNDER_SCOTT_EMAIL', env.scott);
  set('FOUNDER_HEATHER_EMAIL', env.heather);
  set('FOUNDER_AMY_EMAIL', env.amy);
  const h = await import('./admin');
  try {
    fn(h);
  } finally {
    for (const [k, v] of prev) set(k, v);
  }
}

describe('isFounderOrAdminEmail — shared founder diagnostic gate', () => {
  const full = { admin: 'boss@x.com', scott: 'scott@x.com', heather: 'heather@x.com', amy: 'amy@x.com' };

  it('unauthenticated (null / undefined / blank) → denied', async () => {
    await withEnv(full, ({ isFounderOrAdminEmail }) => {
      expect(isFounderOrAdminEmail(null)).toBe(false);
      expect(isFounderOrAdminEmail(undefined)).toBe(false);
      expect(isFounderOrAdminEmail('')).toBe(false);
      expect(isFounderOrAdminEmail('  ')).toBe(false);
    });
  });

  it('unrelated authenticated user → denied', async () => {
    await withEnv(full, ({ isFounderOrAdminEmail }) => expect(isFounderOrAdminEmail('stranger@nowhere.com')).toBe(false));
  });

  it('ADMIN_EMAILS member → allowed', async () => {
    await withEnv(full, ({ isFounderOrAdminEmail, isAdminEmail }) => {
      expect(isFounderOrAdminEmail('boss@x.com')).toBe(true);
      expect(isAdminEmail('boss@x.com')).toBe(true);
    });
  });

  it('each configured founder (Scott / Heather / Amy) → allowed', async () => {
    await withEnv(full, ({ isFounderOrAdminEmail, isFounderEmail }) => {
      expect(isFounderOrAdminEmail('scott@x.com')).toBe(true);
      expect(isFounderOrAdminEmail('heather@x.com')).toBe(true);
      expect(isFounderOrAdminEmail('amy@x.com')).toBe(true);
      expect(isFounderEmail('scott@x.com')).toBe(true);
    });
  });

  it('case + whitespace are normalized', async () => {
    await withEnv({ admin: 'boss@x.com', scott: 'Scott@X.com' }, ({ isFounderOrAdminEmail }) => {
      expect(isFounderOrAdminEmail('  scott@x.com ')).toBe(true);
      expect(isFounderOrAdminEmail('BOSS@X.COM')).toBe(true);
    });
  });

  it('a blank / missing founder env var grants nobody (no empty-string match)', async () => {
    await withEnv({ admin: '', scott: '', heather: undefined, amy: undefined }, ({ isFounderOrAdminEmail, isFounderEmail }) => {
      expect(isFounderOrAdminEmail('')).toBe(false);
      expect(isFounderOrAdminEmail('anyone@x.com')).toBe(false);
      expect(isFounderEmail('')).toBe(false);
    });
  });

  it('partial / lookalike email is rejected (exact match only)', async () => {
    await withEnv({ scott: 'scott@x.com' }, ({ isFounderOrAdminEmail }) => {
      expect(isFounderOrAdminEmail('scott@x.co')).toBe(false);
      expect(isFounderOrAdminEmail('scott@x.com.evil.com')).toBe(false);
      expect(isFounderOrAdminEmail('xscott@x.com')).toBe(false);
    });
  });
});
