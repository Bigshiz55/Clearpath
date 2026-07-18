/** The double-helix mark — the DNA Score's identity. Shared by the title-page
 *  DNA box and the compact card DNA box so they read as the same thing. */
export function HelixMark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path d="M7 3c0 4 10 5 10 9s-10 5-10 9" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 3c0 4-10 5-10 9s10 5 10 9" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.4 6h7.2M8.4 18h7.2M6.7 9.2h10.6M6.7 14.8h10.6" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}
