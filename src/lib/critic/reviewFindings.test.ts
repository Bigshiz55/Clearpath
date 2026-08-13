import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { naiveParseQuery } from '@/lib/finderParse';
import { planToHints } from './retrieval';
import { MAX_STRANDS } from './strandBudget';
import { stripAnchorSpans } from './request';

/**
 * THREE DEFECTS FOUND BY REVIEW ON PR #57, each verified before it was believed.
 *
 * All three are in code this workstream wrote, and all three defeat a guarantee
 * the ledger claims in writing. They are pinned here rather than folded into an
 * existing gate file, so the regression is traceable to the review that caught
 * it.
 */

// ───────────────────────────────────────────────────────────────────────────
// 1 · THE UNGATED RECALL FLOOR WAS BEING GATED — by an anchor's own NAME
// ───────────────────────────────────────────────────────────────────────────

describe('review · genre words inside anchor titles must not become filters', () => {
  it('1 · the defect is real: title words parse to positive genreIds', () => {
    /* This is the shipped parser's behaviour and it is not wrong in isolation —
       `naiveParseQuery` cannot know "Supernatural" is a title here. The defect
       was feeding it the WHOLE comparative sentence, anchors included. */
    expect(naiveParseQuery('Better than Supernatural or True Detective').genreIds).toEqual([14, 9648]);
    expect(naiveParseQuery('Better than Funny Games').genreIds).toEqual([35]);
  });

  it('2 · stripping the anchor spans removes the phantom genres', () => {
    const cases: [string, string[]][] = [
      ['Better than Supernatural or True Detective', ['Supernatural', 'True Detective']],
      ['Better than Funny Games', ['Funny Games']],
      ['something like Fantasy Island', ['Fantasy Island']],
    ];
    for (const [text, anchors] of cases) {
      const cleaned = stripAnchorSpans(text, anchors);
      expect(naiveParseQuery(cleaned).genreIds, text).toEqual([]);
    }
  });

  it('3 · a genre the USER genuinely stated still survives', () => {
    /* The fix must not become "ignore genres". Only the anchor's own name is
       removed; everything the sentence actually asks for is untouched. */
    const cleaned = stripAnchorSpans('Better than Supernatural, but a comedy', ['Supernatural']);
    expect(naiveParseQuery(cleaned).genreIds).toEqual([35]); // comedy, stated
  });

  it('4 · a year inside a title was NOT a second defect — checked, not assumed', () => {
    /* An earlier draft of this file claimed the fix also stopped "Blade Runner
       2049" being read as a date bound. It does not, because there was nothing
       to stop: `naiveParseQuery` never extracts a year from that position.
       Pinned as the measured fact rather than deleted, so nobody re-derives the
       same plausible-sounding claim later. */
    const raw = naiveParseQuery('Better than Blade Runner 2049');
    expect(raw.minYear ?? null).toBeNull();
    expect(raw.maxYear ?? null).toBeNull();
  });

  it('5 · the route builds its strand base from the stripped text', () => {
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    const block = route.slice(route.indexOf('0.9) THE CRITIC PATH'), route.indexOf('// 1) Named-title'));
    const code = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).toContain('stripAnchorSpans');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2 · BLEND SILENTLY DROPPED ONE ANCHOR — the exact thing it exists to prevent
// ───────────────────────────────────────────────────────────────────────────

describe('review · blend must not let one anchor fill the strand budget', () => {
  const blendHints = (anchorKeywordIds: number[]) =>
    planToHints({
      relation: 'blend',
      anchors: [],
      plan: undefined,
      hard: { mediaType: 'movie' },
      anchorKeywordIds,
      anchorGenreIds: [53],
    });

  it('6 · the emitted strand count respects the budget', () => {
    /* Before: 10 strands were emitted and `runStrands` sliced to 5, keeping
       recall-floor plus anchor A's first four seeds — anchor B's seeds AND the
       anchor-genres strand were both discarded. The ledger claims per-seed
       strands exist precisely so "the better-tagged side cannot fill the cap
       and drop the other"; the cap reintroduced that failure. */
    const hints = blendHints([101, 102, 103, 104, 105, 106, 201, 202]);
    expect(hints.strands.length).toBeLessThanOrEqual(MAX_STRANDS);
  });

  it('7 · the anchor-genres strand survives a keyword-heavy blend', () => {
    const hints = blendHints([101, 102, 103, 104, 105, 106, 201, 202]);
    expect(hints.strands.map((s) => s.label)).toContain('anchor-genres');
  });

  it('8 · the ungated recall floor always survives', () => {
    const hints = blendHints([101, 102, 103, 104, 105, 106, 201, 202]);
    const floor = hints.strands.find((s) => s.label === 'recall-floor');
    expect(floor).toBeDefined();
    expect(floor!.keywordIds ?? []).toEqual([]);
    expect(floor!.genreIds ?? []).toEqual([]);
  });

  it('9 · seeds from BOTH ends of the list reach the pool', () => {
    /* The route interleaves per anchor, so position in the flattened list
       corresponds to alternating anchors. Whatever the ordering, a seed from
       the tail must not be systematically starved by seeds from the head. */
    const hints = blendHints([101, 201, 102, 202, 103, 203]);
    const seeds = hints.strands.filter((s) => s.keywordIds?.length === 1).flatMap((s) => s.keywordIds!);
    expect(seeds.some((k) => k >= 200), `no tail seed survived: ${seeds}`).toBe(true);
    expect(seeds.some((k) => k < 200), `no head seed survived: ${seeds}`).toBe(true);
  });

  it('10 · every relation stays inside the budget', () => {
    for (const relation of ['like', 'better_than', 'like_but', 'blend'] as const) {
      const hints = planToHints({
        relation,
        anchors: [],
        plan: undefined,
        hard: {},
        anchorKeywordIds: [1, 2, 3, 4, 5, 6, 7, 8],
        anchorGenreIds: [53],
      });
      expect(hints.strands.length, relation).toBeLessThanOrEqual(MAX_STRANDS);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3 · THE ACCLAIM STRAND'S SORT WAS DEAD METADATA
// ───────────────────────────────────────────────────────────────────────────

describe('review · a strand sort must actually reach discovery', () => {
  it('11 · the acclaim strand declares a rating sort', () => {
    const hints = planToHints({
      relation: 'better_than',
      anchors: [],
      plan: undefined,
      hard: {},
      anchorKeywordIds: [],
      anchorGenreIds: [],
    });
    const acclaim = hints.strands.find((s) => s.label === 'acclaim');
    expect(acclaim?.sortBy).toBe('vote_average.desc');
  });

  it('12 · FinderQuery can carry a sort, and runStrands passes it', () => {
    /* Before: `RetrievalStrand.sortBy` existed, nothing read it, and
       `runFinder` hardcoded popularity — so the strand meant to surface what a
       popularity sweep HIDES was itself sorted by popularity. */
    const finder = readFileSync('src/lib/finder.ts', 'utf8');
    expect(finder).toContain('sortBy?:');
    expect(finder).not.toMatch(/sortBy:\s*'popularity\.desc',/);
    const strands = readFileSync('src/lib/critic/strands.ts', 'utf8');
    expect(strands).toContain('s.sortBy');
  });

  it('13 · the default is unchanged when no strand asks for a sort', () => {
    const finder = readFileSync('src/lib/finder.ts', 'utf8');
    // Popularity remains the fallback for every non-critic query.
    expect(finder).toContain("'popularity.desc'");
  });
});
