import { describe, it, expect } from 'vitest';
import { agreementPhrase, buildWhyReasons, concernPhrase, primaryReasons, additionalReasons } from './whyThisTitle';
import { DIMENSIONS } from '@/lib/scoring/dimensions';

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

/**
 * THE INPUT THE CARD ACTUALLY RECEIVES.
 *
 * Every test above hands `buildWhyReasons` prose — 'slower pace', 'grounded
 * thrillers' — that no caller ever produces. `matchHighlights` returns the axis
 * NAME and a separate note, so the deployed chip read "Heads up: Pace", which
 * names the dial without reading it. These build their inputs from the real
 * DIMENSIONS table, so the phrasing can never again be proved against words the
 * product does not use.
 */
describe('the phrases are built from what matchHighlights really returns', () => {
  const paceHigh = DIMENSIONS.find((d) => d.key === 'pacing')!;
  const violence = DIMENSIONS.find((d) => d.key === 'violence')!;

  it('an agreement reads as the thing the title IS, not as the dial name', () => {
    // matchHighlights: { label: 'Pace', note: 'slow burn' }
    expect(agreementPhrase({ label: paceHigh.label, note: paceHigh.low.toLowerCase() })).toBe('slow burn');
    expect(agreementPhrase({ label: paceHigh.label, note: '' })).toBe('pace');
  });

  it('a concern names the axis AND the direction the reader leans', () => {
    // matchHighlights: { label: 'Pace', note: 'you lean fast-paced' }
    const phrase = concernPhrase({ label: paceHigh.label, note: `you lean ${paceHigh.high.toLowerCase()}` });
    expect(phrase).toBe('pace — you lean fast-paced');
    const r = buildWhyReasons({ tasteAgreements: ['slow burn'], tasteConcerns: [phrase], ratedCount: 40 });
    const concern = r.find((x) => x.kind === 'concern')!;
    expect(concern.text).toBe('Heads up: pace — you lean fast-paced');
    // The defect this replaces: a chip that named the dial and said nothing.
    expect(concern.text).not.toBe('Heads up: Pace');
  });

  it('never says the axis twice', () => {
    expect(concernPhrase({ label: violence.label, note: 'you lean tame on content edge' }))
      .toBe('you lean tame on content edge');
  });

  it('degrades to whichever half exists', () => {
    expect(concernPhrase({ label: '', note: 'you lean hopeful' })).toBe('you lean hopeful');
    expect(concernPhrase({ label: 'Tone', note: null })).toBe('tone');
  });

  it('holds for every dimension in the table — no axis produces an empty chip', () => {
    for (const d of DIMENSIONS) {
      for (const end of [d.low, d.high]) {
        expect(agreementPhrase({ label: d.label, note: end.toLowerCase() }).length, d.key).toBeGreaterThan(0);
        const c = concernPhrase({ label: d.label, note: `you lean ${end.toLowerCase()}` });
        expect(c.length, d.key).toBeGreaterThan(0);
        expect(c, d.key).toMatch(/you lean/);
      }
    }
  });
});
