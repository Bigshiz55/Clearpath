import { describe, it, expect } from 'vitest';
import { addToRDocket, rDocketStatus, MAX_RDOCKET, MIN_FOR_REVERDICT, docketKey } from './docket';
import { MAX_DOCKET, MIN_FOR_VERDICT, type DocketEntry } from '@/lib/verdict/docket';

const NOW = Date.parse('2026-07-27T12:00:00.000Z');

const entry = (id: number, title = `Title ${id}`) => ({
  key: docketKey('movie', id),
  tmdbId: id,
  mediaType: 'movie' as const,
  title,
  year: 2000,
  posterUrl: null,
});

const filled = (n: number): DocketEntry[] =>
  Array.from({ length: n }, (_, i) => ({ ...entry(i + 1), addedAt: NOW }));

describe('the R docket shares the W docket’s limits', () => {
  it('does not invent its own numbers', () => {
    // Two dockets disagreeing about "how many is too many" would mean two
    // different answers to the same question.
    expect(MIN_FOR_REVERDICT).toBe(MIN_FOR_VERDICT);
    expect(MAX_RDOCKET).toBe(MAX_DOCKET);
  });
});

describe('the inverted rule', () => {
  it('refuses a title the user has NOT watched', () => {
    const seen = new Set([docketKey('movie', 99)]);
    const res = addToRDocket([], entry(1), NOW, { seenKeys: seen });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.reason).toBe('unseen');
    expect(res.ok === false && res.message).toMatch(/have not watched/i);
  });

  it('accepts a title the user HAS watched', () => {
    const seen = new Set([docketKey('movie', 1)]);
    const res = addToRDocket([], entry(1), NOW, { seenKeys: seen });
    expect(res.ok).toBe(true);
    expect(res.docket).toHaveLength(1);
  });

  it('allows when the history is unknown rather than blocking the whole feature', () => {
    // Refusing on an unknown would make the R unusable before history loads;
    // deliverReVerdict still rules it out honestly at the end.
    const res = addToRDocket([], entry(1), NOW);
    expect(res.ok).toBe(true);
  });
});

describe('the shared mechanics still apply', () => {
  it('refuses a duplicate with a reason rather than silently doing nothing', () => {
    const res = addToRDocket(filled(1), entry(1), NOW);
    expect(res.ok === false && res.reason).toBe('already');
  });

  it('refuses past the cap and says why', () => {
    const res = addToRDocket(filled(MAX_RDOCKET), entry(999), NOW);
    expect(res.ok === false && res.reason).toBe('full');
    expect(res.ok === false && res.message).toMatch(/limit/i);
  });

  it('drops entries that have aged out before applying the cap', () => {
    const stale = filled(MAX_RDOCKET).map((e) => ({ ...e, addedAt: NOW - 48 * 3600_000 }));
    const res = addToRDocket(stale, entry(999), NOW);
    expect(res.ok).toBe(true);
    expect(res.docket).toHaveLength(1);
  });
});

describe('the status line', () => {
  it('says nothing is up for a rewatch when the docket is empty', () => {
    expect(rDocketStatus([])).toMatchObject({ count: 0, ready: false });
  });

  it('counts down to the minimum', () => {
    const s = rDocketStatus(filled(1));
    expect(s.ready).toBe(false);
    expect(s.message).toMatch(/2 more/);
  });

  it('reports ready at the minimum and full at the cap', () => {
    expect(rDocketStatus(filled(MIN_FOR_REVERDICT)).ready).toBe(true);
    expect(rDocketStatus(filled(MAX_RDOCKET)).full).toBe(true);
  });
});
