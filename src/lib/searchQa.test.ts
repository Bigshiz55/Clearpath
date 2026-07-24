import { describe, it, expect } from 'vitest';
import { buildSearchQa, extractReferenceLite } from './searchQa';

describe('buildSearchQa (offline funnel)', () => {
  it('captures a multi-constraint international query as hard constraints', () => {
    const v = buildSearchQa('A Korean thriller with English audio under two hours');
    const kinds = v.hardConstraints.map((c) => `${c.kind}=${c.value}`);
    expect(kinds).toContain('origin_country=KR');
    expect(kinds).toContain('english_audio=required');
    expect(kinds).toContain('runtime_max=120m');
    // English audio is honestly marked as verifiable only against live data.
    expect(v.hardConstraints.find((c) => c.kind === 'english_audio')?.verifiedBy).toBe('live_tmdb');
  });

  it('routes a reference query to similar_to and exposes the reference', () => {
    const v = buildSearchQa('A movie like Rocky on Prime');
    expect(v.parsedIntent).toBe('similar_to');
    expect(v.reference.title?.toLowerCase()).toContain('rocky');
    // Title resolution is a live step — never fabricated offline.
    expect(v.reference.resolvedTitleId).toBeNull();
  });

  it('never fabricates a candidate funnel without live data', () => {
    const v = buildSearchQa('best crime movies on Netflix');
    expect(v.candidateFunnel.beforeFilter).toBeNull();
    expect(v.candidateFunnel.afterFilter).toBeNull();
    expect(v.candidateFunnel.unavailableReason).toMatch(/TMDB/);
    expect(v.retrievalSources.every((s) => s.available === false)).toBe(true);
  });

  it('surfaces a coherent follow-up decision and per-dimension confidence', () => {
    const v = buildSearchQa('A Korean thriller with English audio under two hours');
    // Every dimension the dashboard renders is present and in range.
    for (const d of [v.confidence.intent, v.confidence.metadata, v.confidence.provider, v.confidence.audio, v.confidence.overall]) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
    expect(typeof v.followUp.needed).toBe('boolean');
  });

  it('a bare vague ask is high-confidence (nothing requested to be unsure about)', () => {
    const v = buildSearchQa('something good');
    expect(v.confidence.overall).toBeGreaterThan(0.7);
    expect(v.followUp.needed).toBe(false);
  });

  it('extractReferenceLite pulls the title after a similarity cue', () => {
    expect(extractReferenceLite('something like Knives Out')?.toLowerCase()).toContain('knives out');
    expect(extractReferenceLite('a good movie')).toBeNull();
  });
});
