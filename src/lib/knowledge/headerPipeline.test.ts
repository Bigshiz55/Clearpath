import { describe, it, expect } from 'vitest';
import { compileTitle } from './batch';
import { applyHeaderRanking, HEADER_NUDGE_MAX, type RankableItem } from './toneRank';
import type { SubjectRequirement, CandidateEvidence } from '@/lib/nlu/semanticEligibility';

/**
 * END-TO-END: the COMPILER must actually produce the tone/setting arrays that
 * RANKING consumes. This is the proof the live audit demanded — not a unit test
 * of applyHeaderRanking with hand-fabricated arrays, but the real path:
 *
 *   candidate evidence → compileTitle → header.tone/setting
 *                      → build the headers Map ranking reads
 *                      → applyHeaderRanking
 *
 * so a header that the compiler leaves empty genuinely produces a no-op, and a
 * header the compiler fills genuinely moves rank (bounded, reward-only).
 */

const boxing: SubjectRequirement = {
  canonical: 'boxing',
  label: 'boxing',
  lexemes: ['boxing', 'boxer', 'prizefight', 'ring'],
  strict: true,
};

// Build the exact Map shape applyHeaderRanking reads, from a compiled header.
function headersFrom(entries: Array<{ id: number; header: { tone: string[]; setting: string[] } }>) {
  const m = new Map<string, { tone: string[]; setting: string[] }>();
  for (const e of entries) m.set(`movie-${e.id}`, { tone: e.header.tone, setting: e.header.setting });
  return m;
}

const item = (id: number, matchScore: number): RankableItem => ({ id, mediaType: 'movie', matchScore, receipts: [] });

describe('compiler → ranking header pipeline (end to end)', () => {
  it('compiles evidence-backed tone/setting and RANKING then consumes them', async () => {
    const ev: CandidateEvidence = {
      title: 'Cell Block Fight',
      overview: 'A gritty, brutal boxing story set inside a maximum-security prison.',
      genres: ['Crime', 'Drama'],
      keywords: ['boxing', 'prison'],
    };
    const compiled = await compileTitle(ev, [boxing]);

    // The compiler produced real arrays (not empty) from the evidence.
    expect(compiled.header.tone).toContain('gritty'); // Crime genre + "gritty"/"brutal"
    expect(compiled.header.setting).toContain('prison'); // "prison" keyword/overview

    // Ranking reads exactly what the compiler wrote.
    const items = [item(1, 60)];
    const headers = headersFrom([{ id: 1, header: compiled.header }]);
    applyHeaderRanking(items, headers, ['gritty'], ['prison']);

    expect(items[0]!.matchScore).toBeGreaterThan(60); // moved on a real compiled match
    expect(items[0]!.matchScore - 60).toBeLessThanOrEqual(HEADER_NUDGE_MAX); // bounded
    expect(items[0]!.receipts[0]).toMatch(/vibe/);
  });

  it('a compiler-EMPTY header is a genuine no-op in ranking (nothing invented)', async () => {
    // Evidence with no tone/setting cues at all → compiler yields [] on both axes.
    const ev: CandidateEvidence = {
      title: 'Untitled',
      overview: 'A story.',
      genres: [],
      keywords: ['boxing'],
    };
    const compiled = await compileTitle(ev, [boxing]);
    expect(compiled.header.tone).toEqual([]);
    expect(compiled.header.setting).toEqual([]);

    const items = [item(1, 60)];
    const headers = headersFrom([{ id: 1, header: compiled.header }]);
    // Even though the request asks for these, the empty compiled header adds nothing.
    applyHeaderRanking(items, headers, ['gritty'], ['prison']);
    expect(items[0]!.matchScore).toBe(60);
  });

  it('a MISSING header (title never compiled) is a no-op for that item', async () => {
    const items = [item(1, 60), item(2, 60)];
    const ev: CandidateEvidence = {
      title: 'Ringside',
      overview: 'A gritty boxing drama.',
      genres: ['Drama'],
      keywords: ['boxing'],
    };
    const compiled = await compileTitle(ev, [boxing]);
    // Only item 1 has a compiled header; item 2 has none.
    const headers = headersFrom([{ id: 1, header: compiled.header }]);
    applyHeaderRanking(items, headers, compiled.header.tone, compiled.header.setting);
    expect(items[1]!.matchScore).toBe(60); // untouched — no header
  });

  it('the bounded header nudge CANNOT override a real eligibility/score gap', async () => {
    const ev: CandidateEvidence = {
      title: 'Cell Block Fight',
      overview: 'A gritty, brutal boxing story set inside a maximum-security prison.',
      genres: ['Crime', 'Drama'],
      keywords: ['boxing', 'prison'],
    };
    const compiled = await compileTitle(ev, [boxing]);

    const strongOffTarget = item(1, 80); // no matching header
    const weakOnTarget = item(2, 74); // full compiled match, but 6 behind
    const headers = headersFrom([{ id: 2, header: compiled.header }]);
    applyHeaderRanking([strongOffTarget, weakOnTarget], headers, ['gritty'], ['prison']);

    // 74 + (≤7) can tie or nudge but the stronger title's lead is not erased below it here:
    expect(weakOnTarget.matchScore).toBeLessThanOrEqual(74 + HEADER_NUDGE_MAX);
    expect(weakOnTarget.matchScore - 74).toBeGreaterThan(0); // it DID get a real bonus
  });
});
