import Link from 'next/link';

export function Logo({
  href = '/',
  compact = false,
  size = 'md',
}: {
  href?: string;
  compact?: boolean;
  size?: 'md' | 'lg';
}) {
  const box = size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-9 w-9 rounded-xl';
  const inner = size === 'lg' ? 'h-11 w-11' : 'h-7 w-7';
  const word = size === 'lg' ? 'text-2xl sm:text-3xl' : 'text-lg';

  return (
    <Link href={href} className="group inline-flex items-center gap-2.5">
      <span className={`relative grid place-items-center bg-gradient-to-br from-brand-400 to-brand-600 shadow-glow ${box}`}>
        {/* Scales-of-justice antenna over a TV with a play button — "WatchVerdict" */}
        <svg viewBox="0 0 64 64" className={inner} fill="none" aria-hidden>
          <line x1="16" y1="17" x2="48" y2="17" stroke="white" strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="32" cy="17" r="2.6" fill="#f5c518" />
          <line x1="32" y1="17" x2="32" y2="32" stroke="white" strokeWidth="3.4" strokeLinecap="round" />
          <line x1="18" y1="17" x2="18" y2="22" stroke="white" strokeWidth="2" />
          <path d="M13 22 a5 3.2 0 0 0 10 0" stroke="white" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <line x1="46" y1="17" x2="46" y2="22" stroke="white" strokeWidth="2" />
          <path d="M41 22 a5 3.2 0 0 0 10 0" stroke="white" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <rect x="15" y="32" width="34" height="20" rx="4" stroke="white" strokeWidth="3.4" fill="rgba(255,255,255,.16)" />
          <path d="M28 37 v10 l9 -5 z" fill="#f5c518" />
        </svg>
      </span>
      {!compact && (
        <span className={`font-bold tracking-tight text-white ${word}`}>
          Watch<span className="text-brand-300">Verdict</span>
        </span>
      )}
    </Link>
  );
}
