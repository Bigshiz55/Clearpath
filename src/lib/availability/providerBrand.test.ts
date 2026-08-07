import { describe, it, expect } from 'vitest';
import { brandKey, dedupeByBrand } from './providerBrand';
import type { WatchLine } from './watchPresentation';

const line = (p: Partial<WatchLine>): WatchLine => ({
  text: p.text ?? '',
  service: p.service,
  logoPath: p.logoPath,
  badge: p.badge ?? null,
  detail: null,
  verified: null,
  href: p.href ?? null,
  kind: 'streaming',
});

describe('provider brand dedup', () => {
  it('collapses plan variants of one service to a single brand key (by name)', () => {
    const a = line({ service: 'Peacock Premium', text: 'Included with Peacock Premium' });
    const b = line({ service: 'Peacock Premium Plus', text: 'Peacock Premium Plus — premium tier' });
    expect(brandKey(a)).toBe(brandKey(b));
  });

  it('treats two options sharing a TMDB logo as the same brand, whatever the name', () => {
    const a = line({ service: 'Peacock Premium', logoPath: '/peacock.png' });
    const b = line({ service: 'Peacock Premium Plus', logoPath: '/peacock.png' });
    expect(brandKey(a)).toBe(brandKey(b));
  });

  it('never merges genuinely different services', () => {
    expect(brandKey(line({ service: 'Hulu' }))).not.toBe(brandKey(line({ service: 'Peacock' })));
    expect(brandKey(line({ service: 'Prime Video' }))).not.toBe(brandKey(line({ service: 'Apple TV' })));
  });

  it('dedupes to one tile per brand, keeping the first (best-ranked) occurrence', () => {
    const out = dedupeByBrand([
      line({ service: 'Peacock Premium', text: 'Included with Peacock Premium', href: 'a' }),
      line({ service: 'Peacock Premium Plus', text: 'Peacock Premium Plus — premium tier', href: 'b' }),
      line({ service: 'Hulu', text: 'Included with Hulu' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.service).toBe('Peacock Premium'); // first survivor
    expect(out[0]!.href).toBe('a');
    expect(out[1]!.service).toBe('Hulu');
  });

  it('does not merge "Amazon Video" (buy) with "Prime Video" (included) — different brands', () => {
    const out = dedupeByBrand([
      line({ service: 'Amazon Video', text: 'Amazon Video — buy', badge: 'Buy' }),
      line({ service: 'Prime Video', text: 'Included with Prime' }),
    ]);
    // Distinct TMDB provider names → distinct brands → both kept.
    expect(out).toHaveLength(2);
  });
});
