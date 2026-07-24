import { describe, it, expect } from 'vitest';
import { resolveFounderAccess, founderForPath, founderOfEmail, FOUNDERS, type AccessConfig } from './access';

const cfg: AccessConfig = {
  founderEmails: { scott: 'scott@wv.test', heather: 'Heather@WV.test', amy: 'amy@wv.test' },
  adminEmails: ['owner@wv.test'],
};

describe('founder route access control', () => {
  it('case-insensitive path resolution', () => {
    expect(founderForPath('/TestScott')).toBe('scott');
    expect(founderForPath('testscott')).toBe('scott');
    expect(founderForPath('/TESTHEATHER')).toBe('heather');
    expect(founderForPath('/TestAmy')).toBe('amy');
    expect(founderForPath('/nope')).toBeNull();
  });

  it('email→founder mapping is case-insensitive', () => {
    expect(founderOfEmail('SCOTT@wv.test', cfg)).toBe('scott');
    expect(founderOfEmail('heather@wv.test', cfg)).toBe('heather');
    expect(founderOfEmail('nobody@wv.test', cfg)).toBeNull();
    expect(founderOfEmail('', cfg)).toBeNull();
  });

  it('each founder can ONLY access their own route', () => {
    expect(resolveFounderAccess('scott@wv.test', 'scott', cfg)).toMatchObject({ allowed: true, isOwner: false });
    expect(resolveFounderAccess('heather@wv.test', 'heather', cfg)).toMatchObject({ allowed: true });
    expect(resolveFounderAccess('amy@wv.test', 'amy', cfg)).toMatchObject({ allowed: true });
  });

  it('wrong founder is DENIED (never shown another founder), pointed to their own', () => {
    const r = resolveFounderAccess('scott@wv.test', 'heather', cfg);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('wrong_founder');
    expect(r.authorizedRoute).toBe('/TestScott');
    expect(resolveFounderAccess('amy@wv.test', 'scott', cfg)).toMatchObject({ allowed: false, reason: 'wrong_founder', authorizedRoute: '/TestAmy' });
  });

  it('owner/admin can access ALL three routes', () => {
    for (const f of FOUNDERS) {
      expect(resolveFounderAccess('owner@wv.test', f.key, cfg)).toMatchObject({ allowed: true, isOwner: true });
    }
  });

  it('non-founders and signed-out users are denied', () => {
    expect(resolveFounderAccess('random@wv.test', 'scott', cfg)).toMatchObject({ allowed: false, reason: 'not_a_founder' });
    expect(resolveFounderAccess(null, 'scott', cfg)).toMatchObject({ allowed: false, reason: 'not_signed_in' });
    expect(resolveFounderAccess('', 'amy', cfg)).toMatchObject({ allowed: false, reason: 'not_signed_in' });
  });

  it('an unconfigured founder email never accidentally grants access', () => {
    const bare: AccessConfig = { founderEmails: {}, adminEmails: [] };
    for (const f of FOUNDERS) {
      expect(resolveFounderAccess('scott@wv.test', f.key, bare).allowed).toBe(false);
      // Empty config must not let an empty/blank email match an unset founder email.
      expect(resolveFounderAccess('', f.key, bare).allowed).toBe(false);
    }
  });
});
