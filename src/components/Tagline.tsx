/**
 * Brand tagline with the VERD1CT glyph baked in — "verdict" echoes the wordmark
 * (pink letters + the signature white "1"), while "thousands of choices" is muted
 * so the thousands→one contrast lands. Decorative styling is aria-hidden; the
 * whole thing reads as plain "Thousands of choices, one verdict" for assistive
 * tech and search. Alignment/size come from `className` so it works as a logo
 * lockup (left) or a centered eyebrow.
 */
export function Tagline({ className = '' }: { className?: string }) {
  return (
    <p className={`font-bold tracking-tight ${className}`} aria-label="Thousands of choices, one verdict">
      <span aria-hidden>
        <span className="text-slate-400">Thousands of choices, </span>
        <span className="text-white">one </span>
        <span className="font-black">
          <span className="text-[#ff1493]">verd</span>
          <span className="text-white">1</span>
          <span className="text-[#ff1493]">ct</span>
        </span>
      </span>
    </p>
  );
}
