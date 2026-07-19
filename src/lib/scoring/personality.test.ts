import { describe, it, expect } from 'vitest';
import { describePersonality } from './personality';
import { DIMENSION_KEYS, buildProfile, type TitleDimensions } from './dimensions';

const fill = (v: number): TitleDimensions => Object.fromEntries(DIMENSION_KEYS.map((k) => [k, v])) as TitleDimensions;
const withDims = (over: Partial<TitleDimensions>): TitleDimensions => ({ ...fill(50), ...over }) as TitleDimensions;

// Build a profile by loving titles with the given dims a few times over.
const loves = (over: Partial<TitleDimensions>) =>
  buildProfile([1, 2, 3].map(() => ({ dims: withDims(over), rating: 10 })));

describe('describePersonality', () => {
  it('needs signal before committing to an archetype', () => {
    expect(describePersonality(buildProfile([])).title).toBe('Still Calibrating');
  });

  it('reads a dark slow-burn lover as The Slow-Burn Noir', () => {
    const p = describePersonality(loves({ darkness: 95, pacing: 5 }));
    expect(p.title).toBe('The Slow-Burn Noir');
    expect(p.traits).toContain('Dark');
  });

  it('reads a cerebral character lover as The Prestige Purist', () => {
    expect(describePersonality(loves({ complexity: 95, character: 95 })).title).toBe('The Prestige Purist');
  });

  it('reads a light comedy lover as The Comfort Watcher', () => {
    expect(describePersonality(loves({ humor: 95, darkness: 5 })).title).toBe('The Comfort Watcher');
  });

  it('falls back to a signature mix for an unusual but decisive profile', () => {
    const p = describePersonality(loves({ dialogue: 95 }));
    expect(p.title).toBe('Your Signature Mix');
    expect(p.traits.length).toBeGreaterThan(0);
  });
});
