import { describe, it, expect } from 'vitest';
import { HARD_TURN_CAP, hasUnraisedContradiction, isComplete, nextPhase } from './stateMachine';
import { createInterview } from './director';
import type { Contradiction, InterviewState, Claim } from './types';

function baseClaim(subject: string): Claim {
  return { id: `claim:${subject}`, turn: 1, subject, categories: ['crime'], sentiment: 'love', strength: 0.9 };
}

function contradiction(raised: boolean, resolved: boolean): Contradiction {
  return {
    id: 'c1',
    kind: 'sentiment_flip',
    earlier: baseClaim('x'),
    later: baseClaim('x'),
    explanation: 'test',
    raised,
    resolved,
  };
}

function stateWith(over: Partial<InterviewState>): InterviewState {
  return { ...createInterview('u', 0), ...over };
}

describe('nextPhase', () => {
  it('starts in warmup at turn 0', () => {
    expect(nextPhase(stateWith({ turn: 0 }))).toBe('warmup');
  });

  it('explores by default once talking', () => {
    expect(nextPhase(stateWith({ turn: 2, overallConfidence: 0.2 }))).toBe('exploring');
  });

  it('probes when a follow-up is pending', () => {
    const pending = { topic: 'crime', probes: ['?'], reason: 'shallow', openedTurn: 2 };
    expect(nextPhase(stateWith({ turn: 2, overallConfidence: 0.2, pendingFollowUp: pending }))).toBe('probing');
  });

  it('detours to challenging when a contradiction is unraised', () => {
    expect(nextPhase(stateWith({ turn: 3, overallConfidence: 0.4, contradictions: [contradiction(false, false)] }))).toBe(
      'challenging',
    );
  });

  it('does not challenge an already-raised contradiction', () => {
    expect(nextPhase(stateWith({ turn: 3, overallConfidence: 0.4, contradictions: [contradiction(true, false)] }))).toBe(
      'exploring',
    );
  });

  it('confirms then wraps as confidence climbs', () => {
    expect(nextPhase(stateWith({ turn: 6, overallConfidence: 0.82 }))).toBe('confirming');
    expect(nextPhase(stateWith({ turn: 8, overallConfidence: 0.92 }))).toBe('wrapping');
  });

  it('completes at the completion bar and at the hard cap', () => {
    expect(nextPhase(stateWith({ turn: 10, overallConfidence: 0.96 }))).toBe('complete');
    expect(nextPhase(stateWith({ turn: HARD_TURN_CAP, overallConfidence: 0.1 }))).toBe('complete');
  });
});

describe('helpers', () => {
  it('detects an unraised contradiction', () => {
    expect(hasUnraisedContradiction(stateWith({ contradictions: [contradiction(false, false)] }))).toBe(true);
    expect(hasUnraisedContradiction(stateWith({ contradictions: [contradiction(true, false)] }))).toBe(false);
  });

  it('isComplete tracks the cap and the bar', () => {
    expect(isComplete(stateWith({ turn: HARD_TURN_CAP }))).toBe(true);
    expect(isComplete(stateWith({ overallConfidence: 0.96 }))).toBe(true);
    expect(isComplete(stateWith({ turn: 3, overallConfidence: 0.5 }))).toBe(false);
  });
});
