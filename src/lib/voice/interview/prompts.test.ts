import { describe, it, expect } from 'vitest';
import {
  buildTurnInstruction,
  INTERVIEWER_SYSTEM_PROMPT,
  PROMPT_VERSION,
  REALTIME_TOOLS,
  REALTIME_TOOL_NAMES,
} from './prompts';
import type { Directive, Contradiction, Claim } from './types';

function directive(over: Partial<Directive>): Directive {
  return {
    action: 'explore',
    category: null,
    focusCategories: [],
    satisfiedCategories: [],
    contradiction: null,
    suggestedLine: '',
    done: false,
    overallConfidence: 0,
    ...over,
  };
}

describe('the system prompt', () => {
  it('carries the personality and the style exemplars', () => {
    expect(INTERVIEWER_SYSTEM_PROMPT).toContain('BBC');
    expect(INTERVIEWER_SYSTEM_PROMPT).toContain('Prisoners');
    expect(INTERVIEWER_SYSTEM_PROMPT).toContain("Let's test a theory");
    expect(INTERVIEWER_SYSTEM_PROMPT).toContain('record_signal');
    expect(PROMPT_VERSION).toMatch(/^voice-interview-/);
  });
});

describe('REALTIME_TOOLS', () => {
  it('exposes record_signal and acknowledge_contradiction', () => {
    expect(REALTIME_TOOL_NAMES).toContain('record_signal');
    expect(REALTIME_TOOL_NAMES).toContain('acknowledge_contradiction');
  });

  it('record_signal params line up with TasteSignal', () => {
    const tool = REALTIME_TOOLS.find((t) => t.name === 'record_signal')!;
    const props = tool.parameters.properties as Record<string, unknown>;
    for (const key of ['kind', 'subject', 'sentiment', 'strength', 'reason', 'raw']) {
      expect(props).toHaveProperty(key);
    }
    expect(tool.parameters.required).toEqual(expect.arrayContaining(['kind', 'subject', 'sentiment', 'strength']));
  });

  it('acknowledge_contradiction takes an id and a resolved flag', () => {
    const tool = REALTIME_TOOLS.find((t) => t.name === 'acknowledge_contradiction')!;
    const props = tool.parameters.properties as Record<string, unknown>;
    expect(props).toHaveProperty('id');
    expect(props).toHaveProperty('resolved');
  });
});

describe('buildTurnInstruction', () => {
  it('reflects the action, focus and satisfied lists', () => {
    const line = buildTurnInstruction(
      directive({ action: 'explore', category: 'crime', focusCategories: ['crime', 'mood'], satisfiedCategories: ['genres'], suggestedLine: 'Ask about crime' }),
    );
    expect(line).toContain('crime');
    expect(line).toContain('mood');
    expect(line).toContain('genres');
  });

  it('includes the contradiction id on a challenge', () => {
    const claim: Claim = { id: 'cl', turn: 1, subject: 'horror', categories: ['horrorTolerance'], sentiment: 'hate', strength: 0.9 };
    const contradiction: Contradiction = {
      id: 'contradiction:xyz',
      kind: 'category_vs_title',
      earlier: claim,
      later: { ...claim, subject: 'The Silence of the Lambs', sentiment: 'love' },
      explanation: 'square that?',
      raised: false,
      resolved: false,
    };
    const line = buildTurnInstruction(directive({ action: 'challenge', contradiction, suggestedLine: 'square that?' }));
    expect(line).toContain('contradiction:xyz');
    expect(line).toContain('acknowledge_contradiction');
  });

  it('tells the model to wrap up when complete', () => {
    const line = buildTurnInstruction(directive({ action: 'complete', done: true, overallConfidence: 0.96 }));
    expect(line.toLowerCase()).toContain('reveal');
    expect(line).toContain('96%');
  });
});
