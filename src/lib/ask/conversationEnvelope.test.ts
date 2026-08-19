/**
 * THE ENVELOPE ADDS CONTEXT — IT DOES NOT GET TO ERASE THE ANSWER.
 *
 * `withConv` attaches the conversation state to any response. Both
 * `interpretation` and `clarify` sat AFTER the spread, so in conversation mode
 * the envelope silently overwrote whatever the branch had decided. Review
 * caught two live consequences at once, and they are the same bug:
 *
 *   • the statement boundary's acknowledgement was replaced by `convClarify`
 *     (null), so mid-conversation "My wife likes comedies." fell through to
 *     the client's fallback — "Which title did you mean?" — for a sentence
 *     that named no title at all;
 *   • the critic's "none of these has a profile yet, so this is ranked by
 *     quality" note was replaced by the conversation's own lines, so the
 *     disclosure vanished in exactly the mode a real user is most likely to be
 *     in. A note nobody receives is not a disclosure, whichever mode drops it.
 *
 * These pin the merge semantics on the real route source, because the defect
 * was in the ORDER of two object keys and nothing about it is visible from a
 * unit of behaviour further down.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const route = readFileSync(join(ROOT, 'src/app/api/ask/route.ts'), 'utf8');
const envelope = route.slice(route.indexOf('const withConv ='), route.indexOf("// 0.5) A question about the USER'S OWN"));

describe('the conversation envelope merges', () => {
  it("keeps the branch's own clarify when it set one", () => {
    expect(envelope).toMatch(/clarify: payload\.clarify \?\? convClarify/);
    expect(envelope, 'clarify is being overwritten again').not.toMatch(/clarify: convClarify,/);
  });

  it("appends the branch's own interpretation instead of replacing it", () => {
    expect(envelope).toMatch(/interpretation: \[\.\.\.convInterpretation, \.\.\.own\.filter/);
    expect(envelope, 'interpretation is being overwritten again').not.toMatch(/interpretation: convInterpretation,/);
  });

  it('dedupes, because the critic path builds a list that already contains the conversation lines', () => {
    expect(envelope).toMatch(/!convInterpretation\.includes\(line\)/);
  });

  it('is inert outside conversation mode — a single-shot response is returned untouched', () => {
    expect(envelope).toMatch(/if \(!\(conversational && convState\)\) return payload;/);
  });
});

/** The same merge, exercised as arithmetic rather than as a source match. */
function merge(
  payload: Record<string, unknown>,
  conv: { lines: string[]; clarify: string | null },
): Record<string, unknown> {
  const own = Array.isArray(payload.interpretation) ? (payload.interpretation as string[]) : [];
  return {
    ...payload,
    interpretation: [...conv.lines, ...own.filter((l) => !conv.lines.includes(l))],
    clarify: payload.clarify ?? conv.clarify,
  };
}

describe('what the merge produces', () => {
  it('a statement keeps its acknowledgement even when the turn clarifies nothing', () => {
    const out = merge(
      { kind: 'clarify', clarify: 'Noted — comedies for whoever’s watching with you. What are you in the mood for?', items: [] },
      { lines: ['Added comedy.'], clarify: null },
    );
    expect(out.clarify).toMatch(/^Noted —/);
  });

  it('a turn that DOES clarify still gets its question when the branch set none', () => {
    const out = merge({ kind: 'search', items: [] }, { lines: [], clarify: 'Which Taken did you mean?' });
    expect(out.clarify).toBe('Which Taken did you mean?');
  });

  it('the critic note survives, once, alongside the conversation lines', () => {
    const conv = ['Added thriller.'];
    const note = 'I couldn’t apply "Whiplash" to these — none of them has a profile on file yet, so this is ranked by quality.';
    const out = merge({ kind: 'search', interpretation: [...conv, note] }, { lines: conv, clarify: null });
    expect(out.interpretation).toEqual([...conv, note]);
  });

  it('a payload that says nothing is exactly the conversation lines', () => {
    expect(merge({ kind: 'search' }, { lines: ['Added drama.'], clarify: null }).interpretation).toEqual(['Added drama.']);
  });
});
