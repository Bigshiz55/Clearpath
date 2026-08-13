import { describe, it, expect } from 'vitest';
import { normalizeTitle, pickMatch, type TmdbCandidate } from './tmdbMatch';

/**
 * APOSTROPHES ARE NOT WORD BREAKS — a production identity defect.
 *
 * Found by the post-merge smoke of the Critic Layer against the real catalogue:
 *
 *   user typed     "Widows Bay"      -> "widows bay"
 *   catalogue has  "Widow's Bay"     -> "widow s bay"     <- three tokens
 *
 * so a harmless punctuation difference made an exact title unfindable. The
 * generic `[^a-z0-9]+ -> ' '` step is right for hyphens and colons, which really
 * do separate words, and wrong for an apostrophe INSIDE one, which never does.
 *
 * This matcher is shared with Packs, so the rule has to be narrow: elide
 * apostrophe forms first, then let everything else keep becoming a space.
 * Widening it to "strip all punctuation" would silently merge titles that
 * punctuation genuinely distinguishes.
 */

describe('normalizeTitle · apostrophes elide, other punctuation still separates', () => {
  it('1 · straight apostrophe matches the punctuation-free spelling', () => {
    expect(normalizeTitle("Widow's Bay")).toBe(normalizeTitle('Widows Bay'));
    expect(normalizeTitle("Widow's Bay")).toBe('widows bay');
  });

  it('2 · curly apostrophe (U+2019) behaves identically', () => {
    expect(normalizeTitle('Widow’s Bay')).toBe('widows bay');
    expect(normalizeTitle('Widow’s Bay')).toBe(normalizeTitle("Widow's Bay"));
  });

  it('3 · the other common apostrophe forms too', () => {
    for (const ch of ['‘', 'ʼ', '´', '`']) {
      expect(normalizeTitle(`Widow${ch}s Bay`), `U+${ch.charCodeAt(0).toString(16)}`).toBe('widows bay');
    }
  });

  it('4 · a leading-particle apostrophe does not create a stray token', () => {
    /* "O'Brother" is one word. Splitting it produced a bare "o", which then
       collided with anything else beginning that way. */
    expect(normalizeTitle("O'Brother")).toBe('obrother');
    expect(normalizeTitle("O'Brien")).toBe('obrien');
    expect(normalizeTitle("Widow's Peak")).toBe('widows peak');
  });

  it('5 · HYPHEN and COLON still separate — they really are word breaks', () => {
    expect(normalizeTitle('Spider-Man')).toBe('spider man');
    expect(normalizeTitle('Mission: Impossible')).toBe('mission impossible');
    expect(normalizeTitle('Dune: Part Two')).toBe('dune part two');
  });

  it('6 · genuinely different titles stay distinct', () => {
    /* The fix must not become a blunt "delete punctuation" that merges works. */
    expect(normalizeTitle("Widow's Bay")).not.toBe(normalizeTitle('Widow Bay'));
    expect(normalizeTitle("The Hitcher")).not.toBe(normalizeTitle('The Pitcher'));
    expect(normalizeTitle('Heat')).not.toBe(normalizeTitle('Heats'));
  });

  it('7 · existing behaviour is untouched: accents, ampersand, leading article', () => {
    expect(normalizeTitle('Amélie')).toBe('amelie');
    expect(normalizeTitle('Fire & Ice')).toBe('fire and ice');
    expect(normalizeTitle('The Office')).toBe('office');
    expect(normalizeTitle('A Star Is Born')).toBe('star is born');
  });
});

describe('pickMatch · the production case that failed', () => {
  const widowsBay: TmdbCandidate[] = [{ id: 270476, title: "Widow's Bay", mediaType: 'tv', year: 2026 }];

  it('8 · "Widows Bay" now resolves against "Widow\'s Bay"', () => {
    const m = pickMatch({ title: 'Widows Bay', releaseYear: null, expectedMediaType: null }, widowsBay);
    expect(m).not.toBeNull();
    expect(m!.id).toBe(270476);
  });

  it('9 · and so does the curly form the user may actually type', () => {
    const m = pickMatch({ title: 'Widow’s Bay', releaseYear: null, expectedMediaType: null }, widowsBay);
    expect(m?.id).toBe(270476);
  });

  it('10 · a DIFFERENT title still does not match', () => {
    const m = pickMatch({ title: 'Widow Bay', releaseYear: null, expectedMediaType: null }, widowsBay);
    expect(m).toBeNull();
  });

  it('11 · media type is still identity, not a preference', () => {
    const m = pickMatch({ title: 'Widows Bay', releaseYear: null, expectedMediaType: 'movie' }, widowsBay);
    expect(m).toBeNull(); // the only candidate is a series
  });

  it('12 · ambiguity is still a refusal, not a coin flip', () => {
    /* Two real works sharing a normalized name must stay unmatched. The
       apostrophe fix must not make MORE things match than deserve to. */
    const two: TmdbCandidate[] = [
      { id: 1, title: "Widow's Bay", mediaType: 'movie', year: 2019 },
      { id: 2, title: 'Widows Bay', mediaType: 'movie', year: 2023 },
    ];
    expect(pickMatch({ title: 'Widows Bay', releaseYear: null, expectedMediaType: null }, two)).toBeNull();
  });
});
