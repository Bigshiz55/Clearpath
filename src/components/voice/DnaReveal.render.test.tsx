import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DnaReveal } from './DnaReveal';
import type { DnaReveal as DnaRevealPayload } from '@/lib/voice/interview';

/**
 * The reveal is the payoff screen and it renders straight from the engine's
 * payload, so a static render proves the promises it makes: the confidence, the
 * defining axes, the must-haves/dealbreakers, the distinctiveness — AND that the
 * predicted-titles sections vanish rather than showing an empty shell or a
 * fabricated title when the engine leaves them empty (which it always does; the
 * server fills them from the real catalogue).
 */
function reveal(over: Partial<DnaRevealPayload> = {}): DnaRevealPayload {
  return {
    overallConfidence: 0.82,
    distinctiveness: 0.5,
    topCategories: [
      { category: 'crime', label: 'Crime', confidence: 0.9, disposition: 0.8 },
      { category: 'horrorTolerance', label: 'Horror tolerance', confidence: 0.7, disposition: -0.9 },
    ],
    dealBreakers: ['musicals'],
    mustHaves: ['a real twist'],
    predictedLoves: [],
    predictedHates: [],
    hiddenDiscoveries: [],
    ...over,
  };
}

describe('DnaReveal renders', () => {
  it('shows confidence, defining axes, must-haves, dealbreakers and distinctiveness', () => {
    const html = renderToStaticMarkup(<DnaReveal reveal={reveal()} />);
    expect(html).toContain('data-testid="dna-reveal"');
    expect(html).toContain('82'); // overall confidence in the meter
    expect(html).toContain('data-testid="reveal-top-categories"');
    expect(html).toContain('Crime');
    expect(html).toContain('data-testid="reveal-must-haves"');
    expect(html).toContain('a real twist');
    expect(html).toContain('data-testid="reveal-deal-breakers"');
    expect(html).toContain('musicals');
    expect(html).toContain('data-testid="reveal-distinctiveness"');
    expect(html).toContain('Distinctly you');
    expect(html).toContain('50%');
  });

  it('omits predicted-title sections entirely when the engine left them empty', () => {
    const html = renderToStaticMarkup(<DnaReveal reveal={reveal()} />);
    expect(html).not.toContain('data-testid="reveal-predicted-loves"');
    expect(html).not.toContain('data-testid="reveal-predicted-hates"');
  });

  it('shows predicted titles when the caller resolved them', () => {
    const html = renderToStaticMarkup(<DnaReveal reveal={reveal({ predictedLoves: ['Zodiac'] })} />);
    expect(html).toContain('data-testid="reveal-predicted-loves"');
    expect(html).toContain('Zodiac');
  });

  it('does not crash on a bare profile with no strong opinions', () => {
    const html = renderToStaticMarkup(
      <DnaReveal reveal={reveal({ topCategories: [], dealBreakers: [], mustHaves: [], distinctiveness: 0.1 })} />,
    );
    expect(html).toContain('data-testid="dna-reveal"');
    expect(html).toContain('Comfortably mainstream');
  });
});
