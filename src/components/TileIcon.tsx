/**
 * The home-tile graphics — a set of bold, gradient-filled SVG "app-icon" marks
 * (24×24) with glossy highlights, so each tile pops as a modern illustration
 * rather than a thin line glyph. Each icon carries its own colour, so it works
 * on any background with no `currentColor` needed.
 */
export type TileIconName =
  | 'watch'
  | 'judge'
  | 'search'
  | 'quiz'
  | 'new'
  | 'tv'
  | 'together'
  | 'watchlist'
  | 'money'
  | 'easy'
  | 'clock'
  | 'funny'
  | 'scary'
  | 'heart'
  | 'sunny'
  | 'packs';

function G({ id, from, to, v }: { id: string; from: string; to: string; v?: boolean }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2={v ? '0' : '1'} y2="1">
      <stop offset="0" stopColor={from} />
      <stop offset="1" stopColor={to} />
    </linearGradient>
  );
}

/** A soft top gloss over the whole icon, for that glossy 3D-flat feel. */
function Gloss() {
  return <rect x="1.5" y="1.5" width="21" height="10" rx="6" fill="#ffffff" opacity="0.16" />;
}

export function TileIcon({ name, className = 'h-11 w-11' }: { name: TileIconName; className?: string }) {
  const svg = (children: React.ReactNode) => (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      {children}
    </svg>
  );

  switch (name) {
    case 'watch': // play in a rounded screen
      return svg(
        <>
          <defs><G id="ti-watch" from="#fb7185" to="#e11d48" /></defs>
          <rect x="2.5" y="4.5" width="19" height="15" rx="4.5" fill="url(#ti-watch)" />
          <Gloss />
          <path d="M10 8.9l5.4 3.1-5.4 3.1z" fill="#fff" />
        </>,
      );
    case 'judge': // gavel + sound block
      return svg(
        <>
          <defs><G id="ti-judge" from="#fbbf24" to="#ea580c" /></defs>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="url(#ti-judge)" />
          <Gloss />
          <g stroke="#fff" strokeWidth="2" strokeLinecap="round">
            <g transform="rotate(45 12 10)">
              <rect x="8.2" y="7.2" width="7.6" height="3.6" rx="1.2" fill="#fff" stroke="none" />
              <line x1="12" y1="10.8" x2="12" y2="17.4" />
            </g>
            <line x1="5.5" y1="19.6" x2="12.5" y2="19.6" />
          </g>
        </>,
      );
    case 'search': // magnifier with filter sliders
      return svg(
        <>
          <defs><G id="ti-search" from="#818cf8" to="#4f46e5" /></defs>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="url(#ti-search)" />
          <Gloss />
          <circle cx="10.5" cy="10.5" r="5.4" fill="#fff" opacity="0.22" />
          <circle cx="10.5" cy="10.5" r="5.4" fill="none" stroke="#fff" strokeWidth="1.8" />
          <line x1="14.6" y1="14.6" x2="18.4" y2="18.4" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
          <g stroke="#fff" strokeWidth="1.5" strokeLinecap="round">
            <line x1="7.6" y1="9" x2="13.4" y2="9" />
            <line x1="7.6" y1="12" x2="13.4" y2="12" />
          </g>
          <circle cx="12" cy="9" r="1.15" fill="#fff" />
          <circle cx="9" cy="12" r="1.15" fill="#fff" />
        </>,
      );
    case 'quiz': // game controller
      return svg(
        <>
          <defs><G id="ti-quiz" from="#c084fc" to="#c026d3" /></defs>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="url(#ti-quiz)" />
          <Gloss />
          <rect x="4.5" y="8.5" width="15" height="8.5" rx="4.25" fill="#fff" opacity="0.9" />
          <g stroke="#c026d3" strokeWidth="1.7" strokeLinecap="round">
            <line x1="7.6" y1="11" x2="7.6" y2="14.4" />
            <line x1="5.9" y1="12.7" x2="9.3" y2="12.7" />
          </g>
          <circle cx="14.8" cy="11.8" r="1.15" fill="#c026d3" />
          <circle cx="16.9" cy="13.9" r="1.15" fill="#c026d3" />
        </>,
      );
    case 'new': // sparkle star badge
      return svg(
        <>
          <defs><G id="ti-new" from="#60a5fa" to="#4338ca" /></defs>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="url(#ti-new)" />
          <Gloss />
          <path d="M12 5.2l1.9 3.9 4.3.6-3.1 3 .75 4.25L12 14.95 8.15 17l.75-4.25-3.1-3 4.3-.6z" fill="#fff" />
        </>,
      );
    case 'tv': // television with antenna
      return svg(
        <>
          <defs><G id="ti-tv" from="#34d399" to="#0d9488" /></defs>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="url(#ti-tv)" />
          <Gloss />
          <path d="M8 5l4 3.4L16 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x="4.8" y="8.6" width="14.4" height="9.4" rx="2.4" fill="#fff" />
          <rect x="6.8" y="10.6" width="7.4" height="5.4" rx="1.2" fill="#0d9488" opacity="0.35" />
        </>,
      );
    case 'together': // two people
      return svg(
        <>
          <defs><G id="ti-together" from="#fb7185" to="#db2777" /></defs>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="url(#ti-together)" />
          <Gloss />
          <g fill="#fff">
            <circle cx="8.6" cy="9" r="2.2" />
            <circle cx="15.4" cy="9" r="2.2" />
            <path d="M4.6 17.4c0-2.2 1.9-3.6 4-3.6s4 1.4 4 3.6z" />
            <path d="M11.4 17.4c0-2.2 1.9-3.6 4-3.6s4 1.4 4 3.6z" opacity="0.85" />
          </g>
        </>,
      );
    case 'watchlist': // bookmark with check
      return svg(
        <>
          <defs><G id="ti-wl" from="#38bdf8" to="#2563eb" /></defs>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="url(#ti-wl)" />
          <Gloss />
          <path d="M8 5.5h8a1 1 0 0 1 1 1V19l-5-3-5 3V6.5a1 1 0 0 1 1-1z" fill="#fff" />
          <path d="M10 10.4l1.6 1.6 3-3" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>,
      );
    case 'money': // wallet with a dollar coin
      return svg(
        <>
          <defs><G id="ti-money" from="#34d399" to="#059669" /></defs>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="url(#ti-money)" />
          <Gloss />
          <g fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="7.5" width="14" height="10" rx="2.5" fill="#fff" fillOpacity="0.22" />
            <circle cx="15.5" cy="12.5" r="1.4" fill="#fff" stroke="none" />
            <path d="M12 9.7v5.6M13.4 10.6c-.5-.6-2.8-.7-2.8.6 0 1.2 2.8.6 2.8 1.8 0 1.3-2.3 1.2-2.8.6" />
          </g>
        </>,
      );
    case 'easy': // reading glasses
      return svg(
        <>
          <defs><G id="ti-easy" from="#fbbf24" to="#ea580c" /></defs>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="url(#ti-easy)" />
          <Gloss />
          <g stroke="#fff" strokeWidth="1.9" fill="none" strokeLinecap="round">
            <circle cx="7.6" cy="13.4" r="3.1" fill="#fff" fillOpacity="0.25" />
            <circle cx="16.4" cy="13.4" r="3.1" fill="#fff" fillOpacity="0.25" />
            <path d="M10.7 12.9c.9-.8 2.7-.8 2.6 0" />
            <path d="M4.5 12.2 3 10.6M19.5 12.2 21 10.6" />
          </g>
        </>,
      );
    case 'clock': // a short runtime, at a glance
      return svg(
        <>
          <defs><G id="ti-clock" from="#67e8f9" to="#0e7490" /></defs>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="url(#ti-clock)" />
          <Gloss />
          <circle cx="12" cy="13.1" r="6.3" fill="#fff" opacity="0.94" />
          <path d="M9.4 4.6h5.2M12 4.6v2.3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12 9.3v3.9l2.9 1.9" stroke="#0e7490" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>,
      );
    case 'funny': // a big open laugh
      return svg(
        <>
          <defs><G id="ti-funny" from="#fde047" to="#d97706" /></defs>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="url(#ti-funny)" />
          <Gloss />
          <circle cx="12" cy="12.6" r="7.1" fill="#fff" opacity="0.94" />
          <g fill="#b45309">
            <ellipse cx="9.1" cy="11" rx="1" ry="1.35" />
            <ellipse cx="14.9" cy="11" rx="1" ry="1.35" />
          </g>
          <path d="M7.7 14.5c1 2.7 7.6 2.7 8.6 0" stroke="#b45309" strokeWidth="1.9" strokeLinecap="round" fill="none" />
        </>,
      );
    case 'scary': // a friendly-menacing ghost
      return svg(
        <>
          <defs><G id="ti-scary" from="#a78bfa" to="#4c1d95" /></defs>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="url(#ti-scary)" />
          <Gloss />
          <path
            d="M12 5.3c-3.4 0-5.7 2.5-5.7 6v7.3c.6-.9 1.3-.9 1.9 0 .6.9 1.3.9 1.9 0 .6-.9 1.2-.9 1.8 0 .6.9 1.3.9 1.9 0 .6-.9 1.3-.9 1.9 0 .6-.9 1.2-.9 1.8 0v-7.3c0-3.5-2.3-6-5.7-6z"
            fill="#fff"
            opacity="0.95"
          />
          <g fill="#4c1d95">
            <circle cx="9.6" cy="11.3" r="1" />
            <circle cx="14.4" cy="11.3" r="1" />
          </g>
          <ellipse cx="12" cy="14.2" rx="1.1" ry="1.4" fill="#4c1d95" />
        </>,
      );
    case 'heart': // date night
      return svg(
        <>
          <defs><G id="ti-heart" from="#f9a8d4" to="#be185d" /></defs>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="url(#ti-heart)" />
          <Gloss />
          <path
            d="M12 18.1s-6.3-3.8-6.3-8.2a3.55 3.55 0 0 1 6.3-2.3 3.55 3.55 0 0 1 6.3 2.3c0 4.4-6.3 8.2-6.3 8.2z"
            fill="#fff"
          />
        </>,
      );
    case 'sunny': // feel-good, uplifting
      return svg(
        <>
          <defs><G id="ti-sunny" from="#fef08a" to="#ca8a04" /></defs>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="url(#ti-sunny)" />
          <Gloss />
          <circle cx="12" cy="12.5" r="4" fill="#fff" />
          <g stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
            <line x1="12" y1="4.5" x2="12" y2="6.5" />
            <line x1="12" y1="18.5" x2="12" y2="20.5" />
            <line x1="4.5" y1="12.5" x2="6.5" y2="12.5" />
            <line x1="17.5" y1="12.5" x2="19.5" y2="12.5" />
            <line x1="6.9" y1="7.4" x2="8.3" y2="8.8" />
            <line x1="15.7" y1="16.2" x2="17.1" y2="17.6" />
            <line x1="17.1" y1="7.4" x2="15.7" y2="8.8" />
            <line x1="8.3" y1="16.2" x2="6.9" y2="17.6" />
          </g>
        </>,
      );
    case 'packs': // stacked specialized collections
      return svg(
        <>
          <defs><G id="ti-packs" from="#c4b5fd" to="#7c3aed" /></defs>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="url(#ti-packs)" />
          <Gloss />
          <rect x="6" y="13.5" width="12" height="3.4" rx="1.4" fill="#fff" opacity="0.55" />
          <rect x="6" y="9.6" width="12" height="3.4" rx="1.4" fill="#fff" opacity="0.78" />
          <rect x="6" y="5.7" width="12" height="3.4" rx="1.4" fill="#fff" />
        </>,
      );
  }
}
