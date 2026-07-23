import type { NavIcon } from '@/config/nav';

const paths: Record<NavIcon, React.ReactNode> = {
  home: <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8.5Z" />,
  ask: (
    <>
      <path d="M12 3a5 5 0 0 0-5 5v3a5 5 0 0 0 10 0V8a5 5 0 0 0-5-5Z" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  discover: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="m14.5 9.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  books: (
    <>
      <path d="M4 5.5C6.5 4.3 9.5 4.3 12 5.5v13c-2.5-1.2-5.5-1.2-8 0v-13Z" />
      <path d="M20 5.5C17.5 4.3 14.5 4.3 12 5.5v13c2.5-1.2 5.5-1.2 8 0v-13Z" />
    </>
  ),
  together: (
    <>
      <circle cx="8" cy="9" r="3" />
      <circle cx="16" cy="9" r="3" />
      <path d="M3 20c0-2.8 2.2-5 5-5s5 2.2 5 5M13 20c0-2.8 2.2-5 5-5s3 1 3 1" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </>
  ),
  dna: (
    <>
      <path d="M7 3c0 6 10 6 10 12M17 3c0 6-10 6-10 12M7 21h10M7 3h10" />
    </>
  ),
};

/** Minimal, dependency-free line icon set keyed to nav destinations. */
export function Icon({
  name,
  className = 'h-5 w-5',
}: {
  name: NavIcon;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

/** The Verdict family wordmark glyph (a bookmark check). */
export function VerdictMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#c6963a" />
      <path
        d="M10 7h12a1 1 0 0 1 1 1v17l-7-4-7 4V8a1 1 0 0 1 1-1Z"
        fill="#0d0d10"
      />
      <path
        d="m12.5 14 2.4 2.4 4.6-5"
        fill="none"
        stroke="#c6963a"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
