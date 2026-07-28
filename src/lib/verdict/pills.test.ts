import { describe, it, expect } from 'vitest';
import { buildPills, isAlreadyOnCard, isMatchReceipt } from './pills';

describe('one number per card', () => {
  it('still recognises the match receipt both producers build', () => {
    expect(isMatchReceipt('Your 93')).toBe(true);
    expect(isMatchReceipt('Household 88')).toBe(true);
  });

  it('does not mistake a year, a runtime or a percentage for it', () => {
    for (const r of ['2023', '118m', '87% audience', 'IMDb 7.8', 'on Kanopy', 'Stream It']) {
      expect(isMatchReceipt(r), r).toBe(false);
    }
  });

  it('DROPS the match receipt — the badge is the score', () => {
    // "Your 81" was rendering beside a badge reading 84, both claiming to be
    // the user's number. The pill goes; the badge (labelled honestly by its
    // own component) is the one number a card carries.
    const p = buildPills({ receipts: ['Your 81', 'Stream It'] });
    expect(p.map((x) => x.label)).toEqual(['Stream It']);
    expect(p.some((x) => isMatchReceipt(x.label))).toBe(false);
  });

  it('drops it wherever it appears, and drops all of them', () => {
    const p = buildPills({ receipts: ['Stream It', 'Your 93', 'Household 88'] });
    expect(p.map((x) => x.label)).toEqual(['Stream It']);
  });
});

describe('nothing the card already says', () => {
  it('knows the shapes the finder emits for year, runtime and ratings', () => {
    // The ratings receipts too: the panel's audience and IMDb chips ARE those
    // numbers, so "83% audience" under a panel reading "🍿 83%" is a repeat.
    for (const r of ['2024', '1995', '1h 42m', '2h', '118m', '45m episodes', '87% audience', 'IMDb 7.8']) {
      expect(isAlreadyOnCard(r), r).toBe(true);
    }
  });

  it('does not swallow genuine evidence that merely contains numbers', () => {
    for (const r of ['Stream It', 'all episodes out', 'fast-paced', 'English audio', 'upcoming', '2 winners']) {
      expect(isAlreadyOnCard(r), r).toBe(false);
    }
  });

  it('drops the repeats and keeps the rest — nothing lost, it is all in Why this Verd1ct', () => {
    const p = buildPills({ receipts: ['1h 42m', '2024', '87% audience', 'Stream It'] });
    expect(p.map((x) => x.label)).toEqual(['Stream It']);
  });

  it('an empty row is normal — it means the card already said it all', () => {
    expect(buildPills({ receipts: ['Your 81', '1h 42m', '2024'] })).toEqual([]);
  });
});

describe('the next step leads', () => {
  it('says what to do with the service name, first', () => {
    const p = buildPills({ receipts: ['Stream It'], where: 'Kanopy' });
    expect(p[0]).toEqual({ label: 'Watch on Kanopy', tone: 'watch' });
    expect(p[1]).toEqual({ label: 'Stream It', tone: 'fact' });
  });

  it('does not say the same service twice in two shapes', () => {
    const p = buildPills({ receipts: ['on Kanopy', 'Stream It'], where: 'Kanopy' });
    expect(p.map((x) => x.label)).toEqual(['Watch on Kanopy', 'Stream It']);
  });

  it('keeps a DIFFERENT service receipt — it is not a duplicate', () => {
    const p = buildPills({ receipts: ['on Netflix'], where: 'Kanopy' });
    expect(p.map((x) => x.label)).toEqual(['Watch on Kanopy', 'on Netflix']);
  });

  it('shows nothing at all rather than "Watch on "', () => {
    expect(buildPills({ receipts: [], where: null })).toEqual([]);
    expect(buildPills({ receipts: [], where: '  ' })).toEqual([]);
  });
});

describe('the quiet evidence', () => {
  it('keeps the engine’s own order and drops exact duplicates', () => {
    const p = buildPills({ receipts: ['English audio', 'Stream It', 'English audio', 'fast-paced'] });
    expect(p.map((x) => x.label)).toEqual(['English audio', 'Stream It', 'fast-paced']);
    expect(p.every((x) => x.tone === 'fact')).toBe(true);
  });

  it('survives malformed input without throwing', () => {
    expect(() => buildPills({})).not.toThrow();
    expect(buildPills({ receipts: ['', '   '] })).toEqual([]);
  });
});
