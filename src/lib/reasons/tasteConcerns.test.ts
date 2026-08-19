import { describe, it, expect } from 'vitest';
import { buildWhyReasons, primaryReasons, additionalReasons } from './whyThisTitle';

/**
 * THE CONCERN WAS COMPUTED, SENT OVER THE WIRE, AND THROWN AWAY.
 *
 * `/api/dna` returns `fit: { agree, clash }` — the axes of a title that agree
 * with what this reader rates highly, AND the axes that clash with it. The card
 * read `agree` and dropped `clash` on the floor, so a reader saw only the case
 * FOR a title and never the honest caution against it.
 *
 * That asymmetry is worse than missing detail: a recommender that can only
 * praise is one a reader learns not to trust. The evidence already exists and
 * is already personal; this is a rendering gap, not a modelling one.
 *
 * A concern is NOT a reason to show the title less — ranking is untouched. It
 * is the honest half of the same explanation, and it ranks last so the case for
 * the title still leads.
 */

describe('taste concerns become reasons', () => {
  it('a clash produces a concern reason', () => {
    const r = buildWhyReasons({ tasteAgreements: ['tense crime stories'], tasteConcerns: ['slower pace'], ratedCount: 40 });
    const concern = r.find((x) => x.kind === 'concern');
    expect(concern, 'the clash never became a reason').toBeDefined();
    expect(concern!.text.toLowerCase()).toContain('slower pace');
  });

  it('the case FOR the title still leads — a concern never outranks it', () => {
    const r = buildWhyReasons({ tasteAgreements: ['grounded thrillers'], tasteConcerns: ['slower pace'], ratedCount: 40 });
    expect(r[0]!.kind, 'a concern displaced the reason it qualifies').toBe('taste');
    const idxTaste = r.findIndex((x) => x.kind === 'taste');
    const idxConcern = r.findIndex((x) => x.kind === 'concern');
    expect(idxConcern).toBeGreaterThan(idxTaste);
  });

  it('NO personal evidence means no concern — the card must not invent one', () => {
    const r = buildWhyReasons({ ratedCount: 0, tasteConcerns: ['slower pace'] });
    expect(r.find((x) => x.kind === 'concern'), 'a concern was claimed with no rated history').toBeUndefined();
  });

  it('an empty clash list produces nothing rather than boilerplate', () => {
    const r = buildWhyReasons({ tasteAgreements: ['grounded thrillers'], tasteConcerns: [], ratedCount: 40 });
    expect(r.find((x) => x.kind === 'concern')).toBeUndefined();
  });

  it('at most one concern reaches the card — this is a card, not an audit', () => {
    const r = buildWhyReasons({
      tasteAgreements: ['grounded thrillers'],
      tasteConcerns: ['slower pace', 'bleaker than your usual', 'much longer'],
      ratedCount: 40,
    });
    expect(r.filter((x) => x.kind === 'concern')).toHaveLength(1);
  });

  it('the concern is reachable by the reader, not buried past the fold', () => {
    const r = buildWhyReasons({ tasteAgreements: ['grounded thrillers'], tasteConcerns: ['slower pace'], ratedCount: 40 });
    const visible = [...primaryReasons(r), ...additionalReasons(r)];
    expect(visible.some((x) => x.kind === 'concern')).toBe(true);
  });
});
