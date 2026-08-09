import { describe, it, expect } from 'vitest';
import { deriveHeaderTraits, HEADER_TRAITS_MAX } from './headerTraits';

describe('deriveHeaderTraits — evidence-grounded tone + setting (no fabrication)', () => {
  it('derives tone from genres AND corroborating overview words', () => {
    const { tone } = deriveHeaderTraits({
      title: 'Nightfall',
      overview: 'A bleak, brutal descent into a sinister town.',
      genres: ['Horror'],
    });
    expect(tone).toContain('dark'); // genre Horror + words bleak/brutal/sinister
  });

  it('derives setting from real place words in title/overview/keywords', () => {
    const { setting } = deriveHeaderTraits({
      title: 'The Verdict',
      overview: 'A washed-up lawyer takes a medical case to trial in a Boston courtroom.',
      genres: ['Drama'],
      keywords: ['trial', 'attorney'],
    });
    expect(setting).toContain('courtroom');
  });

  it('matches genres exactly (case-insensitive), not as substrings', () => {
    const { tone } = deriveHeaderTraits({ title: 'X', overview: '', genres: ['Comedy'] });
    expect(tone).toContain('comedic');
    // "com" must not spuriously match Comedy's rule via substring
    const none = deriveHeaderTraits({ title: 'X', overview: '', genres: ['Documentary'] });
    expect(none.tone).not.toContain('comedic');
  });

  it('NEVER invents a concept whose trigger is absent from the evidence', () => {
    const { tone, setting } = deriveHeaderTraits({
      title: 'A Quiet Field',
      overview: 'Two friends share tea on a calm afternoon.',
      genres: ['Drama'],
      keywords: [],
    });
    // Drama → emotional is evidenced by genre; but nothing here evidences space,
    // courtroom, prison, etc. — none may appear.
    expect(setting).toEqual([]);
    expect(tone).not.toContain('dark');
    expect(tone).not.toContain('space' as never);
  });

  it('yields [] for both axes when there is no matching evidence at all', () => {
    const { tone, setting } = deriveHeaderTraits({ title: '', overview: '', genres: [], keywords: [] });
    expect(tone).toEqual([]);
    expect(setting).toEqual([]);
  });

  it('does not match a word that only appears as a substring of another word', () => {
    // "spaceless" contains "space" but is not the whole-word setting cue.
    const { setting } = deriveHeaderTraits({ title: 'Spaceless', overview: 'A spaceless story.', genres: [] });
    expect(setting).not.toContain('space');
  });

  it('is bounded to HEADER_TRAITS_MAX per axis and de-duplicated', () => {
    const { tone, setting } = deriveHeaderTraits({
      title: 'Everything',
      overview:
        'A dark, tense, suspenseful, gritty, comedic, romantic, emotional story set in a courtroom, a prison, a hospital, a school, a police precinct and outer space.',
      genres: ['Horror', 'Thriller', 'Mystery', 'Crime', 'Comedy', 'Romance', 'Drama'],
      keywords: ['courtroom', 'prison', 'hospital', 'school', 'police', 'space'],
    });
    expect(tone.length).toBeLessThanOrEqual(HEADER_TRAITS_MAX);
    expect(setting.length).toBeLessThanOrEqual(HEADER_TRAITS_MAX);
    expect(new Set(tone).size).toBe(tone.length);
    expect(new Set(setting).size).toBe(setting.length);
  });

  it('reads alt/original title evidence too (international titles)', () => {
    const { setting } = deriveHeaderTraits({
      title: 'Das Boot',
      altTitle: 'The submarine',
      overview: '',
      genres: ['War'],
    });
    expect(setting).toContain('submarine');
  });
});
