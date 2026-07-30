import { describe, it, expect } from 'vitest';
import {
  REPORT_TABS,
  DEFAULT_TAB,
  isReportTab,
  initialTab,
  splitContentSignals,
  unknownSummary,
} from './reportTabs';
import type { ContentSignal } from '@/lib/types';

const sig = (label: string, level: ContentSignal['level'], note?: string): ContentSignal =>
  ({ label, level, note: note ?? null }) as ContentSignal;

describe('the tabs', () => {
  it('open on the decision, not on the trivia', () => {
    expect(DEFAULT_TAB).toBe('verdict');
    expect(REPORT_TABS[0]!.id).toBe('verdict');
  });

  it('are few enough to fit a phone without scrolling sideways', () => {
    // Four short words is the budget at 320px. Five was tried and "Recommended"
    // alone took a third of the bar.
    expect(REPORT_TABS).toHaveLength(4);
    for (const t of REPORT_TABS) {
      expect(t.label.length, `"${t.label}" is too long for the bar`).toBeLessThanOrEqual(8);
      expect(t.hint.length, `"${t.label}" has no accessible hint`).toBeGreaterThan(8);
    }
  });

  it('are split by the QUESTION somebody arrives with', () => {
    expect(REPORT_TABS.map((t) => t.id)).toEqual(['verdict', 'details', 'watch', 'similar']);
  });

  it('can be deep-linked, and a nonsense link still lands somewhere real', () => {
    expect(initialTab('watch')).toBe('watch');
    expect(initialTab('similar')).toBe('similar');
    for (const junk of [null, undefined, '', 'nope', 'VERDICT', '../etc']) {
      expect(initialTab(junk), JSON.stringify(junk)).toBe(DEFAULT_TAB);
    }
  });

  it('validates a tab id without trusting the caller', () => {
    expect(isReportTab('details')).toBe(true);
    expect(isReportTab('Details')).toBe(false);
    expect(isReportTab(null)).toBe(false);
  });
});

describe('content & tone', () => {
  const SIGNALS = [
    sig('Violence', 'moderate'),
    sig('Gore', 'unknown'),
    sig('Sex & Nudity', 'unknown'),
    sig('Language', 'unknown'),
    sig('Drug Use', 'unknown'),
    sig('Disturbing Themes', 'unknown'),
    sig('Supernatural Intensity', 'none'),
    sig('Pacing', 'moderate'),
    sig('Mystery Complexity', 'high', 'Puzzle-Forward'),
    sig('Humor', 'low', 'Limited / Situational'),
  ];

  it('keeps every signal we actually determined', () => {
    const { known } = splitContentSignals(SIGNALS);
    expect(known.map((s) => s.label)).toEqual([
      'Violence',
      'Supernatural Intensity',
      'Pacing',
      'Mystery Complexity',
      'Humor',
    ]);
  });

  it('collapses the ones we could not — half a screen of identical grey tiles', () => {
    const { unknown } = splitContentSignals(SIGNALS);
    expect(unknown).toHaveLength(5);
  });

  it('LOSES NOTHING — every signal is still accounted for', () => {
    const { known, unknown } = splitContentSignals(SIGNALS);
    expect(known.length + unknown.length).toBe(SIGNALS.length);
    expect(new Set([...known, ...unknown].map((s) => s.label)).size).toBe(SIGNALS.length);
  });

  it('names them rather than hiding them behind a count', () => {
    const { unknown } = splitContentSignals(SIGNALS);
    const line = unknownSummary(unknown)!;
    expect(line).toContain('Gore');
    expect(line).toContain('Sex & Nudity');
    expect(line).toContain('3 others');
    // The honesty claim survives the compaction.
    expect(line).toMatch(/rather than guess/);
  });

  it('reads correctly for one, two and many', () => {
    expect(unknownSummary([sig('Gore', 'unknown')])).toMatch(/^Gore is not rated/);
    expect(unknownSummary([sig('Gore', 'unknown'), sig('Language', 'unknown')])).toMatch(
      /^Gore and Language are not rated/,
    );
    expect(
      unknownSummary([sig('A', 'unknown'), sig('B', 'unknown'), sig('C', 'unknown')]),
    ).toMatch(/^A, B and 1 other are not rated/);
  });

  it('says nothing at all when everything is known', () => {
    expect(unknownSummary([])).toBeNull();
    const { unknown } = splitContentSignals([sig('Violence', 'moderate')]);
    expect(unknownSummary(unknown)).toBeNull();
  });
});
