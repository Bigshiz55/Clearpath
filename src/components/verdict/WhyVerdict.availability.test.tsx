import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WhyVerdict, type WhyVerdictData } from './WhyVerdict';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * A MISSING PROVIDER NAME MAY SUPPRESS THE CHIP. IT MAY NEVER CRASH THE PAGE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * THE DEFECT. `WhyVerdict` renders the availability row through
 * `<ProviderChip data={{ name: data.availability.service }}>`, ProviderChip
 * calls `resolveProviderBrand({ name })`, and `officialProviderName` calls
 * `name.trim()`. An availability object carrying no usable `service` therefore
 * threw `TypeError: Cannot read properties of undefined (reading 'trim')`
 * DURING RENDER — so React unwound to the nearest error boundary and the whole
 * recommendation page became "Something went wrong". Not a missing logo: no
 * results at all. It failed all eight cases in
 * `tests/mobile/wired-experience.spec.ts`.
 *
 * WHICH SIDE VIOLATED THE CONTRACT? Both, in different senses, and the answer
 * decided the shape of the fix:
 *
 *   • THE PRODUCER IS CORRECT AND ALWAYS HAS BEEN. `buildItemExplanation`
 *     (src/lib/finderExplain.ts) only builds an `availability` at all when
 *     `f.where` is a non-empty string, and `explainVerdict`
 *     (src/lib/verdictExplain.ts) then fills `service`, `access` and `logoPath`
 *     from the provider registry. A response from the current server can never
 *     carry availability without a service.
 *
 *   • THE CONSUMER'S ASSUMPTION IS STILL UNSOUND. `WhyVerdictData` is not a
 *     value handed across a function call — it is JSON deserialized from
 *     `/api/finder`. `service`, `logoPath` and `access` were ADDED to that
 *     payload after the field was introduced, so an older shape is a real
 *     historical artifact, not a hypothetical: a client running new code
 *     against an older deployment mid-rollout, a cached response, or a
 *     replayed fixture produces exactly it. TypeScript never caught the gap
 *     because the JSON boundary is untyped.
 *
 * So the type now says what is actually true at that boundary — the three
 * fields are optional — which makes the compiler require the guard rather than
 * leaving it to a reviewer to notice. The chip is suppressed when identity is
 * absent, and the honest non-provider facts (access, confidence, the resolved
 * text) still render, because they are things we genuinely know.
 *
 * These tests were written to FAIL against the code as shipped.
 */

function data(availability: WhyVerdictData['availability']): WhyVerdictData {
  return {
    rose: ['Strong personal fit (88 match).'],
    heldBack: ['Darker than your usual weeknight choice'],
    requirements: [{ label: 'Movie', satisfied: true, evidence: 'feature film' }],
    availability,
    confidence: { level: 'high', because: ['Personal taste signal available.'] },
  };
}

const render = (d: WhyVerdictData) => renderToStaticMarkup(<WhyVerdict data={d} />);

describe('WhyVerdict — the availability row', () => {
  it('renders the provider chip when the service is present (the current producer shape)', () => {
    const html = render(
      data({
        text: 'Netflix · Included with subscription',
        confidence: 'likely',
        service: 'Netflix',
        logoPath: '/netflix.jpg',
        access: 'Included with subscription',
      }),
    );
    expect(html).toContain('Netflix');
    expect(html).toContain('Included with subscription');
    expect(html).toContain('likely');
  });

  it('DOES NOT CRASH when availability exists but carries no service', () => {
    // The legacy payload shape, exactly as it still appears in the
    // wired-experience fixtures: text + confidence and nothing else.
    const legacy = { text: 'Netflix · Included with subscription', confidence: 'likely' } as WhyVerdictData['availability'];
    expect(() => render(data(legacy))).not.toThrow();
  });

  it('keeps the honest non-provider facts when the service is missing', () => {
    const legacy = { text: 'Netflix · Included with subscription', confidence: 'likely' } as WhyVerdictData['availability'];
    const html = render(data(legacy));
    // The row is still there and still says what we actually know.
    expect(html).toContain('Netflix · Included with subscription');
    expect(html).toContain('likely');
  });

  it('does not crash, and invents nothing, on a BLANK service', () => {
    const html = render(
      data({ text: 'Somewhere · Rental', confidence: 'likely', service: '   ', logoPath: null, access: 'Rental' }),
    );
    expect(html).toContain('Rental');
    // Never a fabricated brand: no logo element for an identity we do not have.
    expect(html).not.toContain('brand-mark');
  });

  it('does not crash on a null service', () => {
    expect(() =>
      render(data({ text: 'Somewhere · Rental', confidence: 'likely', service: null, logoPath: null, access: 'Rental' })),
    ).not.toThrow();
  });

  it('renders the panel with no availability at all', () => {
    const html = render(data(null));
    expect(html).toContain('Why it matched');
    expect(html).not.toContain('brand-mark');
  });

  it('never invents a logo for a service we hold no verified asset for', () => {
    const html = render(
      data({
        text: 'Some Regional Service · Rental',
        confidence: 'likely',
        service: 'Some Regional Service',
        logoPath: null,
        access: 'Rental',
      }),
    );
    expect(html).toContain('Some Regional Service');
    expect(html).not.toContain('brand-mark');
  });
});
