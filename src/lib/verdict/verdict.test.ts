import { describe, it, expect } from 'vitest';
import {
  MAX_DOCKET,
  MIN_FOR_VERDICT,
  addToDocket,
  docketKey,
  docketStatus,
  trayHidden,
  VERDICT_ROUTE,
  pruneDocket,
  removeFromDocket,
  type DocketEntry,
} from './docket';
import { TIE_BAND, blendedScore, deliverVerdict, marginBetween, type Candidate } from './rank';

const NOW = 1_800_000_000_000;

const entry = (id: number, over: Partial<DocketEntry> = {}): Omit<DocketEntry, 'addedAt'> => ({
  key: docketKey('movie', id),
  tmdbId: id,
  mediaType: 'movie',
  title: `Title ${id}`,
  year: 2020,
  posterUrl: null,
  ...over,
});

const on = (n: number): DocketEntry[] =>
  Array.from({ length: n }, (_, i) => ({ ...entry(i + 1), addedAt: NOW }));

describe('the docket', () => {
  it('takes a title', () => {
    const r = addToDocket([], entry(1), NOW);
    expect(r.ok).toBe(true);
    expect(r.docket).toHaveLength(1);
  });

  it('refuses a duplicate rather than silently doing nothing', () => {
    const r = addToDocket(on(1), entry(1), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('already');
  });

  it('refuses something already watched, and says why', () => {
    const seen = new Set([docketKey('movie', 1)]);
    const r = addToDocket([], entry(1), NOW, { seenKeys: seen });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('seen');
      expect(r.message).toContain('not seen');
    }
  });

  it('caps the docket — a winner out of twenty means nothing', () => {
    const r = addToDocket(on(MAX_DOCKET), entry(99), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('full');
      expect(r.message).toContain(String(MAX_DOCKET));
    }
  });

  it('expires — tonight’s question does not survive the week', () => {
    const old: DocketEntry[] = [{ ...entry(1), addedAt: NOW - 2 * 24 * 60 * 60 * 1000 }];
    expect(pruneDocket(old, NOW)).toHaveLength(0);
    // …and a stale entry never blocks a fresh add of the same title.
    const r = addToDocket(old, entry(1), NOW);
    expect(r.ok).toBe(true);
  });

  it('removes cleanly', () => {
    expect(removeFromDocket(on(3), docketKey('movie', 2)).map((e) => e.key)).toEqual([
      docketKey('movie', 1),
      docketKey('movie', 3),
    ]);
  });

  it('will not call a verdict on fewer than three', () => {
    expect(docketStatus(on(1)).ready).toBe(false);
    expect(docketStatus(on(MIN_FOR_VERDICT - 1)).ready).toBe(false);
    expect(docketStatus(on(MIN_FOR_VERDICT)).ready).toBe(true);
    expect(docketStatus(on(2)).message).toContain('1 more');
  });
});

// ── The verdict ─────────────────────────────────────────────────────────────

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  key: 'movie:1',
  title: 'A Film',
  watchability: 70,
  personalMatch: 70,
  matchConfidence: 0.8,
  runtimeMinutes: 110,
  availableOn: ['Netflix'],
  ...over,
});

describe('blendedScore', () => {
  it('is the general score alone when the profile cannot speak to it', () => {
    expect(blendedScore(cand({ watchability: 80, personalMatch: null }))).toBe(80);
  });

  it('barely moves on a cold profile, moves a lot on a hot one', () => {
    const cold = blendedScore(cand({ watchability: 80, personalMatch: 20, matchConfidence: 0.05 }));
    const hot = blendedScore(cand({ watchability: 80, personalMatch: 20, matchConfidence: 1 }));
    expect(cold).toBeGreaterThan(hot);
    expect(cold).toBeGreaterThan(75);
    expect(hot).toBeLessThan(55);
  });

  it('falls back to neutral rather than crashing with no scores at all', () => {
    expect(blendedScore(cand({ watchability: null, personalMatch: null }))).toBe(50);
  });
});

