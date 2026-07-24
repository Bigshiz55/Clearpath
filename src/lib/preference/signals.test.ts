import { describe, it, expect } from 'vitest';
import { primarySignal, reasonSignal, experienceSignal, attractionSignal } from './signals';
import type { PreferenceEvent } from './types';

const ev = (over: Partial<PreferenceEvent>): PreferenceEvent => ({
  id: 'e', at: 0, titleId: 'movie:1', action: 'skip', ...over,
});

describe('signal taxonomy', () => {
  it('the four primary buttons route to the right channel', () => {
    expect(primarySignal(ev({ action: 'seen_liked' }))!.channel).toBe('experience');
    expect(primarySignal(ev({ action: 'seen_disliked' }))!.channel).toBe('experience');
    expect(primarySignal(ev({ action: 'unseen_interested' }))!.channel).toBe('attraction');
    expect(primarySignal(ev({ action: 'unseen_not_interested' }))!.channel).toBe('attraction');
  });

  it('"Haven\'t seen — looks interesting" is ATTRACTION, never EXPERIENCE (the core fix)', () => {
    const s = primarySignal(ev({ action: 'unseen_interested' }))!;
    expect(s.channel).toBe('attraction');
    expect(s.polarity).toBe(1);
  });

  it('skip produces ZERO DNA', () => {
    expect(primarySignal(ev({ action: 'skip' }))).toBeNull();
  });

  it('a richer grade overrides the button default strength', () => {
    const liked = primarySignal(ev({ action: 'seen_liked' }))!;
    const loved = primarySignal(ev({ action: 'seen_liked', experienceGrade: 'loved' }))!;
    expect(loved.strength).toBeGreaterThan(liked.strength);
    expect(loved.channel).toBe('experience');
  });

  it('Experience carries more weight than Attraction than Discovery', () => {
    expect(experienceSignal('liked').strength).toBeGreaterThan(attractionSignal('interested').strength);
  });

  it('"too slow" is a permanent, pacing-targeted preference', () => {
    const s = reasonSignal('too_slow')!;
    expect(s.decay).toBe('permanent');
    expect(s.dims).toEqual([{ key: 'pacing', target: 100 }]);
  });

  it('"animation" permanently rejects the animation genre', () => {
    const s = reasonSignal('animation')!;
    expect(s.polarity).toBe(-1);
    expect(s.genres).toContain('animation');
    expect(s.decay).toBe('permanent');
  });

  it('poster/description are presentation-only and decay (never taste)', () => {
    expect(reasonSignal('poster')!.presentationOnly).toBe(true);
    expect(reasonSignal('poster')!.decay).toBe('mood');
    expect(reasonSignal('description')!.presentationOnly).toBe(true);
  });

  it('"just not in the mood" decays; "other" is inert', () => {
    expect(reasonSignal('not_in_the_mood')!.decay).toBe('mood');
    expect(reasonSignal('other')).toBeNull();
  });

  it('"already know the story" is a discovery signal, not a taste penalty', () => {
    const s = reasonSignal('already_know_story')!;
    expect(s.channel).toBe('discovery');
  });
});
