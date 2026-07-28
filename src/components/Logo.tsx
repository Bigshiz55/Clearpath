import Link from 'next/link';
import { WatchVerdictWordmark } from './WatchVerdictWordmark';

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

/**
 * THE WORDMARK YIELDS WHEN THE BAR CANNOT HOLD IT.
 *
 * The app header is a logo plus search, account and overflow. That was sized at
 * 390px, where it fits with four pixels to spare — and never checked narrower.
 * At 360 the wordmark ran 26px under the search button and at 320 it ran 66px
 * under it, with "VERD1CT" printed through a control.
 *
 * There is no type size that fixes 320: the three controls plus padding leave
 * ~100px, and the shortest legible wordmark is half again that. So it steps
 * down at 390, and below 360 the mark carries the brand alone — which it is
 * designed to do. Only the crowded header opts in; a page that gives the logo
 * a line of its own keeps the full wordmark at every width.
 */
const CROWDED_WORD = 'hidden min-[360px]:inline text-base min-[390px]:text-xl sm:text-3xl';

export function Logo({
  href = '/',
  compact = false,
  size = 'md',
  crowded = false,
}: {
  href?: string;
  compact?: boolean;
  /** `xl` is for a page that gives the logo a line of its own — the landing
   *  hero, not a shared header bar. It does not shrink for `crowded`. */
  size?: 'md' | 'lg' | 'xl';
  /** Set on bars that also carry controls — see `CROWDED_WORD`. */
  crowded?: boolean;
}) {
  // `lg` shrinks on small phones so the header (logo + right controls) never
  // exceeds a narrow viewport, then grows from `sm` up. `xl` never shares a
  // bar with controls, so it grows straight through — including a further
  // step at `lg` (1024px+), because a page that gives the logo a whole line
  // on a real desktop should use a real desktop's worth of it, not stop
  // scaling at tablet width.
  const box =
    size === 'xl'
      ? 'h-14 w-14 rounded-2xl sm:h-20 sm:w-20 sm:rounded-3xl lg:h-24 lg:w-24 lg:rounded-[1.75rem]'
      : size === 'lg'
        ? 'h-11 w-11 rounded-xl sm:h-14 sm:w-14 sm:rounded-2xl'
        : 'h-9 w-9 rounded-xl';
  const inner =
    size === 'xl' ? 'h-11 w-11 sm:h-16 sm:w-16 lg:h-20 lg:w-20' : size === 'lg' ? 'h-9 w-9 sm:h-11 sm:w-11' : 'h-7 w-7';
  const word =
    crowded ? CROWDED_WORD : size === 'xl' ? 'text-3xl sm:text-5xl lg:text-6xl' : size === 'lg' ? 'text-xl sm:text-3xl' : 'text-lg';

  return (
    <Link href={href} className="group inline-flex items-center gap-2.5">
      <LogoMark box={box} inner={inner} />
      {!compact && <WatchVerdictWordmark className={word} />}
    </Link>
  );
}

/** Canonical shared brand logo (app mark + WatchVERD1CT wordmark). Alias of Logo
 *  so callers can import a clearly-named component. */
export const WatchVerdictLogo = Logo;
