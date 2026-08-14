/**
 * LIVE DNA PROGRESS — real metrics only, moved only by persistence.
 *
 * The owner's constraint was explicit: audit the REAL DNA
 * completeness/confidence/strength metric, use THAT, and never invent a
 * "+DNA" number. The canonical numeric metrics in this product are DNA
 * Confidence (`computeDnaConfidence` — the DNA hub's own figure) and the
 * finite onboarding progress (`calibrationProgress` — the grid's own n/20).
 * These tests pin that the meter consumes exactly those, through a server
 * fold of persisted rows, and that nothing optimistic can move it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('the endpoint is a pure server fold of REAL metrics', () => {
  const route = read('src/app/api/dna-progress/route.ts');

  it('serves computeDnaConfidence (via loadDnaConfidence) and calibrationProgress — nothing else', () => {
    expect(route).toContain('loadDnaConfidence');
    expect(route).toContain('calibrationProgress');
    expect(route).toContain('countCalibrationAnswers');
  });

  it('never invents arithmetic — the numbers pass through untouched', () => {
    expect(route).toContain('percent: confidence.percent');
    expect(route).toContain('tier: confidence.tier');
    // No +N bonuses, no client-pleasing rounding, no synthetic increments.
    expect(route).not.toMatch(/percent\s*[+\-*]/);
  });
});

describe('the meter changes only when persisted state changes', () => {
  const meter = read('src/components/onboarding/DnaProgressMeter.tsx');

  it('reads from the server endpoint and does no local math on the metric', () => {
    expect(meter).toContain('/api/dna-progress');
    expect(meter).not.toMatch(/percent\s*\+\s*\d/);
  });

  it('refetches on the announce event — the only trigger besides mount', () => {
    expect(meter).toContain("DNA_CHANGED_EVENT = 'wv:dna-changed'");
    expect(meter).toContain('addEventListener(DNA_CHANGED_EVENT');
  });

  it('renders nothing rather than a made-up zero before evidence arrives', () => {
    expect(meter).toContain('if (!progress) return null');
  });

  it('is in-flow, never an overlay that could cover cards', () => {
    // Class-level check: no positioning class may take the meter out of flow
    // (the word "fixed" in prose is fine; `className="… fixed …"` is not).
    expect(meter).not.toMatch(/className="[^"]*\b(?:fixed|absolute|sticky)\b/);
  });
});

describe('announcers fire only on persisted writes', () => {
  it('the genre step announces only when the action reported ok', () => {
    const cmp = read('src/components/onboarding/GenreCalibration.tsx');
    expect(cmp.match(/if \(r\.ok\) announceDnaChanged\(\)/g)?.length).toBe(2);
  });

  it('the grid announces only when at least one write landed', () => {
    const grid = read('src/components/TitleGridCalibration.tsx');
    expect(grid).toContain('if (results.some((r) => r.ok)) announceDnaChanged()');
  });
});

describe('the meter is visible during both onboarding steps', () => {
  it('the taste-quiz page mounts it above the step content', () => {
    const page = read('src/app/app/taste-quiz/page.tsx');
    const meterAt = page.indexOf('<DnaProgressMeter');
    const stepsAt = page.indexOf('showGenres ?');
    expect(meterAt).toBeGreaterThan(-1);
    expect(meterAt).toBeLessThan(stepsAt);
  });
});
