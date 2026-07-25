/**
 * The OFFICIAL brand tagline — "THOUSANDS OF TITLES. ONE VERD1CT." — with the
 * VERD1CT glyph baked in: "verd1ct" is pink (the wordmark colour) with the
 * signature numeral 1 (same styling family as the logo's split-flap 1), while
 * "thousands of titles" is muted so the thousands→one contrast lands.
 * Decorative styling is aria-hidden; the whole thing reads as plain
 * "Thousands of titles. One verdict." for assistive tech and search.
 * Alignment/size come from `className` (logo lockup on the left, or a centered
 * eyebrow). Use this component everywhere the tagline appears — never hand-roll
 * an unofficial variation.
 */
export function Tagline({ className = '' }: { className?: string }) {
  return (
    <p className={`font-bold tracking-tight ${className}`} aria-label="Thousands of titles. One verdict.">
      <span aria-hidden>
        <span className="text-slate-400">Thousands of titles. </span>
        <span className="whitespace-nowrap text-white">One </span>
        <span className="inline-block whitespace-nowrap font-black text-[#ff1493]">
          VERD<span className="wv-logo-1 wv-logo-1--idle text-white">1</span>CT
        </span>
        <span className="text-white">.</span>
      </span>
    </p>
  );
}