describe('deliverVerdict', () => {
  it('returns ONE winner and ONE backup, not a list', () => {
    const v = deliverVerdict([
      cand({ key: 'a', title: 'A', watchability: 90 }),
      cand({ key: 'b', title: 'B', watchability: 60 }),
      cand({ key: 'c', title: 'C', watchability: 50 }),
    ]);
    expect(v.winner?.candidate.title).toBe('A');
    expect(v.backup?.candidate.title).toBe('B');
    expect(v.alsoRan).toHaveLength(1);
  });

  it('rules out what cannot be watched BEFORE it scores anything', () => {
    const v = deliverVerdict(
      [
        cand({ key: 'long', title: 'Long', watchability: 99, runtimeMinutes: 200 }),
        cand({ key: 'ok', title: 'Ok', watchability: 60, runtimeMinutes: 90 }),
      ],
      { maxRuntimeMinutes: 120 },
    );
    expect(v.winner?.candidate.title).toBe('Ok');
    expect(v.ruledOut).toHaveLength(1);
    expect(v.ruledOut[0]!.reason).toContain('200 min');
  });

  it('never silently drops a candidate — every exclusion carries its reason', () => {
    const v = deliverVerdict(
      [
        cand({ key: 'a', title: 'A', availableOn: [] }),
        cand({ key: 'b', title: 'B', hardExclusion: 'no harm to animals' }),
        cand({ key: 'c', title: 'C' }),
      ],
      { requireAvailable: true },
    );
    expect(v.ruledOut).toHaveLength(2);
    expect(v.ruledOut.map((r) => r.reason)).toEqual([
      'Not on any service you have.',
      'Crosses a line you set: no harm to animals.',
    ]);
    expect(v.winner?.candidate.title).toBe('C');
  });

  it('a hard exclusion outranks any score', () => {
    const v = deliverVerdict([
      cand({ key: 'a', title: 'Perfect', watchability: 100, personalMatch: 100, hardExclusion: 'no gore' }),
      cand({ key: 'b', title: 'Fine', watchability: 40 }),
    ]);
    expect(v.winner?.candidate.title).toBe('Fine');
  });

  it('says WHY the runner-up lost, in terms a person cares about', () => {
    const v = deliverVerdict([
      cand({ key: 'a', title: 'On Netflix', availableOn: ['Netflix'] }),
      cand({ key: 'b', title: 'Nowhere', availableOn: [], watchability: 72 }),
    ]);
    expect(v.winner?.candidate.title).toBe('On Netflix');
    expect(v.margin).toContain('on a service you have');
  });

  it('does not blame availability when the winner is the one you cannot stream', () => {
    // A much better film is still the right call even if you have to rent it —
    // but the explanation must not claim the opposite of what happened.
    const v = deliverVerdict([
      cand({ key: 'a', title: 'On Netflix', availableOn: ['Netflix'], watchability: 60 }),
      cand({ key: 'b', title: 'Nowhere', availableOn: [], watchability: 98, personalMatch: 95 }),
    ]);
    expect(v.winner?.candidate.title).toBe('Nowhere');
    expect(v.margin).not.toContain('on a service you have');
  });

  it('costs a title something to be on nothing you subscribe to', () => {
    const streamable = blendedScore(cand({ availableOn: ['Netflix'] }));
    const rental = blendedScore(cand({ availableOn: [] }));
    expect(streamable - rental).toBe(12);
  });

  it('prefers taste over reviews when explaining the gap', () => {
    const v = deliverVerdict([
      cand({ key: 'a', title: 'Yours', personalMatch: 85, watchability: 70 }),
      cand({ key: 'b', title: 'Theirs', personalMatch: 55, watchability: 70 }),
    ]);
    expect(v.margin).toContain('fits your taste better');
  });

  it('admits when nothing separated them instead of inventing a reason', () => {
    const v = deliverVerdict([
      cand({ key: 'a', title: 'A', watchability: 70, personalMatch: 70 }),
      cand({ key: 'b', title: 'B', watchability: 70, personalMatch: 70 }),
    ]);
    expect(v.margin).toBeNull();
    expect(v.confidence).toContain('level');
  });

  it('breaks a dead heat on how much we actually know', () => {
    const v = deliverVerdict([
      cand({ key: 'a', title: 'Known', watchability: 70, personalMatch: 70, matchConfidence: 0.9 }),
      cand({ key: 'b', title: 'Guess', watchability: 70, personalMatch: 70, matchConfidence: 0.1 }),
    ]);
    // Same blended score is impossible here (confidence changes the blend), so
    // assert the ordering the tiebreak is meant to produce.
    expect(v.winner?.candidate.title).toBe('Known');
  });

  it('says so when the call rests on reviews rather than taste', () => {
    const v = deliverVerdict([
      cand({ key: 'a', title: 'A', personalMatch: null, watchability: 90 }),
      cand({ key: 'b', title: 'B', personalMatch: null, watchability: 60 }),
    ]);
    expect(v.confidence).toContain('general verdict');
  });

  it('flags a one-horse race rather than dressing it up as a comparison', () => {
    const v = deliverVerdict([cand({ key: 'a', title: 'Only' })]);
    expect(v.backup).toBeNull();
    expect(v.confidence).toContain('by default');
  });

  it('says plainly when nothing survived', () => {
    const v = deliverVerdict([cand({ availableOn: [] })], { requireAvailable: true });
    expect(v.winner).toBeNull();
    expect(v.confidence).toContain('could be watched');
  });
});

