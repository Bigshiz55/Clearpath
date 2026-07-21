/** The breast-cancer awareness ribbon — two strands crossing into a loop.
 *  Colour comes from `currentColor`, so set it with a text-* class. */
export function PinkRibbon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M14 3.5C18.5 7.5 16.5 12.5 11 21" stroke="currentColor" strokeWidth="3.1" strokeLinecap="round" />
      <path d="M10 3.5C5.5 7.5 7.5 12.5 13 21" stroke="currentColor" strokeWidth="3.1" strokeLinecap="round" />
    </svg>
  );
}
