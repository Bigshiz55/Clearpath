import { describe, it, expect } from 'vitest';
import { signalFromToolArgs, speakLinePayload } from './client';

/**
 * The Realtime client is browser-only, but the ONE pure seam — turning a
 * `record_signal` tool call into a `TasteSignal` (and resolving its axes through
 * the shared lexicon, which the tool schema deliberately does not ask the model
 * for) — is testable without a browser and is where a bad model payload would
 * otherwise slip through.
 */
describe('signalFromToolArgs', () => {
  it('builds a signal and resolves axes the tool never sent', () => {
    const s = signalFromToolArgs({ kind: 'title', subject: 'Parasite', sentiment: 'love', strength: 0.9 });
    expect(s).not.toBeNull();
    expect(s!.subject).toBe('Parasite');
    expect(s!.sentiment).toBe('love');
    expect(s!.strength).toBe(0.9);
    // categoriesFor filled these — the model was never asked for them.
    expect(s!.categories).toContain('foreignFilms');
  });

  it('rejects arguments with no subject', () => {
    expect(signalFromToolArgs({ sentiment: 'love', strength: 1 })).toBeNull();
    expect(signalFromToolArgs(null)).toBeNull();
    expect(signalFromToolArgs('nonsense')).toBeNull();
  });

  it('coerces an invalid sentiment and clamps strength rather than throwing', () => {
    const s = signalFromToolArgs({ kind: 'genre', subject: 'horror', sentiment: 'terrified', strength: 5 });
    expect(s!.sentiment).toBe('neutral');
    expect(s!.strength).toBe(1);
    expect(s!.categories).toContain('horrorTolerance');
  });

  it('defaults an unknown kind to element', () => {
    const s = signalFromToolArgs({ subject: 'slow burn', sentiment: 'like', strength: 0.5 });
    expect(s!.kind).toBe('element');
    expect(s!.categories).toContain('pacing');
  });
});

/**
 * The app-driven turn contract's one pure seam: the `response.create` payload
 * that makes the model SPEAK exactly one scripted line and then stop. With the
 * session's `create_response: false`, this is the only thing that ever makes the
 * model talk, so it must always carry the line verbatim and never ask for a
 * free-form response.
 */
describe('speakLinePayload', () => {
  it('builds a response.create that carries the exact line', () => {
    const line = 'horror, comedy, or crime?';
    const p = speakLinePayload(line);
    expect(p.type).toBe('response.create');
    expect(p.response.instructions).toContain(line);
    // It instructs the model to stop and listen, not to author a new question.
    expect(p.response.instructions.toLowerCase()).toContain('word-for-word');
  });
});
