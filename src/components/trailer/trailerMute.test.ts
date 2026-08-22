/**
 * UNMUTE MUST NEVER TOUCH PLAYBACK — pinned at the source, the way this repo
 * pins client components (vitest runs in node; cardMedia.test.ts set the
 * pattern).
 *
 * The shipped bug: `muted` state was baked into the iframe src via the
 * `mute=` query param. Toggling it re-rendered a DIFFERENT src string, React
 * wrote it to the attribute, and the browser navigated the iframe to a new
 * document — playback restarted from zero. Worse, the reloaded document said
 * `autoplay=1&mute=0`, which autoplay policy BLOCKS, stranding the user on a
 * paused frame until they pressed play again. The user-visible sequence was
 * exactly: unmute → video stops → press play again.
 *
 * The contract: the src depends only on the video id; ALL audio changes ride
 * the YouTube JS API over postMessage (a click is a user gesture, so
 * unmuting an already-playing muted video is permitted in place).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { youTubeEmbedUrl } from '@/lib/trailer/prefs';

const SRC = readFileSync(join(__dirname, 'TrailerMedia.tsx'), 'utf8');

describe('the iframe src never depends on mute state', () => {
  it('the embed URL is built with muted: true unconditionally, memoized on the video id alone', () => {
    // Mount muted — the only state browsers will autoplay — then postMessage.
    expect(SRC).toMatch(/youTubeEmbedUrl\([^)]*\{\s*muted: true,\s*autoplay: true/);
    // The buggy shape: state variable interpolated into the URL options.
    expect(SRC).not.toMatch(/youTubeEmbedUrl\([^)]*\{\s*muted\s*[,}]/);
    expect(SRC).toMatch(/useMemo\(\s*\(\)\s*=>\s*\(?videoId\s*\?/);
    expect(SRC).toMatch(/\[videoId\]/);
  });

  it('unmute is a postMessage command with side effects OUTSIDE the state updater', () => {
    const toggle = /const toggleMute[\s\S]*?\n  \);/.exec(SRC)?.[0] ?? '';
    expect(toggle).toMatch(/const next = !muted;/);
    expect(toggle).toMatch(/setMuted\(next\);/);
    // Never the updater-function form — StrictMode invokes updaters twice,
    // double-firing the postMessage and the analytics event.
    expect(toggle).not.toMatch(/setMuted\(\s*\(/);
    expect(toggle).toMatch(/command\(next \? 'mute' : 'unMute'\);/);
    // A muted autoplay start can leave the player at volume 0.
    expect(toggle).toMatch(/command\('setVolume', \[100\]\);/);
  });

  it('the iframe load handler performs the JS-API handshake and re-asserts audio state', () => {
    expect(SRC).toMatch(/event: 'listening'/);
    expect(SRC).toMatch(/onLoad/);
  });
});

describe('the embed URL carries the JS-API origin', () => {
  it('youTubeEmbedUrl includes origin when provided and omits it otherwise', () => {
    const withOrigin = youTubeEmbedUrl('abc123', { muted: true, autoplay: true, origin: 'https://example.com' });
    expect(withOrigin).toContain(`origin=${encodeURIComponent('https://example.com')}`);
    const without = youTubeEmbedUrl('abc123', { muted: true, autoplay: true });
    expect(without).not.toContain('origin=');
    // The mechanics the player depends on are unchanged.
    expect(withOrigin).toContain('enablejsapi=1');
    expect(withOrigin).toContain('mute=1');
  });

  it('TrailerMedia passes the page origin so YouTube accepts the commands', () => {
    expect(SRC).toMatch(/origin: typeof window !== 'undefined' \? window\.location\.origin : undefined/);
  });
});

describe('the premium audio control', () => {
  it('uses real icons at a 44px tap target, not emoji at 32px', () => {
    expect(SRC).toMatch(/from 'lucide-react'/);
    expect(SRC).not.toMatch(/🔇|🔊/);
    const mute = /data-testid="trailer-mute"[\s\S]*?<\/button>/.exec(SRC)?.[0] ?? '';
    expect(mute).toMatch(/h-11 w-11/);
    expect(mute).toMatch(/backdrop-blur/);
    expect(mute).toMatch(/rounded-full/);
    expect(mute).toMatch(/border/);
  });

  it('speaks the accessibility vocabulary the design specifies', () => {
    expect(SRC).toMatch(/aria-label=\{muted \? 'Turn sound on' : 'Mute trailer'\}/);
  });

  it('the sound-on state animates, and respects reduced motion', () => {
    expect(SRC).toMatch(/motion-safe:animate-\[wv-wave/);
  });
});
