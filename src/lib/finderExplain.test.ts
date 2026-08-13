import { describe, it, expect } from 'vitest';
import { buildItemExplanation, checkedRequirements, assembleHousehold, type ExplainFacts } from './finderExplain';
import { EMPTY_QUERY } from './finderParse';
import type { FinderQuery } from './finder';
import { assetForProvider } from '@/lib/providers/assets';

const NETFLIX_LOGO = assetForProvider('Netflix');

const q = (over: Partial<FinderQuery>): FinderQuery => ({ ...EMPTY_QUERY, genreIds: [], ...over });
const facts = (over: Partial<ExplainFacts> = {}): ExplainFacts => ({
  matchScore: 88,
  generalScore: 76,
  reasonsFor: ['Fast investigative storytelling', 'Critics and crowds agree'],
  reasonsAgainst: ['Darker than most picks'],
  ratings: { standardScore: 76, audience: 82, rtAudience: null, tomatometer: 88, imdb: 7.9, metacritic: null },
  where: 'Netflix',
  onUsersService: true,
  meta: { mediaType: 'movie', runtimeMinutes: 118, year: 2023, englishAudio: true },
  ...over,
});

describe('checkedRequirements — evidence mirrors the finder filters', () => {
  it('lists exactly the constraints the query asked for, with evidence', () => {
    const reqs = checkedRequirements(q({ mediaType: 'movie', maxRuntime: 120, englishAudioOnly: true, providerIds: [8] }), facts());
    expect(reqs).toEqual([
      { label: 'Movie', satisfied: true, evidence: 'feature film' },
      { label: 'Under 120 min', satisfied: true, evidence: '118 min' },
      { label: 'On the requested service', satisfied: true, evidence: 'listed on Netflix' },
      { label: 'English audio', satisfied: true, evidence: 'English track listed' },
    ]);
  });

  it('a neutral query asserts NO requirements (nothing invented)', () => {
    expect(checkedRequirements(q({}), facts())).toEqual([]);
  });
});

describe('buildItemExplanation — real reasons, honest availability', () => {
  it('uses the verdict report reasons and labels TMDB availability "likely", never "verified"', () => {
    const e = buildItemExplanation(q({ mediaType: 'movie' }), facts());
    expect(e.rose).toContain('Fast investigative storytelling');
    expect(e.heldBack).toContain('Darker than most picks');
    // The row carries the OFFICIAL brand identity in parts (so it can render
    // the site's provider treatment) as well as the joined sentence.
    expect(e.availability).toEqual({
      text: 'Netflix · Included with subscription',
      confidence: 'likely',
      service: 'Netflix',
      // The registry's own verified Netflix mark — the row renders the brand
      // even though this caller passed no logo. See providers/assets.ts.
      logoPath: NETFLIX_LOGO,
      access: 'Included with subscription',
    });
    // 3 rating sources + personal signal + all requirements → but availability
    // is only "likely" (not verified), so confidence must not claim more than
    // medium-tier evidence supports… it can still be high on the other three.
    expect(['high', 'medium']).toContain(e.confidence.level);
  });

  it('no service listed → no availability claim at all', () => {
    const e = buildItemExplanation(q({}), facts({ where: null, onUsersService: false }));
    expect(e.availability).toBeNull();
  });
});

describe('assembleHousehold → finder ranking contract', () => {
  it('floor-weighted score is what ranking sorts by — a 96/38 split ranks below a 74/70 pair', () => {
    const split = assembleHousehold([{ name: 'You', match: 96 }, { name: 'Heather', match: 38 }]);
    const both = assembleHousehold([{ name: 'You', match: 74 }, { name: 'Heather', match: 70 }]);
    expect(both.score).toBeGreaterThan(split.score); // mean would say the opposite (67 vs 72)
    expect(split.call).toBe('warning');
  });
});
