/**
 * Client-side trailer preferences + a tiny client cache — no server round-trip,
 * works signed-out, persists across sessions.
 *
 * Autoplay is OFF-by-default at the FLAG level (Smart Trailer Preview is opt-in
 * via `?trailers=1` for now, rolling founder → all). This preference controls,
 * for users who have the feature, whether trailers autoplay or wait for a tap.
 * "off" must truly prevent automatic playback (manual play still works).
 */

const PREF_KEY = 'wv.trailer.autoplay.v1';
export type AutoplayPref = 'on' | 'off';

export function getAutoplayPref(): AutoplayPref {
  try {
    return localStorage.getItem(PREF_KEY) === 'off' ? 'off' : 'on';
  } catch {
    return 'on'; // private mode / no storage — default to on (still muted, still gated)
  }
}

export function setAutoplayPref(v: AutoplayPref): void {
  try {
    localStorage.setItem(PREF_KEY, v);
    // Let same-tab listeners react (storage event only fires cross-tab).
    window.dispatchEvent(new CustomEvent('wv-trailer-pref', { detail: v }));
  } catch {
    /* ignore */
  }
}

/** SSR-safe reduced-motion check (mirrors useVerdictReveal's pattern). */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Is Smart Trailer Preview enabled for this page load?
 *
 * Opt-in for now: `?trailers=1` turns it on (like the `?ai=1` pattern), and a
 * remembered opt-in persists. `?trailers=0` force-disables. When the rollout
 * reaches everyone this becomes a constant `true`. Kept here so exactly one
 * place decides, and the default (feature absent) is a zero-risk poster.
 */
const OPT_IN_KEY = 'wv.trailer.optin.v1';
export function trailerFeatureEnabled(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('trailers');
    if (q === '1') {
      try { localStorage.setItem(OPT_IN_KEY, '1'); } catch { /* ignore */ }
      return true;
    }
    if (q === '0') {
      try { localStorage.removeItem(OPT_IN_KEY); } catch { /* ignore */ }
      return false;
    }
    return localStorage.getItem(OPT_IN_KEY) === '1';
  } catch {
    return false;
  }
}

/** The muted, chromeless YouTube embed URL for a resolved trailer video id. */
export function youTubeEmbedUrl(videoId: string, opts: { muted: boolean; autoplay: boolean; origin?: string }): string {
  const p = new URLSearchParams({
    autoplay: opts.autoplay ? '1' : '0',
    mute: opts.muted ? '1' : '0',
    controls: '0',
    modestbranding: '1',
    rel: '0',
    playsinline: '1',
    fs: '0',
    disablekb: '1',
    enablejsapi: '1', // lets us mute/unmute/seek via postMessage without the full YT SDK
  });
  // The page origin authorizes the JS API — without it YouTube may ignore
  // postMessage commands, and the commands are the ONLY way audio may change
  // (a mute baked into this URL restarts the iframe when it changes).
  if (opts.origin) p.set('origin', opts.origin);
  return `https://www.youtube-nocookie.com/embed/${videoId}?${p.toString()}`;
}
