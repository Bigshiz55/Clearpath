'use client';

import { useCallback, useState } from 'react';

/**
 * The canonical WatchVERD1CT wordmark: "Watch" in white, "VERD" + "CT" in the
 * approved pink, and the "I" rendered as a white numeral 1 that flips in once on
 * first render and again on hover/tap of the logo. The 1 is a real inline glyph
 * (intrinsic width) so it can never collapse to a gap — the failure mode of the
 * old two-face 3D flip on iOS Safari. Reduced motion → a static white 1
 * (handled in CSS: .wv-logo-1 rules).
 *
 * Use this everywhere the brand wordmark appears instead of hard-coding the text.
 */
export function WatchVerdictWordmark({ className = '' }: { className?: string }) {
  // 'in'  → the one-time flip-in on first render
  // 'idle'→ resting (no animation)
  // 'spin'→ a single hover/tap flip
  const [phase, setPhase] = useState<'in' | 'idle' | 'spin'>('in');
  const onEnd = useCallback(() => setPhase('idle'), []);
  const replay = useCallback(() => setPhase((p) => (p === 'idle' ? 'spin' : p)), []);

  return (
    <span
      className={`whitespace-nowrap font-bold tracking-tight text-white ${className}`}
      aria-label="WatchVerdict"
      onMouseEnter={replay}
      onFocus={replay}
    >
      <span aria-hidden="true">
        Watch
        <span className="text-[#ff1493]">
          VERD
          <span className={`wv-logo-1 wv-logo-1--${phase}`} onAnimationEnd={onEnd}>1</span>
          CT
        </span>
      </span>
    </span>
  );
}
