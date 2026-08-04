import { describe, it, expect } from 'vitest';
import { buildWhyReasons, primaryReasons, additionalReasons, joinNatural } from './whyThisTitle';

describe('a card always explains why the title was recommended', () => {
  it('leads with the personal reason, not a fact about the title', () => {
    const r = buildWhyReasons({
      episodeMinutes: 43,
      seasons: 3,
      tasteAgreements: ['crime', 'forensic'],
    });
    expect(r[0]!.kind).toBe('taste');
    expect(r[0]!.text).toBe('Matches your crime and forensic preferences');
  });

  it('names the household members a group pick suits', () => {
    const r = buildWhyReasons({ householdNames: ['Scott', 'Heather'] });
    expect(r[0]!.text).toBe('Strong fit for Scott and Heather');
  });

  it('cites the highly-rated titles a similarity match came from', () => {
    const r = buildWhyReasons({ similarTo: ['Bones', 'Cold Case'] });
    expect(r[0]!.text).toBe('Similar to Bones and Cold Case, which you rated highly');
  });

  it('covers the situational reasons too', () => {
    const kinds = buildWhyReasons({
      airingTonight: true,
      trendingInPack: 'Crime Case Files',
      newThisWeek: true,
      unwatched: true,
    }).map((x) => x.text);
    expect(kinds).toContain('Airing tonight');
    expect(kinds).toContain('Trending in Crime Case Files');
    expect(kinds).toContain('New this week');
    expect(kinds).toContain('Unwatched');
  });

  it('states runtime and run length as concrete facts', () => {
    const r = buildWhyReasons({ episodeMinutes: 43, seasons: 3, episodes: 30 });
    expect(r.map((x) => x.text)).toContain('43-minute episodes');
    expect(r.map((x) => x.text)).toContain('3 seasons · 30 episodes');
  });
});

describe('the card stays uncluttered', () => {
  it('shows at most two reasons up front and hides the rest behind Why?', () => {
    const all = buildWhyReasons({
      tasteAgreements: ['crime'],
      householdNames: ['Scott'],
      newThisWeek: true,
      unwatched: true,
      episodeMinutes: 43,
    });
    expect(all.length).toBeGreaterThan(2);
    expect(primaryReasons(all)).toHaveLength(2);
    expect(additionalReasons(all)).toHaveLength(all.length - 2);
    // Nothing is lost — the split is a split, not a truncation.
    expect([...primaryReasons(all), ...additionalReasons(all)]).toEqual(all);
  });

  it('caps taste dimensions rather than dumping the whole profile', () => {
    const r = buildWhyReasons({ tasteAgreements: ['crime', 'forensic', 'procedural', 'dark'] });
    expect(r[0]!.text).toBe('Matches your crime and forensic preferences');
    expect(r[0]!.text).not.toContain('procedural');
  });
});

describe('a reason is never invented', () => {
  it('produces nothing at all from an empty input', () => {
    expect(buildWhyReasons({})).toEqual([]);
    expect(primaryReasons([])).toEqual([]);
  });

  it('says "Unwatched" only when we positively know it is unwatched', () => {
    // undefined means we have no viewing record, which is NOT the same as
    // knowing the user has not seen it — they may have watched it elsewhere.
    expect(buildWhyReasons({}).some((r) => r.kind === 'unwatched')).toBe(false);
    expect(buildWhyReasons({ unwatched: false }).some((r) => r.kind === 'unwatched')).toBe(false);
    expect(buildWhyReasons({ unwatched: true }).some((r) => r.kind === 'unwatched')).toBe(true);
  });

  it('drops empty or missing values instead of rendering blanks', () => {
    expect(buildWhyReasons({ tasteAgreements: ['', ''] })).toEqual([]);
    expect(buildWhyReasons({ episodeMinutes: 0, seasons: 0 })).toEqual([]);
    expect(buildWhyReasons({ episodeMinutes: null, seasons: null })).toEqual([]);
  });

  it('never mentions a provider — this half of the card is not about availability', () => {
    const text = JSON.stringify(
      buildWhyReasons({ tasteAgreements: ['crime'], airingTonight: true, trendingInPack: 'Crime Case Files' }),
    );
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
