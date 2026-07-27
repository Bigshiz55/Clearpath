import {
  rankAndLimit, describe, it, expect } from 'vitest';
import {
  rankAndLimit, normalizeTitle, titleMatchTier, isExactTitle, rankByTitleIdentity } from './titleNormalize';

describe('titleNormalize', () => {
  it('normalizes safely', () => {
    expect(normalizeTitle('Gone Girl')).toBe('gone girl');
    expect(normalizeTitle("It's a Wonderful Life")).toBe('its a wonderful life');
    expect(normalizeTitle('Amélie')).toBe('amelie');
    expect(normalizeTitle('Spider-Man: No Way Home')).toBe('spider man no way home');
    expect(normalizeTitle('  Gone   ')).toBe('gone');
  });

  it('THE bug: "Gone" is NOT an exact match for "Gone Girl"', () => {
    expect(titleMatchTier('Gone', 'Gone Girl')).toBe('contains');
    expect(isExactTitle('Gone', 'Gone Girl')).toBe(false);
    expect(isExactTitle('Gone', 'Gone Baby Gone')).toBe(false);
    expect(isExactTitle('Gone', 'Gone')).toBe(true);
  });

  it('article-insensitive exact (alt) match', () => {
    expect(titleMatchTier('The Gone', 'Gone')).toBe('alt');
    expect(isExactTitle('The Office', 'Office')).toBe(true);
    expect(isExactTitle('Gone', 'The Gone')).toBe(true);
  });

  it('exact ranks above a more-popular contains match', () => {
    const cands = [
      { title: 'Gone Girl', pop: 100 },
      { title: 'Gone', pop: 5 },
      { title: 'Gone Baby Gone', pop: 40 },
    ];
    const ranked = rankByTitleIdentity('Gone', cands, (c) => c.title, (c) => c.pop);
    expect(ranked[0]!.title).toBe('Gone'); // exact beats popular
  });

  it('fuzzy only for genuine near-spellings, never for a different title', () => {
    expect(titleMatchTier('Sherlock', 'Sherlok')).toBe('fuzzy');
    expect(titleMatchTier('Gone', 'Girl')).toBe('none');
  });
});


/**
 * "I searched for gone and only pulled up gone girl."
 *
 * TMDB returns hundreds of titles containing "gone". Sorted by popularity and
 * cut to 20, the list is Gone Girl, Gone in 60 Seconds, Gone Baby Gone, Gone
 * with the Wind — and the 2012 film actually called "Gone" is nowhere in it.
 *
 * The point of these is the ORDER OF OPERATIONS. Ranking a list that has
 * already been truncated cannot recover the right answer, because the right
 * answer is what the truncation threw away.
 */
describe('the Gone regression', () => {
  const t = (title: string, popularity: number) => ({ title, popularity });

  /** What TMDB actually hands back for "gone": fame first, the real one buried. */
  const gone = [
    t('Gone Girl', 980), t('Gone in 60 Seconds', 610), t('Gone Baby Gone', 420),
    t('Gone with the Wind', 390), t('Gone Fishin\'', 120), t('Gone Too Far', 90),
    t('Gone Hollywood', 70), t('Gone Doggy Gone', 60), t('Gone Missing', 55),
    t('Gone Dark', 50), t('Gone Are the Days', 45), t('Gone by Dawn', 40),
    t('Gone Wild', 35), t('Gone Fishing', 30), t('Gone West', 28),
    t('Gone Astray', 26), t('Gone Tomorrow', 24), t('Gone Viral', 22),
    t('Gone South', 20), t('Gone to Ground', 18),
    // The film they were looking for. Twenty-first on fame.
    t('Gone', 12),
  ];

  it('the exact match survives the cut', () => {
    const top = rankAndLimit('Gone', gone, (x) => x.title, (x) => x.popularity, 20);
    expect(top.map((x) => x.title)).toContain('Gone');
  });

  it('and it is first, ahead of every more famous near-miss', () => {
    const top = rankAndLimit('Gone', gone, (x) => x.title, (x) => x.popularity, 20);
    expect(top[0]!.title).toBe('Gone');
  });

  it('THE ORDER OF OPERATIONS is the whole fix', () => {
    // Cut first, then rank — what the endpoint used to do. The right answer is
    // already gone, and no ranker can bring it back.
    const cutFirst = [...gone].sort((a, b) => b.popularity - a.popularity).slice(0, 20);
    expect(cutFirst.map((x) => x.title)).not.toContain('Gone');
  });

  it('popularity still orders titles of the same tier', () => {
    const versions = [t('Cinderella', 120), t('Cinderella', 950), t('Cinderella Man', 38)];
    const top = rankAndLimit('Cinderella', versions, (x) => x.title, (x) => x.popularity, 10);
    expect(top[0]!.popularity).toBe(950);
    expect(top[2]!.title).toBe('Cinderella Man');
  });

  it('a partial word nobody has an exact match for keeps popularity order', () => {
    // Mid-typing. Every candidate tiers the same, so the familiar ordering
    // survives and the box does not reshuffle on every keystroke.
    const typing = [t('Batman Begins', 500), t('Batman', 900), t('Batwoman', 100)];
    const top = rankAndLimit('batm', typing, (x) => x.title, (x) => x.popularity, 10);
    expect(top.map((x) => x.title)).toEqual(['Batman', 'Batman Begins', 'Batwoman']);
  });

  it('honours the limit', () => {
    expect(rankAndLimit('Gone', gone, (x) => x.title, (x) => x.popularity, 5)).toHaveLength(5);
    expect(rankAndLimit('Gone', gone, (x) => x.title, (x) => x.popularity, 0)).toHaveLength(0);
  });
});
