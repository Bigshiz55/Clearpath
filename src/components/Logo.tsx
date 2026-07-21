import Link from 'next/link';

/** The WatchVerdict app mark alone — a retro TV with scales of justice on the
 *  screen. `box`/`inner` size it; `overlay` renders on top (e.g. a score), and
 *  when set the mark itself dims so the overlay reads as "inside" the icon. */
export function LogoMark({
  box = 'h-9 w-9 rounded-xl',
  inner = 'h-7 w-7',
  overlay,
}: {
  box?: string;
  inner?: string;
  overlay?: React.ReactNode;
}) {
  return (
    <span className={`relative grid place-items-center bg-gradient-to-br from-brand-400 to-brand-600 shadow-glow ${box}`}>
      <svg viewBox="0 0 64 64" className={`${inner} ${overlay ? 'opacity-25' : ''}`} fill="none" aria-hidden>
        <line x1="32" y1="25" x2="22.5" y2="12.5" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
        <line x1="32" y1="25" x2="41.5" y2="12.5" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="22.5" cy="12.5" r="2.7" fill="white" />
        <circle cx="41.5" cy="12.5" r="2.7" fill="white" />
        <circle cx="32" cy="25" r="3.2" fill="white" />
        <rect x="13" y="27" width="38" height="25.5" rx="6" fill="white" fillOpacity="0.12" stroke="white" strokeWidth="2.8" />
        <circle cx="32" cy="32.4" r="1.9" fill="white" />
        <line x1="24" y1="34" x2="40" y2="34" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
        <line x1="32" y1="33.4" x2="32" y2="45.2" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M27.6 47.6 L36.4 47.6 L34.8 45 L29.2 45 Z" fill="white" />
        <line x1="24" y1="34" x2="21" y2="38.2" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="24" y1="34" x2="27" y2="38.2" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M20.4 38.2 L27.6 38.2 L26 41.8 L22 41.8 Z" fill="white" />
        <line x1="40" y1="34" x2="37" y2="38.2" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="40" y1="34" x2="43" y2="38.2" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M36.4 38.2 L43.6 38.2 L42 41.8 L38 41.8 Z" fill="white" />
      </svg>
      {overlay && <span className="absolute inset-0 grid place-items-center">{overlay}</span>}
    </span>
  );
}

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
      <LogoMark box={box} inner={inner} />
      {!compact && (
        <span className={`font-bold tracking-tight text-white ${word}`}>
          Watch<span className="text-[#ff1493]">VERD<span className="text-white">1</span>CT</span>
        </span>
      )}
    </Link>
  );
}
