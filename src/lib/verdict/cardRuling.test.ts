import { describe, it, expect } from 'vitest';
import { nextRuling, isUndo, rulingFeedback, rulingAria, ruledMessage, RULING_LABEL } from './cardRuling';

/**
 * "Don't like them auto moving the order after you pick. That way you can undo
 * too."
 *
 * Both halves of that are the same bug. The card was removed on tap, so the
 * grid resequenced under your thumb AND there was nothing left to undo with.
 */
describe('a ruling can always be taken back', () => {
  it('tapping the active ruling undoes it', () => {
    expect(nextRuling('for', 'for')).toBeNull();
    expect(nextRuling('against', 'against')).toBeNull();
    expect(isUndo('for', 'for')).toBe(true);
  });

  it('tapping the other side switches without a detour through neutral', () => {
    expect(nextRuling('for', 'against')).toBe('against');
    expect(nextRuling('against', 'for')).toBe('for');
    expect(isUndo('for', 'against')).toBe(false);
  });

  it('the first tap on an unruled card records that ruling', () => {
    expect(nextRuling(null, 'for')).toBe('for');
    expect(nextRuling(null, 'against')).toBe('against');
    expect(isUndo(null, 'for')).toBe(false);
  });

  it('undo then re-rule returns to exactly the same state', () => {
    const after = nextRuling(nextRuling('for', 'for'), 'for');
    expect(after).toBe('for');
  });
});

describe('what each ruling actually teaches', () => {
  it('FOR is a real positive rating, not just a hide', () => {
    const f = rulingFeedback('for');
    expect(f.feedbackType).toBe('seen');
    expect(f.rating).toBe(8);
  });

  it('AGAINST is the permanent not_for_me signal, with no rating of its own', () => {
    const a = rulingFeedback('against');
    // NOT `not_right_now` — that is the mood-decaying signal (weight 0.4) and
    // neither button means it. Mislabelling a durable judgement as a deferral is
    // how someone teaches the recommender something they did not intend.
    expect(a.feedbackType).toBe('not_for_me');
    expect(a.rating).toBeNull();
  });

  it('the two rulings are distinct signals, not one flag', () => {
    expect(rulingFeedback('for').feedbackType).not.toBe(rulingFeedback('against').feedbackType);
    expect(rulingFeedback('for').event).not.toBe(rulingFeedback('against').event);
  });
});

describe('what the card says', () => {
  it('one word per button, so the pair fits side by side at 320px', () => {
    expect(RULING_LABEL.for).toBe('For');
    expect(RULING_LABEL.against).toBe('Against');
    for (const l of Object.values(RULING_LABEL)) expect(l.length).toBeLessThanOrEqual(8);
  });

  it('an unruled button explains what it teaches', () => {
    expect(rulingAria('against', null)).toMatch(/Viewer DNA/);
    expect(rulingAria('for', null)).toMatch(/Viewer DNA/);
  });

  it('a ruled button says how to take it back', () => {
    expect(rulingAria('for', 'for')).toMatch(/undo/i);
    expect(rulingAria('against', 'against')).toMatch(/undo/i);
  });

  it('the other side still reads as a choice, not as ruled', () => {
    expect(rulingAria('against', 'for')).not.toMatch(/undo/i);
  });

  it('an unruled card shows no status line at all', () => {
    expect(ruledMessage(null)).toBeNull();
    expect(ruledMessage('for')).toMatch(/FOR/);
    expect(ruledMessage('against')).toMatch(/AGAINST/);
  });
});
