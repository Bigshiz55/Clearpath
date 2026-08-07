import { describe, it, expect } from 'vitest';
import {
  createInterview,
  recordBlockAnswer,
  recordAnchorAsked,
  selectNextStep,
  HARD_CEILING_S,
  ANCHOR_DEADLINE_S,
  type InterviewState,
} from './interview';
import { GENRE_PULSE } from './questionBank';

const pulse = (id: string) => GENRE_PULSE.find((b) => b.id === id)!;

describe('interview machine — stage flow and time budget', () => {
  it('starts with the genre pulse (breadth before depth)', () => {
    const step = selectNextStep(createInterview());
    expect(step.kind).toBe('block');
    if (step.kind === 'block') expect(step.block.stage).toBe('genre_pulse');
  });

  it('drills a STRONG genre and skips a disliked one', () => {
    let s = createInterview();
    // Answer pulse A: crime 10 (strong), drama 5, comedy 2 (dislike).
    s = recordBlockAnswer(s, pulse('pulse_a'), [10, 5, 2], 5);
    // Fast-forward past the pulse budget so drills are eligible.
    s = { ...s, elapsedSeconds: 19 };
    const step = selectNextStep(s);
    expect(step.kind).toBe('block');
    if (step.kind === 'block') {
      // It should drill CRIME (strong), never comedy (disliked at 2).
      expect(step.block.parent).toBe('genre:crime');
      expect(step.block.id).toBe('crime_core');
    }
  });

  it('never drills a genre scored at or below the skip threshold', () => {
    let s = createInterview();
    s = recordBlockAnswer(s, pulse('pulse_a'), [3, 2, 1], 5); // all dislikes
    s = { ...s, elapsedSeconds: 19 };
    const step = selectNextStep(s);
    // No strong genre → it moves on to watching-style, not a crime drill.
    if (step.kind === 'block') expect(step.block.stage).not.toBe('genre_drill');
  });

  it('short-circuits to the love anchor once past the anchor deadline', () => {
    const s: InterviewState = { elapsedSeconds: ANCHOR_DEADLINE_S + 1, asked: [], signals: {} };
    const step = selectNextStep(s);
    expect(step.kind).toBe('anchor');
    if (step.kind === 'anchor') expect(step.anchor.polarity).toBe('love');
  });

  it('stops at the hard ceiling', () => {
    const s: InterviewState = { elapsedSeconds: HARD_CEILING_S, asked: [], signals: {} };
    expect(selectNextStep(s)).toEqual({ kind: 'done', reason: 'time' });
  });

  it('does not repeat a block it already asked', () => {
    let s = createInterview();
    for (const b of GENRE_PULSE) s = recordBlockAnswer(s, b, [5, 5, 5], 3);
    const step = selectNextStep(s);
    if (step.kind === 'block') expect(GENRE_PULSE.map((b) => b.id)).not.toContain(step.block.id);
  });

  it('ends the interview after love+dislike anchors are captured with no strong genres', () => {
    let s: InterviewState = { elapsedSeconds: 30, asked: [], signals: { 'genre:crime': 2 } };
    // Exhaust watching-style + anchors.
    // Walk the machine until it reports done.
    let guard = 0;
    let step = selectNextStep(s);
    while (step.kind !== 'done' && guard++ < 20) {
      if (step.kind === 'block') s = recordBlockAnswer(s, step.block, [5, 5, 5], 3);
      else s = recordAnchorAsked(s, step.anchor, 6);
      step = selectNextStep(s);
    }
    expect(step.kind).toBe('done');
  });
});