describe('marginBetween', () => {
  it('is null inside the tie band with nothing else to separate them', () => {
    expect(marginBetween(cand({ title: 'A' }), cand({ title: 'B' }), TIE_BAND - 1)).toBeNull();
  });

  it('mentions runtime when that is the real difference', () => {
    const m = marginBetween(
      cand({ title: 'Short', runtimeMinutes: 95 }),
      cand({ title: 'Long', runtimeMinutes: 160 }),
      5,
    );
    expect(m).toContain('65 minutes shorter');
  });
});

/**
 * THE TRAY MUST NOT SIT ON THE RULING.
 *
 * It shipped fixed to the bottom of every screen, including the verdict page —
 * where it covered that page's own "Take me to it" and "Start a new docket"
 * buttons. The one screen with a decision on it was the one screen you could
 * not act on, and everything the tray offered there was redundant: Clear is
 * "Start a new docket", Deliver is what you had just done.
 *
 * Pure, so it is pinned here rather than by a browser test — the real route
 * redirects to /login without a session, so a browser assertion would be made
 * against a login page and prove nothing.
 */
describe('trayHidden', () => {
  it('hides the tray on the verdict page even with a full docket', () => {
    expect(trayHidden(VERDICT_ROUTE, 5)).toBe(true);
  });

  it('hides it on anything nested under the verdict route', () => {
    expect(trayHidden(`${VERDICT_ROUTE}/history`, 5)).toBe(true);
  });

  it('does NOT hide it on a route that merely starts with the same characters', () => {
    // `/app/verdicts` is a different page and would lose its tray to a naive
    // `startsWith` check.
    expect(trayHidden('/app/verdicts', 5)).toBe(false);
  });

  it('still shows the tray everywhere else a docket exists', () => {
    for (const path of ['/app', '/app/watch', '/app/tv', '/app/watchlist', '/app/dna']) {
      expect(trayHidden(path, 3), path).toBe(false);
    }
  });

  it('hides it whenever the docket is empty, wherever you are', () => {
    for (const path of ['/app', VERDICT_ROUTE, null, undefined]) {
      expect(trayHidden(path, 0), String(path)).toBe(true);
    }
  });

  it('shows it when the pathname is unknown but a docket exists', () => {
    // usePathname can be null on a first render; losing the tray then would be
    // a flicker, and the docket is the thing that actually matters.
    expect(trayHidden(null, 3)).toBe(false);
  });
});
