import { describe, it, expect } from 'vitest';
import { youTubeEmbedUrl } from './prefs';

// The storage-backed prefs (getAutoplayPref/setAutoplayPref/trailerFeatureEnabled)
// are DOM-dependent and covered by the real-browser QA; youTubeEmbedUrl is pure
// (URLSearchParams only) and is the one with a correctness contract worth locking.
describe('youTubeEmbedUrl — muted, chromeless, privacy host', () => {
  it('uses the no-cookie host and starts muted when asked', () => {
    const url = youTubeEmbedUrl('abc123', { muted: true, autoplay: true });
    expect(url).toContain('https://www.youtube-nocookie.com/embed/abc123?');
    expect(url).toContain('mute=1');
    expect(url).toContain('autoplay=1');
    expect(url).toContain('controls=0'); // no default YouTube chrome
    expect(url).toContain('enablejsapi=1'); // postMessage mute/unmute/seek
    expect(url).toContain('rel=0'); // no "related videos" from other channels
  });

  it('can build an unmuted URL for an explicit manual play', () => {
    expect(youTubeEmbedUrl('xyz', { muted: false, autoplay: true })).toContain('mute=0');
  });
});
