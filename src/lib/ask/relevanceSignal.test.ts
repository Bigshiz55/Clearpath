/**
 * THE RANKING HAD NO TERM FOR WHAT WAS ASKED.
 *
 * `rankScore` was quality plus what we know about the reader. The measurement
 * that started this reported a median winning margin of ONE point across sixty
 * cells — and the reason was not that the quality scale is too narrow. It is
 * that two candidates which answer the request very differently were being
 * separated only by a number about how good they are.
 *
 * `evaluateSubjectCentrality` has produced a per-candidate 0..100 on exactly
 * that question since the subject gate was written, and it was used to filter
 * and to display and never to order.
 *
 * These pin the four properties that make the channel safe: it is centred on
 * the field so it cannot inflate an answer, it is bounded below the personal
 * ceiling, it is silent when the request draws no distinction, and it never
 * touches the quality number the card shows.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { relevanceSignals, RELEVANCE_NUDGE_MAX, type RelevanceInput } from './relevanceSignal';
import { PERSONAL_NUDGE_CEILING } from './personalSignal';

const ROOT = join(__dirname, '..', '..', '..');

const at = (...cs: (number | null)[]): RelevanceInput[] =>
  cs.map((c) => ({ confidence: c, centrality: c === null ? null : c >= 80 ? 'CENTRAL' : 'MATERIAL' }));

describe('it separates candidates the request separates', () => {
  it('the title squarely about the subject outranks the one that merely mentions it', () => {
    const [strong, weak] = relevanceSignals(at(95, 80));
    expect(strong!.nudge).toBeGreaterThan(0);
    expect(weak!.nudge).toBeLessThan(0);
    expect(strong!.participated).toBe(true);
  });

  it('and the movement is large enough to matter against a near tie', () => {
    // The measured median winning margin was 1 point; a channel that cannot
    // cross that is decorative.
    const [strong] = relevanceSignals(at(95, 80, 86, 92));
    expect(Math.abs(strong!.nudge)).toBeGreaterThan(1);
  });
});

describe('it cannot inflate an answer, only reorder one', () => {
  it('the field s average movement is zero', () => {
    const sig = relevanceSignals(at(95, 92, 86, 80, 88));
    const total = sig.reduce((a, s) => a + s.nudge, 0);
    expect(Math.abs(total)).toBeLessThan(1e-9);
  });

  it('a uniformly excellent field moves exactly as much as a uniformly poor one: not at all', () => {
    for (const set of [at(95, 95, 95), at(80, 80, 80)]) {
      expect(relevanceSignals(set).every((s) => s.nudge === 0)).toBe(true);
    }
  });
});

describe('it stays inside its bound, and inside the person s', () => {
  it('never exceeds its own ceiling, however extreme the field', () => {
    for (const s of relevanceSignals(at(100, 0, 50, 99, 1))) {
      expect(Math.abs(s.nudge)).toBeLessThanOrEqual(RELEVANCE_NUDGE_MAX + 1e-9);
    }
  });

  it('is smaller than the personal ceiling — what we know about you weighs more', () => {
    expect(RELEVANCE_NUDGE_MAX).toBeLessThan(PERSONAL_NUDGE_CEILING);
  });
});

describe('it is silent when the request drew no distinction', () => {
  it('no subject was asked → every candidate is inert', () => {
    const sig = relevanceSignals(at(null, null, null, null));
    expect(sig.every((s) => s.nudge === 0 && !s.participated && s.reason === null)).toBe(true);
  });

  it('a single judged candidate cannot be above or below average', () => {
    expect(relevanceSignals(at(95))[0]!.nudge).toBe(0);
    expect(relevanceSignals(at(95, null, null))[0]!.nudge).toBe(0);
  });

  it('a field that agrees to within a point produces nothing rather than magnified noise', () => {
    expect(relevanceSignals(at(90, 90.4, 89.7)).every((s) => s.nudge === 0)).toBe(true);
  });

  it('an unjudged candidate neither moves nor drags the centre', () => {
    const withNull = relevanceSignals(at(95, 80, null));
    const without = relevanceSignals(at(95, 80));
    expect(withNull[2]!.participated).toBe(false);
    expect(withNull[0]!.nudge).toBeCloseTo(without[0]!.nudge, 12);
  });

  it('an empty field is not an error', () => {
    expect(relevanceSignals([])).toEqual([]);
  });
});

describe('what it says, it can substantiate', () => {
  it('names the comparison it actually made, and says nothing when it moved nothing', () => {
    const [strong, weak, middle] = relevanceSignals(at(95, 80, 87.5));
    expect(strong!.reason).toMatch(/more squarely about what you asked/);
    expect(weak!.reason).toMatch(/less squarely/);
    expect(middle!.reason, 'a candidate that barely moved should claim nothing').toBeNull();
  });

  it('exposes no numbers, axes or internals in the copy', () => {
    for (const s of relevanceSignals(at(95, 80))) {
      if (!s.reason) continue;
      expect(s.reason).not.toMatch(/\d|centrality|confidence|nudge|rankScore|subject_/i);
    }
  });
});

/**
 * SILENT DEGRADATION: the channel must fail VISIBLY, not quietly become
 * generic. Each of these is a way the evidence can disappear in production.
 */
describe('when the evidence goes away, the failure is observable', () => {
  it('the subject evaluator returning nothing leaves every candidate inert and SAYS nothing', () => {
    const sig = relevanceSignals(at(null, null, null));
    expect(sig.every((s) => !s.participated)).toBe(true);
    expect(sig.every((s) => s.reason === null), 'a channel with no evidence must not narrate').toBe(true);
  });

  it('participation is reported per candidate, so a partial outage is countable', () => {
    const sig = relevanceSignals(at(95, 80, null, null));
    expect(sig.filter((s) => s.participated)).toHaveLength(2);
    expect(sig.filter((s) => !s.participated)).toHaveLength(2);
  });

  it('the finder reports the channel on every item, so zero movement is visible rather than inferred', () => {
    const finder = readFileSync(join(ROOT, 'src/lib/finder.ts'), 'utf8');
    expect(finder).toMatch(/relevance: \{ nudge: \+rel\.nudge\.toFixed\(2\), participated: rel\.participated, reason: rel\.reason \}/);
  });

  it('the ordering is the only thing it touches — the displayed match is untouched', () => {
    const finder = readFileSync(join(ROOT, 'src/lib/finder.ts'), 'utf8');
    const block = finder.slice(finder.indexOf('const relevance = relevanceSignals('), finder.indexOf('let relaxed'));
    expect(block, 'relevance must never be written into the score the card shows').not.toMatch(/matchScore\s*[+=]/);
    expect(block).toMatch(/personal\.rankScore \+ b\.rel\.nudge/);
  });

  it('a moved candidate carries its reason on the receipt strip', () => {
    const finder = readFileSync(join(ROOT, 'src/lib/finder.ts'), 'utf8');
    expect(finder).toMatch(/rel\.reason \? \[\.\.\.item\.receipts, rel\.reason\] : item\.receipts/);
  });
});
