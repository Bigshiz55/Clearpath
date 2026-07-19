/**
 * The home-tile icon set — one consistent line-art family (24×24, rounded,
 * `currentColor` stroke) so the tiles read as a designed set rather than a row
 * of mismatched emoji.
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
  | 'easy';

function Svg({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

const STAR = 'M12 6.6l1.4 2.85 3.15.46-2.28 2.22.54 3.14L12 13.75l-2.82 1.48.54-3.14L7.44 9.9l3.15-.46z';

export function TileIcon({ name, className = 'h-11 w-11' }: { name: TileIconName; className?: string }) {
  switch (name) {
    case 'watch': // play in a screen
      return (
        <Svg className={className}>
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="M10.5 9.2v5.6l5-2.8z" fill="currentColor" stroke="none" />
        </Svg>
      );
    case 'judge': // gavel + sound block
      return (
        <Svg className={className}>
          <g transform="rotate(45 12 10)">
            <rect x="8" y="7" width="8" height="4" rx="1.3" />
            <line x1="12" y1="11" x2="12" y2="18.5" />
          </g>
          <line x1="4.5" y1="20.7" x2="12.5" y2="20.7" />
        </Svg>
      );
    case 'search': // magnifier with filter sliders in the lens
      return (
        <Svg className={className}>
          <circle cx="10.5" cy="10.5" r="7" />
          <line x1="15.8" y1="15.8" x2="20.5" y2="20.5" />
          <line x1="7" y1="9" x2="14" y2="9" />
          <circle cx="12" cy="9" r="1.15" fill="currentColor" stroke="none" />
          <line x1="7" y1="12.2" x2="14" y2="12.2" />
          <circle cx="9" cy="12.2" r="1.15" fill="currentColor" stroke="none" />
        </Svg>
      );
    case 'quiz': // game controller
      return (
        <Svg className={className}>
          <rect x="2.5" y="8" width="19" height="9.5" rx="4.75" />
          <line x1="7" y1="11" x2="7" y2="14.5" />
          <line x1="5.25" y1="12.75" x2="8.75" y2="12.75" />
          <circle cx="15.6" cy="11.6" r="1.05" fill="currentColor" stroke="none" />
          <circle cx="17.8" cy="13.8" r="1.05" fill="currentColor" stroke="none" />
        </Svg>
      );
    case 'new': // billboard on legs + "new" star
      return (
        <Svg className={className}>
          <rect x="3" y="3.5" width="18" height="12" rx="2" />
          <line x1="7.5" y1="15.5" x2="7.5" y2="20.5" />
          <line x1="16.5" y1="15.5" x2="16.5" y2="20.5" />
          <path d={STAR} transform="translate(0 -0.5)" fill="currentColor" stroke="none" />
        </Svg>
      );
    case 'tv': // television with antenna
      return (
        <Svg className={className}>
          <rect x="2.5" y="7" width="19" height="13" rx="2" />
          <path d="M8 3l4 4 4-4" />
        </Svg>
      );
    case 'together': // two heads above a couch
      return (
        <Svg className={className}>
          <circle cx="9" cy="7.5" r="2" />
          <circle cx="15" cy="7.5" r="2" />
          <path d="M5 16v-1.5A2 2 0 0 1 7 12.5h10a2 2 0 0 1 2 2V16" />
          <rect x="3.5" y="15.5" width="17" height="4" rx="1.6" />
          <line x1="5.5" y1="19.5" x2="5.5" y2="21" />
          <line x1="18.5" y1="19.5" x2="18.5" y2="21" />
        </Svg>
      );
    case 'watchlist': // bookmark with a check
      return (
        <Svg className={className}>
          <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.2L5 21V4.5a1 1 0 0 1 1-1z" />
          <path d="M9.4 8.6l1.7 1.7 3.5-3.4" />
        </Svg>
      );
    case 'easy': // big reading glasses
      return (
        <Svg className={className}>
          <circle cx="7" cy="13.5" r="3.3" />
          <circle cx="17" cy="13.5" r="3.3" />
          <path d="M10.2 13c1.05-1 2.55-1 3.6 0" />
          <path d="M3.9 12.4 2 10.3M20.1 12.4 22 10.3" />
        </Svg>
      );
  }
}
