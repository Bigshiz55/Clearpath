/**
 * A COMPARISON THAT ONLY HALF-RAN MUST SAY WHICH HALF.
 *
 * THE DEPLOYED REPRODUCTION (taste-dna-proof, 2026-08-20). "I want something
 * darker than Taken." resolved its anchor, but Taken itself carried no cached
 * fingerprint — `authority: 0` — so every anchor-derived instruction
 * contributed nothing and ONLY the stated direction ranked. `applied` was
 * true (the stated axis genuinely moved candidates, which is the
 * `statedAxisAuthority` repair working as designed), so the `!applied`
 * disclosure never fired, and the response presented a direction-only ranking
 * as though it had been compared with Taken. The proof's floor contract
 * failed on exactly that: the head matched the unconstrained floor and
 * nothing was disclosed.
 *
 * "Darker than X" is two claims. When we can honour only one of them, the
 * honest answer says so — same principle as the silent-degradation notes:
 * never present a degraded answer as the thing that was asked for.
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

/** "darker than Taken" with the anchor resolved but unfingerprinted. */
const statedOnly: CriticPlan = {
  relation: 'like_but',
  authority: 0,
  instructions: [
    { axis: 'darkness', kind: 'improve', target: 80, strength: 0.95, evidence: ['request'] },
  ],
};

describe('the facts the disclosure hangs on', () => {
  it('authority 0 with a live stated axis still applies — that is the half that ran', () => {
    const ranked = rankCriticCandidates(
      [
        { id: 1, mediaType: 'movie', generalScore: 90, matchScore: 90, dims: dims(20) },
        { id: 2, mediaType: 'movie', generalScore: 88, matchScore: 88, dims: dims(85) },
      ],
      statedOnly,
    );
    expect(ranked.applied).toBe(true);
    expect(ranked.authority, 'the half that did NOT run, as a fact on the result').toBe(0);
  });
});

describe('the route says which half ran', () => {
  it('discloses partial application when the anchor contributed nothing', () => {
    // The branch: applied, but zero anchor authority with anchors present.
    expect(route).toMatch(/else if \(ranked\.authority === 0 && criticState\.objective\.anchors\.length > 0\)/);
    expect(route).toMatch(/compare against directly/);
  });

  it('the note is a critic note, so `disclosed` reports it as a fact', () => {
    /* `diagnostics.critic.disclosed` is `criticNotes.length > 0`, and the
       interpretation array carries the notes to every caller — both already
       pinned by silentDegradation.test.ts. This pins that the new sentence
       joins THAT channel rather than inventing a parallel one. */
    const branch = route.slice(
      route.indexOf('ranked.authority === 0 && criticState.objective.anchors.length > 0'),
      route.indexOf('return NextResponse.json(', route.indexOf('ranked.authority === 0')),
    );
    expect(branch).toMatch(/criticNotes\.push\(/);
  });

  it('full application stays silent — a working comparison needs no caveat', () => {
    /* The branch must be an else-if on the applied path, gated on zero
       authority: a comparison whose anchor DID contribute must not acquire a
       hedge. The regex above pins the exact condition; this pins that it is
       chained behind the !applied branch rather than free-standing. */
    expect(route).toMatch(/\} else if \(ranked\.authority === 0/);
  });
});
