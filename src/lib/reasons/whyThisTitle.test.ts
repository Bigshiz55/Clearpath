import { describe, it, expect } from 'vitest';
import { buildWhyReasons, primaryReasons, additionalReasons, joinNatural } from './whyThisTitle';
import { MIN_SAMPLES_FOR_FIT } from '@/lib/verdict/fitReasons';

describe('a reason explains personal fit, not the spec sheet', () => {
  it('leads with the taste match', () => {
    /* `ratedCount` supplied because a taste claim now requires a profile to
       stand on (see the floor block at the bottom of this file). The assertion
       is unchanged — this is the precondition it always implied. */
    const r = buildWhyReasons({
      tasteAgreements: ['forensic-crime', 'procedural'],
      ratedCount: MIN_SAMPLES_FOR_FIT,
    });
    expect(r[0]!.kind).toBe('taste');
    expect(r[0]!.text).toBe('Strong match for your forensic-crime and procedural preferences');
  });

  it('names the household members a group pick suits', () => {
    expect(buildWhyReasons({ householdNames: ['Scott', 'Heather'] })[0]!.text)
      .toBe('Strong match for Scott and Heather');
  });

  it('cites the highly-rated titles a similarity match came from', () => {
    expect(buildWhyReasons({ similarTo: ['Bones', 'Cold Case'] })[0]!.text)
      .toBe('Similar to Bones and Cold Case, which you rated highly');
  });

  it('mentions a person the viewer follows', () => {
    expect(buildWhyReasons({ followedPerson: 'Ioan Gruffudd' })[0]!.text)
      .toBe('Features Ioan Gruffudd, who you follow');
  });

  it('echoes a satisfied free-text request', () => {
    expect(buildWhyReasons({ satisfiedRequest: 'clever but not supernatural' })[0]!.text)
      .toBe('Matches your “clever but not supernatural” request');
  });

  it('says nobody here has watched it, when that is actually known', () => {
    expect(buildWhyReasons({ unwatchedByAll: true, householdNames: ['Scott'] }).map((x) => x.text))
      .toContain('Unwatched by everyone here');
    expect(buildWhyReasons({ unwatchedByAll: true }).map((x) => x.text))
      .toContain('You haven’t watched it');
  });
});

/**
 * THE DEFECT THIS SUITE EXISTS FOR. Shipped, "Why it fits" read
 * "3 seasons · 30 episodes" — the exact text already printed in the metadata
 * line two rows above. A fact about a title is not a reason a person should
 * watch it.
 */
describe('ordinary metadata is never a reason', () => {
  it('produces nothing from runtime, seasons or episode counts alone', () => {
    expect(buildWhyReasons({ episodeMinutes: 43, seasons: 3 })).toEqual([]);
    expect(buildWhyReasons({ episodeMinutes: 44, seasons: 7, seriesEnded: true })).toEqual([]);
  });

  it('uses episode length ONLY when the viewer asked about length', () => {
    expect(buildWhyReasons({ episodeMinutes: 43, requestedMaxMinutes: 45 })[0]!.text)
      .toBe('43-minute episodes fit the time you asked for');
    // Asked for under 30 and this is 43 — the constraint is not satisfied, so
    // there is no reason to state.
    expect(buildWhyReasons({ episodeMinutes: 43, requestedMaxMinutes: 30 })).toEqual([]);
  });

  it('uses the season count ONLY when a completed series was requested', () => {
    expect(buildWhyReasons({ requestedCompletedSeries: true, seriesEnded: true, seasons: 3 })[0]!.text)
      .toBe('Completed 3-season run, as you asked');
    // Still running, so the request is not satisfied.
    expect(buildWhyReasons({ requestedCompletedSeries: true, seriesEnded: false, seasons: 3 })).toEqual([]);
  });
});

describe('the honest fallback', () => {
  it('names the genres when there is no stronger evidence', () => {
    const r = buildWhyReasons({ genres: ['Crime', 'Mystery'], ratedCount: 12 });
    expect(r).toHaveLength(1);
    expect(r[0]!.text).toBe('Matches your general crime and mystery preferences');
  });

  it('never claims "your preferences" for someone who has rated nothing', () => {
    // With an empty profile there is no profile to match, and saying otherwise
    // would invent the very evidence this module refuses to invent.
    expect(buildWhyReasons({ genres: ['Crime'], ratedCount: 0 })).toEqual([]);
    expect(buildWhyReasons({ genres: ['Crime'] })).toEqual([]);
  });

  it('yields to real evidence rather than adding noise beside it', () => {
    const r = buildWhyReasons({ genres: ['Crime'], ratedCount: 12, tasteAgreements: ['forensic'] });
    expect(r.map((x) => x.kind)).toEqual(['taste']);
  });
});

