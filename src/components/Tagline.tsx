/**
 * Brand tagline with the VERD1CT glyph baked in — "verdict" is pink (the
 * wordmark colour) with the signature *spinning* 1 (the same I→1 split-flap
 * flip as the logo), while "thousands of choices" is muted so the thousands→one
 * contrast lands. Decorative styling is aria-hidden; the whole thing reads as
 * plain "Thousands of choices, one verdict" for assistive tech and search.
 * Alignment/size come from `className` (logo lockup on the left, or a centered
 * eyebrow).
 */
export function Tagline({ className = '' }: { className?: string }) {
  return (
    <p className={`font-bold tracking-tight ${className}`} aria-label="Thousands of choices, one verdict">
      <span aria-hidden>
        <span className="text-slate-400">Thousands of choices, </span>
        <span className="whitespace-nowrap text-white">one </span>
        <span className="inline-block whitespace-nowrap font-black text-[#ff1493]">VERDICT</span>
      </span>
    </p>
  );
}
