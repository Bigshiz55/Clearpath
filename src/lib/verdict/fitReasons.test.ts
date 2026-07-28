import { describe, it, expect } from 'vitest';
import { buildFitReasons, fitsInTwoLines, MAX_FIT_CHARS, MIN_SAMPLES_FOR_FIT } from './fitReasons';

const AGREE = [
  { label: 'Tension', note: 'edge-of-seat' },
  { label: 'Attention', note: 'demands focus' },
  { label: 'Stakes', note: 'epic' },
];
const CLASH = [{ label: 'Humor', note: 'you lean broad' }];

describe('when there is a real profile', () => {
  it('names the axes the user actually rates highly', () => {
    const r = buildFitReasons({ agree: AGREE, clash: [], samples: 144 });
    expect(r.personalized).toBe(true);
    expect(r.positive).toContain('edge-of-seat tension');
    expect(r.positive).toContain('demands focus attention');
  });

  it('stops at two axes — three wraps to four lines on a phone', () => {
    const r = buildFitReasons({ agree: AGREE, clash: [], samples: 144 });
    expect(r.positive).not.toContain('epic stakes');
  });

  it('drops to ONE axis when two long ones would not fit two lines', () => {
    // "puzzle-forward mystery complexity" + "heavily supernatural intensity" is
    // 63 characters of axis alone — three lines in a 252px desktop column.
    const r = buildFitReasons({
      agree: [
        { label: 'Mystery Complexity', note: 'puzzle-forward, rewards attention' },
        { label: 'Supernatural Intensity', note: 'heavily supernatural' },
      ],
      clash: [],
      samples: 144,
    });
    expect(r.positive).toContain('puzzle-forward mystery complexity');
    expect(r.positive, 'the weaker second axis should have gone').not.toContain('supernatural');
    expect(r.positive.length).toBeLessThanOrEqual(MAX_FIT_CHARS);
    expect(fitsInTwoLines(r.positive)).toBe(true);
  });

  it('keeps both when they are short enough', () => {
    const r = buildFitReasons({ agree: AGREE.slice(0, 2), clash: [], samples: 144 });
    expect(r.positive).toContain('edge-of-seat tension');
    expect(r.positive).toContain('demands focus attention');
  });

  it('gives exactly one caution, from a real clash', () => {
    const r = buildFitReasons({ agree: AGREE, clash: CLASH, samples: 144 });
    expect(r.caution).toContain('humor');
    expect(r.caution).toContain('you lean broad');
  });

  it('says NOTHING rather than inventing a drawback when there is no clash', () => {
    const r = buildFitReasons({ agree: AGREE, clash: [], samples: 144 });
    expect(r.caution).toBeNull();
  });

  it('does not claim a fit when everything decisive runs the other way', () => {
    const r = buildFitReasons({ agree: [], clash: CLASH, samples: 144 });
    expect(r.personalized).toBe(true);
    expect(r.positive).toMatch(/nothing here matches/i);
    expect(r.caution).toContain('humor');
  });

  it('labels the lines so neither overclaims', () => {
    const r = buildFitReasons({ agree: AGREE, clash: CLASH, samples: 144 });
    expect(r.positiveLabel).toBe('Why it fits you');
    expect(r.cautionLabel).toBe('Possible drawback');
  });

  it('reads as a sentence for one axis and for two', () => {
    const one = buildFitReasons({ agree: [AGREE[0]!], clash: [], samples: 20 });
    expect(one.positive).toBe('You rate edge-of-seat tension highly.');
    const two = buildFitReasons({ agree: AGREE.slice(0, 2), clash: [], samples: 20 });
    expect(two.positive).toMatch(/tension and .*attention/);
  });
});

describe('honesty when there is nothing to say', () => {
  it('NEVER fakes personalisation on a thin profile', () => {
    for (const samples of [0, 1, MIN_SAMPLES_FOR_FIT - 1]) {
      const r = buildFitReasons({ agree: AGREE, clash: CLASH, samples });
      expect(r.personalized, `samples=${samples}`).toBe(false);
      expect(r.positive).toMatch(/not on your taste yet/i);
      expect(r.positive).not.toContain('Tension');
    }
  });

  it('falls back when the title has no usable fingerprint', () => {
    const r = buildFitReasons({ agree: [], clash: [], samples: 144 });
    expect(r.personalized).toBe(false);
    expect(r.caution).toMatch(/viewer dna grows/i);
  });

  it('says what would fix it, rather than just going quiet', () => {
    const r = buildFitReasons({ samples: 0 });
    expect(r.caution).toMatch(/rate a few titles/i);
  });

  it('survives missing and malformed input without throwing', () => {
    expect(() => buildFitReasons({})).not.toThrow();
    expect(
      buildFitReasons({ agree: [{ label: '', note: '' }], samples: 99 }).personalized,
    ).toBe(false);
  });
});

describe('it has to fit the card', () => {
  it('every sentence it can produce is short enough for two lines', () => {
    const cases = [
      buildFitReasons({ agree: AGREE, clash: CLASH, samples: 144 }),
      buildFitReasons({ agree: [], clash: CLASH, samples: 144 }),
      buildFitReasons({ samples: 0 }),
      buildFitReasons({
        // The longest axis labels the dimension set can produce.
        agree: [
          { label: 'Supernatural Intensity', note: 'heavily supernatural' },
          { label: 'Mystery Complexity', note: 'puzzle-forward, rewards attention' },
        ],
        samples: 144,
      }),
    ];
    for (const r of cases) {
      expect(fitsInTwoLines(r.positive), `too long: ${r.positive}`).toBe(true);
      if (r.caution) expect(fitsInTwoLines(r.caution), `too long: ${r.caution}`).toBe(true);
    }
  });

  it('the budget is a real number, not a vibe', () => {
    // Set by the narrowest column the card ever gets — a 280px desktop grid
    // cell, not the 390px phone.
    expect(MAX_FIT_CHARS).toBeGreaterThan(60);
    expect(fitsInTwoLines('x'.repeat(MAX_FIT_CHARS))).toBe(true);
    expect(fitsInTwoLines('x'.repeat(MAX_FIT_CHARS + 1))).toBe(false);
  });
});
