import Link from 'next/link';

/**
 * THE ONE BRAND ENTRANCE, DEFINED ONCE.
 *
 * `btn-watchverdict` (blue→violet→magenta, never the courtroom's gold — that
 * ceremony is reserved for the Live Jury / Verdict Room) plus the scales glyph
 * and the sheen sweep. It was inline markup in `app/page.tsx`; the moment a
 * second section needed the same entrance, copying that markup would have been
 * the start of a second button language. There is one component now, so the
 * two entrances cannot drift.
 *
 * `testId` is the only thing a caller varies — the hero's button is
 * `cta-enter`, and every other placement identifies itself so a suite can tell
 * them apart.
 */
export function EnterWatchVerd1ctCta({ testId }: { testId: string }) {
  return (
    <Link href="/app" className="btn-watchverdict" data-testid={testId}>
      <span aria-hidden className="text-[0.9em] opacity-90">
        ⚖️
      </span>{' '}
      Enter WatchVerd1ct
      <span
        aria-hidden
        className="wv-cta-sheen pointer-events-none absolute inset-y-0 left-0 w-1/5 bg-gradient-to-r from-transparent via-white/45 to-transparent"
      />
    </Link>
  );
}
