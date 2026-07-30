import { describe, it, expect } from 'vitest';
import { coachFor, MIN_FOR_VERDICT, shouldRetire } from './wOnboarding';

const base = { selected: 0, everSelected: false, dismissed: false, isFirstOnPage: true };

describe('the first-timer is taught the control', () => {
  it('a brand-new user is told what the W does', () => {
    const c = coachFor(base);
    expect(c.step).toBe('explain');
    expect(c.text).toMatch(/Tap W to add this title/i);
  });

  it('and only the FIRST W on the page says it — a grid does not sprout thirty tooltips', () => {
    expect(coachFor({ ...base, isFirstOnPage: false }).step).toBe('none');
  });
});

describe('after the first selection it explains the GOAL, not the control', () => {
  it('one selected says how many more unlock the gavel', () => {
    const c = coachFor({ ...base, selected: 1, everSelected: true });
    expect(c.step).toBe('progress');
    expect(c.text).toBe(`1 selected — choose at least ${MIN_FOR_VERDICT} to unlock the gavel.`);
  });

  it('the count is real at every step below the minimum', () => {
    for (let n = 1; n < MIN_FOR_VERDICT; n++) {
      expect(coachFor({ ...base, selected: n, everSelected: true }).text).toContain(`${n} selected`);
    }
  });
});

describe('it stops once the user has understood', () => {
  it('goes quiet at the minimum — the gavel itself is now the signal', () => {
    expect(coachFor({ ...base, selected: MIN_FOR_VERDICT, everSelected: true }).step).toBe('none');
  });

  it('never returns once dismissed', () => {
    expect(coachFor({ ...base, dismissed: true }).step).toBe('none');
    expect(coachFor({ ...base, selected: 2, everSelected: true, dismissed: true }).step).toBe('none');
  });

  it('a returning user with an empty docket is not re-taught what a W is', () => {
    expect(coachFor({ ...base, everSelected: true }).step).toBe('none');
  });

  it('retires permanently once a full docket has been assembled', () => {
    expect(shouldRetire(MIN_FOR_VERDICT - 1)).toBe(false);
    expect(shouldRetire(MIN_FOR_VERDICT)).toBe(true);
    expect(shouldRetire(MIN_FOR_VERDICT + 4)).toBe(true);
  });
});

describe('the copy is the copy that was asked for', () => {
  it('names the W and the decision, not jargon', () => {
    const c = coachFor(base);
    expect(c.text).toContain('W');
    expect(c.text.toLowerCase()).toContain('decision');
  });

  it('names the gavel and the threshold', () => {
    const c = coachFor({ ...base, selected: 1, everSelected: true });
    expect(c.text.toLowerCase()).toContain('gavel');
    expect(c.text).toContain(String(MIN_FOR_VERDICT));
  });
});
