import Link from 'next/link';

export function Logo({ href = '/', compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 group">
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-glow">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" aria-hidden>
          <path
            d="M4 6.5 12 3l8 3.5v5c0 4.6-3.2 7.9-8 9.5-4.8-1.6-8-4.9-8-9.5v-5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="m8.5 12 2.4 2.4 4.6-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
