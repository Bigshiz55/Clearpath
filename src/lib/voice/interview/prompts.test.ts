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
  it('casts the model as the VOICE, not the interviewer', () => {
    // This test used to pin the opposite: a BBC-narrator persona that invented
    // its own follow-ups and called `record_signal` itself. That was right when
    // the model ran the conversation. Under the scripted architecture the
    // server is the director and the model is voice + transcription, so the
    // prompt must now REFUSE the interviewer role — otherwise it improvises
    // questions the director never chose and rewords category lists that are
    // scored positionally.
    expect(INTERVIEWER_SYSTEM_PROMPT).toContain('You are NOT the interviewer');
    expect(INTERVIEWER_SYSTEM_PROMPT).toMatch(/Say the line you are given, exactly/);
    expect(INTERVIEWER_SYSTEM_PROMPT).toMatch(/NEVER change a list of categories/);
    expect(INTERVIEWER_SYSTEM_PROMPT).toMatch(/Do not ask follow-ups of your own invention/);
    // The model no longer records anything; our server is the sole interpreter.
    expect(INTERVIEWER_SYSTEM_PROMPT).not.toContain('record_signal');
    expect(PROMPT_VERSION).toMatch(/^voice-interview-/);
  });

  it('specifies the intended delivery for the live audition', () => {
    expect(INTERVIEWER_SYSTEM_PROMPT).toMatch(/British\/Australian/);
    expect(INTERVIEWER_SYSTEM_PROMPT).toMatch(/BRISK/);
    expect(INTERVIEWER_SYSTEM_PROMPT).toMatch(/no announcer voice/i);
    expect(INTERVIEWER_SYSTEM_PROMPT).toMatch(/robotic cadence/);
    expect(INTERVIEWER_SYSTEM_PROMPT).toMatch(/FEW WORDS at most/);
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
