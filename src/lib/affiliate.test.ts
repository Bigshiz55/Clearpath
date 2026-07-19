import { describe, it, expect } from 'vitest';
import { affiliateLink, hasAffiliate, isHttpUrl, outHref } from './affiliate';

describe('affiliateLink', () => {
  it('tags Amazon / Prime Video links with the associates tag', () => {
    expect(affiliateLink('https://www.primevideo.com/detail/0ABC', { amazonTag: 'watchverdict-20' }))
      .toContain('tag=watchverdict-20');
    expect(affiliateLink('https://www.amazon.com/dp/B000', { amazonTag: 'wv-20' }))
      .toContain('tag=wv-20');
  });

  it('tags Apple TV links with at (and optional ct)', () => {
    const out = affiliateLink('https://tv.apple.com/us/movie/foo/umc.1', { appleToken: '1001lABC', appleCampaign: 'title' });
    expect(out).toContain('at=1001lABC');
    expect(out).toContain('ct=title');
  });

  it('leaves unknown hosts untouched', () => {
    const url = 'https://www.netflix.com/title/80100172';
    expect(affiliateLink(url, { amazonTag: 'wv-20', appleToken: 'x' })).toBe(url);
  });

  it('does nothing when no tag is configured', () => {
    const url = 'https://www.amazon.com/dp/B000';
    expect(affiliateLink(url, {})).toBe(url);
  });

  it('returns the input unchanged for invalid URLs', () => {
    expect(affiliateLink('not a url', { amazonTag: 'wv-20' })).toBe('not a url');
  });

  it('replaces an existing tag rather than duplicating it', () => {
    const out = affiliateLink('https://www.amazon.com/dp/B000?tag=old-20', { amazonTag: 'new-20' });
    expect(out).toContain('tag=new-20');
    expect(out).not.toContain('old-20');
  });
});

describe('hasAffiliate', () => {
  it('is true when any network is set', () => {
    expect(hasAffiliate({ amazonTag: 'x' })).toBe(true);
    expect(hasAffiliate({ appleToken: 'y' })).toBe(true);
    expect(hasAffiliate({})).toBe(false);
  });
});

describe('isHttpUrl', () => {
  it('accepts http(s) and rejects everything else', () => {
    expect(isHttpUrl('https://x.com')).toBe(true);
    expect(isHttpUrl('http://x.com')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('data:text/html,x')).toBe(false);
    expect(isHttpUrl('nope')).toBe(false);
  });
});

describe('outHref', () => {
  it('builds a first-party /api/out link with attribution params', () => {
    const href = outHref({ u: 'https://www.netflix.com/title/1', p: 'Netflix', t: 'flatrate', m: 'movie', id: 42 });
    expect(href.startsWith('/api/out?')).toBe(true);
    expect(href).toContain(`u=${encodeURIComponent('https://www.netflix.com/title/1')}`);
    expect(href).toContain('p=Netflix');
    expect(href).toContain('t=flatrate');
    expect(href).toContain('id=42');
  });

  it('passes through a non-http destination unchanged', () => {
    expect(outHref({ u: 'mailto:x@y.com' })).toBe('mailto:x@y.com');
  });
});
