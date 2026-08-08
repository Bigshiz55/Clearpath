import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConfidenceMeter } from './ConfidenceMeter';

/**
 * The dial must be correct on FIRST paint — no flash of an empty ring — because
 * the fill is a CSS transition over a value baked into the markup, not a JS
 * animation. A static render proves the number the user actually receives.
 */
describe('ConfidenceMeter renders', () => {
  it('bakes the percentage into the markup', () => {
    const html = renderToStaticMarkup(<ConfidenceMeter value={0.5} />);
    expect(html).toContain('data-testid="confidence-meter"');
    expect(html).toContain('data-testid="confidence-value"');
    expect(html).toContain('50');
  });

  it('reads as Ready once the completion bar is cleared', () => {
    const html = renderToStaticMarkup(<ConfidenceMeter value={0.96} />);
    expect(html).toContain('Ready');
    expect(html).toContain('96');
  });

  it('clamps a nonsense value instead of drawing garbage', () => {
    const html = renderToStaticMarkup(<ConfidenceMeter value={Number.NaN} />);
    expect(html).toContain('0');
    expect(html).not.toContain('NaN');
  });
});
