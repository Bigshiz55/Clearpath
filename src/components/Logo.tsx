import Link from 'next/link';

export function Logo({ href = '/', compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 group">
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-glow">
        {/* Scales-of-justice antenna over a TV with a play button — "WatchVerdict" */}
        <svg viewBox="0 0 64 64" className="h-7 w-7" fill="none" aria-hidden>
          <line x1="17" y1="16" x2="47" y2="16" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="32" cy="16" r="2.2" fill="#f5c518" />
          <line x1="32" y1="16" x2="32" y2="33" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
          <line x1="18" y1="16" x2="18" y2="21" stroke="white" strokeWidth="1.6" />
          <path d="M13 21 a5 3 0 0 0 10 0" stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <line x1="46" y1="16" x2="46" y2="21" stroke="white" strokeWidth="1.6" />
          <path d="M41 21 a5 3 0 0 0 10 0" stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <rect x="16" y="33" width="32" height="19" rx="3.5" stroke="white" strokeWidth="2.6" fill="rgba(255,255,255,.12)" />
          <path d="M29 39 v7 l7 -3.5 z" fill="#f5c518" />
          <line x1="23" y1="52" x2="21" y2="56" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="41" y1="52" x2="43" y2="56" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </span>
      {!compact && (
        <span className="text-lg font-bold tracking-tight text-white">
          Watch<span className="text-brand-300">Verdict</span>
        </span>
      )}
    </Link>
  );
}
