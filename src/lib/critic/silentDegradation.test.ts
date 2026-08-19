/**
 * A COMPARISON THAT RAN AND MOVED NOTHING MUST SAY SO.
 *
 * THE DEFECT, MEASURED AGAINST A REAL DEPLOYMENT AT c5706e6. "I want something
 * darker than Whiplash." and "I want something lighter than Whiplash." came
 * back as the SAME twenty-four titles in the same order — The Godfather,
 * Spider-Man, Shawshank — which is also what that build returns for a request
 * that constrains nothing. Opposite axes, identical answers.
 *
 * The cause is not the comparison layer. GC6 reads candidate fingerprints
 * CACHE-ONLY on purpose (`getCachedDimensions` never classifies), so a title
 * the classifier has not reached contributes nothing and `planNudge` is inert
 * for it. With no candidate fingerprinted, `applied` is false and the order is
 * the quality order. That is correct, and coverage is an ingest problem.
 *
 * What is NOT correct is serving that as though the comparison had been
 * applied. The route already says so when a comparison finds nothing; this is
 * the same sentence for the case where it finds plenty and separates none of
 * it. `applied` is the flag that distinguishes them, and it is measured from
 * the contributions that actually landed rather than from the plan's paperwork.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rankCriticCandidates } from './decide';
import type { CriticPlan } from './plan';
import type { TitleDimensions } from '@/lib/scoring/dimensions';

const ROOT = join(__dirname, '..', '..', '..');
const route = readFileSync(join(ROOT, 'src/app/api/ask/route.ts'), 'utf8');

const dims = (darkness: number): TitleDimensions =>
  ({ darkness, pacing: 50, humor: 50 }) as unknown as TitleDimensions;

const statedAxis: CriticPlan = {
  relation: 'like_but',
  authority: 0,
  instructions: [
    { axis: 'darkness', kind: 'improve', target: 80, strength: 0.8, evidence: ['request'] },
  ],
};

describe('the flag the disclosure hangs on', () => {
  it('is false when not one candidate carries a fingerprint', () => {
    const ranked = rankCriticCandidates(
      [
        { id: 1, mediaType: 'movie', generalScore: 94, matchScore: 94 },
        { id: 2, mediaType: 'movie', generalScore: 80, matchScore: 80 },
      ],
      statedAxis,
    );
    expect(ranked.eligible, 'the plan itself is fine — it is the candidates that are silent').toBe(true);
    expect(ranked.applied).toBe(false);
    expect(ranked.decisions.every((d) => !d.fingerprinted)).toBe(true);
    // …and the order is exactly the quality order, untouched.
    expect(ranked.decisions.map((d) => d.id)).toEqual([1, 2]);
  });

  it('is true as soon as one candidate has something to judge', () => {
    const ranked = rankCriticCandidates(
      [
        { id: 1, mediaType: 'movie', generalScore: 94, matchScore: 94 },
        { id: 2, mediaType: 'movie', generalScore: 88, matchScore: 88, dims: dims(95) },
      ],
      statedAxis,
    );
    expect(ranked.applied).toBe(true);
    expect(ranked.decisions[0]!.id, 'the darker title should have moved up').toBe(2);
  });

  it('counts fingerprinted candidates honestly, so a disclosure can name the reason', () => {
    const ranked = rankCriticCandidates(
      [
        { id: 1, mediaType: 'movie', generalScore: 90, matchScore: 90, dims: dims(20) },
        { id: 2, mediaType: 'movie', generalScore: 88, matchScore: 88 },
        { id: 3, mediaType: 'movie', generalScore: 80, matchScore: 80, dims: dims(90) },
      ],
      statedAxis,
    );
    expect(ranked.decisions.filter((d) => d.fingerprinted).length).toBe(2);
  });
});

describe('the route says so, and says it to everyone', () => {
  it('discloses when the comparison did not move anything', () => {
    expect(route).toMatch(/if \(!ranked\.applied\)/);
    expect(route).toMatch(/couldn't apply/);
    expect(route).toMatch(/didn't separate these titles/);
  });

  it('names the reason from the count rather than guessing at it', () => {
    expect(route).toMatch(/const fingerprinted = ranked\.decisions\.filter\(\(d\) => d\.fingerprinted\)\.length;/);
    expect(route).toMatch(/fingerprinted === 0/);
  });

  /* A NOTE NOBODY RECEIVES IS NOT A DISCLOSURE. `withConv` attaches
     `interpretation` only in conversation mode, so every one of these lines was
     invisible to a single-shot caller — including the deployed proof. */
  it('rides the response whether or not there is a conversation', () => {
    const critic = route.slice(route.indexOf('const criticNotes'), route.indexOf('// 1) Named-title lookup'));
    expect(critic).toMatch(/interpretation: \[\.\.\.convInterpretation, \.\.\.criticNotes\]/);
  });

  it('carries counts-only diagnostics — never a prompt or a reason string', () => {
    const critic = route.slice(route.indexOf('const criticNotes'), route.indexOf('// 1) Named-title lookup'));
    const block = critic.slice(critic.indexOf('diagnostics: {'), critic.indexOf('items: criticItems'));
    expect(block).toMatch(/candidates:/);
    expect(block).toMatch(/fingerprinted/);
    expect(block).toMatch(/applied/);
    expect(block).not.toMatch(/prompt|reasoning|title:/i);
  });
});
