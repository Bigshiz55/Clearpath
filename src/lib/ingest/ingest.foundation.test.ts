import { describe, it, expect } from 'vitest';
import { SOURCES, canIngest, refusalReason, getSource } from './sourceRegistry';
import { validateClaims, preserveConflict, type FieldClaim } from './validate';

describe('source registry gate', () => {
  it('permits TVmaze and the verified press sources', () => {
    for (const k of ['tvmaze', 'tmdb', 'paramount_press', 'hulu_press', 'britbox_site', 'admin_import']) {
      expect(canIngest(getSource(k)!), k).toBe(true);
    }
  });

  it('refuses A+E press — a blanket Disallow is an explicit prohibition', () => {
    const s = getSource('aenetworks_press')!;
    expect(s.state).toBe('EXPLICITLY_PROHIBITED');
    expect(canIngest(s)).toBe(false);
    expect(refusalReason(s)).toMatch(/expressly prohibits/i);
  });

  it('keeps Hallmark press dark while approval is pending, adapter ready', () => {
    const s = getSource('hallmark_press')!;
    expect(canIngest(s)).toBe(false);
    expect(s.pendingAction).toMatch(/PENDING APPROVAL/);
    expect(s.pendingAction).toMatch(/never bypass the login/i);
  });

  it('never auto-ingests a facts-only source, even with permissive robots', () => {
    const s = getSource('mylifetime_site')!;
    expect(s.robots).toBe('allows');
    expect(canIngest(s)).toBe(false);
    expect(refusalReason(s)).toMatch(/business decision/i);
  });

  it('never auto-ingests an uncharacterized source', () => {
    for (const k of ['amazon_press', 'peacock_press', 'acorn_press']) {
      expect(canIngest(getSource(k)!), k).toBe(false);
    }
  });

  it('robots status is recorded separately and never implies a licence', () => {
    // Nothing permissive-by-robots is CLEARLY_PERMITTED on that basis alone.
    for (const s of SOURCES) {
      if (s.state === 'CLEARLY_PERMITTED') expect(s.basis).not.toMatch(/robots/i);
    }
  });
});

describe('deterministic validator', () => {
  const raw = 'Paramount+ announced that Landman Season 2 premieres November 16, 2026.';

  it('accepts a claim whose evidence is present in the source', () => {
    const claims: FieldClaim[] = [
      { field: 'title', value: 'Landman', evidence: 'Landman' },
      { field: 'date', value: '2026-11-16', evidence: 'November 16, 2026' },
    ];
    expect(validateClaims(raw, claims).ok).toBe(true);
  });

  it('rejects an inferred field with no evidence — a missing date stays missing', () => {
    const r = validateClaims(raw, [{ field: 'time', value: '20:00', evidence: null }]);
    expect(r.ok).toBe(false);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0]!.reason).toMatch(/inferred/);
  });

  it('rejects evidence that is not actually in the payload', () => {
    const r = validateClaims(raw, [{ field: 'date', value: '2026-12-01', evidence: 'December 1, 2026' }]);
    expect(r.ok).toBe(false);
    expect(r.rejected[0]!.reason).toMatch(/not found/);
  });
});

describe('conflict preservation', () => {
  const a = { sourceKey: 'paramount_press', authority: 70, value: '2026-11-16', sourceUrl: 'u1', retrievedAt: 't', confidence: 0.9 };
  const b = { sourceKey: 'tvmaze', authority: 90, value: '2026-11-17', sourceUrl: 'u2', retrievedAt: 't', confidence: 0.8 };

  it('keeps every claim and flags a real disagreement for review', () => {
    const c = preserveConflict('date', [a, b])!;
    expect(c.claims).toHaveLength(2);
    expect(c.needsReview).toBe(true);
    expect(c.leading.sourceKey).toBe('tvmaze'); // higher authority leads display
    expect(c.claims.map((x) => x.value)).toContain('2026-11-16'); // loser is NOT dropped
  });

  it('does not flag agreement as a conflict', () => {
    expect(preserveConflict('date', [a, { ...b, value: '2026-11-16' }])!.needsReview).toBe(false);
  });
});
