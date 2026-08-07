import { describe, it, expect } from 'vitest';
import { advance, createInterview, decide } from './director';
import { categoriesFor } from './categories';
import { HARD_TURN_CAP } from './stateMachine';
import { COMPLETION_CONFIDENCE, TASTE_CATEGORIES } from './types';
import type { TasteSignal, TasteCategory, InterviewState } from './types';

function sig(over: Partial<TasteSignal> & Pick<TasteSignal, 'id' | 'subject' | 'sentiment'>): TasteSignal {
  return {
    turn: 1,
    kind: 'genre',
    strength: 0.9,
    categories: categoriesFor(over.subject, over.kind ?? 'genre'),
    ...over,
  };
}

describe('createInterview', () => {
  it('produces a clean, warmup-phase state', () => {
    const s = createInterview('user-1', 1234);
    expect(s.userId).toBe('user-1');
    expect(s.turn).toBe(0);
    expect(s.phase).toBe('warmup');
    expect(s.status).toBe('active');
    expect(s.overallConfidence).toBe(0);
    expect(s.startedAtMs).toBe(1234);
    expect(s.pendingFollowUp).toBeNull();
  });
});

describe('decide', () => {
  it('greets on turn 0', () => {
    expect(decide(createInterview('u', 0)).action).toBe('greet');
  });

  it('explores a fresh axis after the greeting', () => {
    let s = createInterview('u', 0);
    s = advance(s, [sig({ id: 'a', kind: 'title', subject: 'Prisoners', sentiment: 'love', reason: 'the tension' })], 1);
    const d = decide(s);
    expect(['explore', 'followUp']).toContain(d.action);
    expect(d.category).not.toBeUndefined();
  });
});

describe('advance — a full simulated conversation reaches done', () => {
  it('drives overall confidence to the completion bar', () => {
    let s = createInterview('u', 0);
    for (let round = 0; round < 5 && s.status !== 'complete'; round++) {
      const signals = TASTE_CATEGORIES.map((c, i) =>
        sig({ id: `r${round}-${i}`, kind: 'element', subject: `thing-${c}`, sentiment: 'love', strength: 1, categories: [c] }),
      );
      s = advance(s, signals, 1000 + round);
    }
    expect(s.overallConfidence).toBeGreaterThanOrEqual(COMPLETION_CONFIDENCE);
    expect(s.status).toBe('complete');
    expect(decide(s).done).toBe(true);
    expect(decide(s).action).toBe('complete');
  });
});

describe('advance — the horror/Silence contradiction', () => {
  it('surfaces a single challenge directive, only until it is raised', () => {
    let s = createInterview('u', 0);
    s = advance(s, [sig({ id: 'a', subject: 'horror', sentiment: 'hate' })], 1);
    s = advance(s, [sig({ id: 'b', kind: 'title', subject: 'The Silence of the Lambs', sentiment: 'love' })], 2);

    expect(s.contradictions).toHaveLength(1);
    expect(s.contradictions[0]!.kind).toBe('category_vs_title');
    expect(decide(s).action).toBe('challenge');
    expect(decide(s).contradiction?.id).toBe(s.contradictions[0]!.id);

    // Feeding the same title again does NOT mint a second contradiction.
    s = advance(s, [sig({ id: 'c', kind: 'title', subject: 'The Silence of the Lambs', sentiment: 'love' })], 3);
    expect(s.contradictions).toHaveLength(1);

    // Once raised, the director stops challenging it.
    const raised: InterviewState = {
      ...s,
      contradictions: s.contradictions.map((c) => ({ ...c, raised: true })),
    };
    expect(decide(raised).action).not.toBe('challenge');
  });
});

describe('advance — shallow answers open a follow-up', () => {
  it('opens a crime follow-up for a thin "I like crime"', () => {
    let s = createInterview('u', 0);
    s = advance(s, [sig({ id: 'a', subject: 'crime', sentiment: 'like', strength: 0.3 })], 1);
    expect(s.pendingFollowUp).not.toBeNull();
    expect(s.pendingFollowUp?.probes[0]).toBe('What kind — serial killers? Heists?');
    const d = decide(s);
    expect(d.action).toBe('followUp');
    expect(d.suggestedLine).toBe('What kind — serial killers? Heists?');
  });

  it('clears the follow-up once answered with conviction', () => {
    let s = createInterview('u', 0);
    s = advance(s, [sig({ id: 'a', subject: 'crime', sentiment: 'like', strength: 0.3 })], 1);
    expect(s.pendingFollowUp).not.toBeNull();
    s = advance(s, [sig({ id: 'b', subject: 'crime', sentiment: 'love', strength: 0.9 })], 2);
    expect(s.pendingFollowUp).toBeNull();
  });
});

describe('advance — termination is guaranteed', () => {
  it('completes within the hard cap even on adversarial / empty input', () => {
    let s = createInterview('u', 0);
    const garbage = [null, {}, { nope: true }, 42, 'text'] as unknown as TasteSignal[];
    for (let i = 0; i < HARD_TURN_CAP + 5 && s.status !== 'complete'; i++) {
      s = advance(s, garbage, i + 1);
    }
    expect(s.status).toBe('complete');
    expect(s.turn).toBeLessThanOrEqual(HARD_TURN_CAP);
    expect(decide(s).done).toBe(true);
  });

  it('never throws and stays immutable on an empty turn', () => {
    const s0 = createInterview('u', 0);
    const s1 = advance(s0, [], 1);
    expect(s0.turn).toBe(0);
    expect(s1.turn).toBe(1);
  });
});

describe('decide — planner integration', () => {
  it('reports focus and satisfied category lists', () => {
    let s = createInterview('u', 0);
    const strong = (['genres', 'pacing', 'mood'] as TasteCategory[]).flatMap((c) =>
      [0, 1, 2, 3].map((i) => sig({ id: `${c}-${i}`, kind: 'element', subject: `t-${c}-${i}`, sentiment: 'love', strength: 1, categories: [c] })),
    );
    s = advance(s, strong, 1);
    const d = decide(s);
    expect(d.satisfiedCategories).toEqual(expect.arrayContaining(['genres', 'pacing', 'mood']));
    expect(d.focusCategories.length).toBeGreaterThan(0);
    expect(d.satisfiedCategories).not.toContain(d.focusCategories[0]);
  });
});
