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
