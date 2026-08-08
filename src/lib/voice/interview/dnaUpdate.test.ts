import { describe, it, expect } from 'vitest';
import { signalsToPreferenceEvents, SOURCE } from './dnaUpdate';
import type { TasteSignal } from './types';

function sig(over: Partial<TasteSignal> & Pick<TasteSignal, 'id' | 'subject' | 'sentiment'>): TasteSignal {
  return { turn: 1, kind: 'title', strength: 0.9, categories: [], ...over };
}

describe('signalsToPreferenceEvents', () => {
  it('maps a loved title to a seen_liked / loved event with the voice source', () => {
    const e = signalsToPreferenceEvents([sig({ id: 'a', subject: 'The Shining', sentiment: 'love', strength: 0.9 })])[0]!;
    expect(e).toMatchObject({
      id: 'voice:a',
      titleId: 'voice:the-shining',
      action: 'seen_liked',
      experienceGrade: 'loved',
      source: SOURCE,
      familiarity: 1,
    });
    expect(SOURCE).toBe('voice_interview');
  });

  it('maps a hated title to seen_disliked / hated', () => {
    const e = signalsToPreferenceEvents([sig({ id: 'b', subject: 'La La Land', sentiment: 'hate', strength: 0.8 })])[0]!;
    expect(e.action).toBe('seen_disliked');
    expect(e.experienceGrade).toBe('hated');
    expect(e.titleId).toBe('voice:la-la-land');
  });

  it('maps like / dislike to the graded quiz shape', () => {
    const events = signalsToPreferenceEvents([
      sig({ id: 'c', subject: 'Heat', sentiment: 'like', strength: 0.6 }),
      sig({ id: 'd', subject: 'Cats', sentiment: 'dislike', strength: 0.7 }),
    ]);
    expect(events.find((e) => e.titleId === 'voice:heat')).toMatchObject({ action: 'seen_liked', experienceGrade: 'liked' });
    expect(events.find((e) => e.titleId === 'voice:cats')).toMatchObject({ action: 'seen_disliked', experienceGrade: 'disliked' });
  });

  it('ignores neutral reactions and non-title signals', () => {
    const events = signalsToPreferenceEvents([
      sig({ id: 'e', subject: 'Dune', sentiment: 'neutral' }),
      sig({ id: 'f', kind: 'genre', subject: 'crime', sentiment: 'love' }),
      sig({ id: 'g', kind: 'attribute', subject: 'subtitles', sentiment: 'hate' }),
    ]);
    expect(events).toEqual([]);
  });

  it('keeps the strongest reaction per title', () => {
    const events = signalsToPreferenceEvents([
      sig({ id: 'h1', subject: 'Se7en', sentiment: 'like', strength: 0.4 }),
      sig({ id: 'h2', subject: 'Se7en', sentiment: 'love', strength: 0.95 }),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]!.experienceGrade).toBe('loved');
  });
});