describe('the card stays uncluttered', () => {
  it('shows at most two reasons up front and hides the rest behind Why?', () => {
    const all = buildWhyReasons({
      tasteAgreements: ['crime'], ratedCount: MIN_SAMPLES_FOR_FIT, householdNames: ['Scott'],
      newThisWeek: true, unwatchedByAll: true, airingTonight: true,
    });
    expect(all.length).toBeGreaterThan(2);
    expect(primaryReasons(all)).toHaveLength(2);
    expect([...primaryReasons(all), ...additionalReasons(all)]).toEqual(all);
  });

  it('caps taste dimensions rather than dumping the whole profile', () => {
    const r = buildWhyReasons({
      tasteAgreements: ['crime', 'forensic', 'procedural', 'dark'],
      ratedCount: MIN_SAMPLES_FOR_FIT,
    });
    expect(r[0]!.text).toBe('Strong match for your crime and forensic preferences');
    expect(r[0]!.text).not.toContain('procedural');
  });
});

describe('a reason is never invented', () => {
  it('produces nothing at all from an empty input', () => {
    expect(buildWhyReasons({})).toEqual([]);
  });

  it('says nothing about watch history when we have no record', () => {
    expect(buildWhyReasons({}).some((r) => r.kind === 'unwatched')).toBe(false);
    expect(buildWhyReasons({ unwatchedByAll: false }).some((r) => r.kind === 'unwatched')).toBe(false);
  });

  it('drops empty values instead of rendering blanks', () => {
    expect(buildWhyReasons({ tasteAgreements: ['', ''] })).toEqual([]);
    expect(buildWhyReasons({ genres: [''], ratedCount: 5 })).toEqual([]);
  });

  it('never mentions a provider — this half of the card is not about availability', () => {
    const text = JSON.stringify(buildWhyReasons({
      tasteAgreements: ['crime'], ratedCount: MIN_SAMPLES_FOR_FIT, airingTonight: true, trendingInPack: 'Crime Case Files',
    }));
    for (const p of ['Hulu', 'Netflix', 'Prime', 'CBS', 'stream', 'Watch now']) {
      expect(text, p).not.toContain(p);
    }
  });
});

describe('joinNatural', () => {
  it('reads the way a person would write it', () => {
    expect(joinNatural(['crime'])).toBe('crime');
    expect(joinNatural(['crime', 'forensic'])).toBe('crime and forensic');
    expect(joinNatural(['a', 'b', 'c'])).toBe('a, b and c');
    expect(joinNatural([])).toBe('');
  });
});

/**
 * ONE FLOOR, BOTH SURFACES — the second half of the P0-E mismatch.
 *
 * The title page has always honoured `MIN_SAMPLES_FOR_FIT`: below it,
 * `matchHighlights` is noise and `buildFitReasons` says so. The card did not —
 * it gated every "your…" claim on `ratedCount > 0`, so a single rating printed
 * "Strong match for your slow-burn preferences" at full confidence. The ranker
 * disagrees with that card in the strongest possible terms: `personalSignal`
 * scales the same dimension channel by `samples / 20`, so at one rating the
 * title moved by a twentieth of a nudge. The card asserted as settled exactly
 * what the ranking treated as almost nothing.
 *
 * Facts about the session are unaffected — a followed person, an airing
 * tonight and a satisfied request are not readings of a profile and never
 * needed one.
 */
describe('a claim about "your" taste answers to the profile floor', () => {
  const AGREE = ['slow burn', 'bleak'];
  const CLASH = ['pace — you lean fast-paced'];

  it('says nothing about the reader below the floor', () => {
    for (const ratedCount of [0, 1, MIN_SAMPLES_FOR_FIT - 1]) {
      const r = buildWhyReasons({
        tasteAgreements: AGREE,
        tasteConcerns: CLASH,
        genres: ['Drama'],
        ratedCount,
      });
      expect(r.map((x) => x.kind), `ratedCount=${ratedCount}`).not.toContain('taste');
      expect(r.map((x) => x.kind), `ratedCount=${ratedCount}`).not.toContain('concern');
      expect(r.map((x) => x.kind), `ratedCount=${ratedCount}`).not.toContain('general');
      expect(r.every((x) => !/\byour\b/i.test(x.text)), `ratedCount=${ratedCount}`).toBe(true);
    }
  });

  it('speaks at the floor and above, both halves of the evidence', () => {
    const r = buildWhyReasons({
      tasteAgreements: AGREE,
      tasteConcerns: CLASH,
      genres: ['Drama'],
      ratedCount: MIN_SAMPLES_FOR_FIT,
    });
    expect(r.map((x) => x.kind)).toContain('taste');
    expect(r.map((x) => x.kind)).toContain('concern');
  });

  it('a fact about the session is not a reading of a profile', () => {
    const r = buildWhyReasons({
      ratedCount: 0,
      followedPerson: 'Ann Dowd',
      airingTonight: true,
      satisfiedRequest: 'clever but not supernatural',
      householdNames: ['Sam'],
      unwatchedByAll: true,
    });
    expect(r.map((x) => x.kind).sort()).toEqual(
      ['airing', 'household', 'person', 'request', 'unwatched'].sort(),
    );
  });
});
