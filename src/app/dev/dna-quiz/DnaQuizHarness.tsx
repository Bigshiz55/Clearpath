'use client';

import { DnaQuiz, type QuizItem, type SubmitPayload } from '@/components/DnaQuiz';

/** Deterministic 2:3 SVG poster so the harness exercises real artwork dimensions
 *  (and the cinematic backdrop is visible in screenshots). */
function poster(title: string, a: string, b: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs><rect width='400' height='600' fill='url(#g)'/><text x='200' y='300' font-family='Arial' font-size='34' font-weight='bold' fill='white' text-anchor='middle'>${title}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** A fixed, deterministic pool — including a long title and a missing poster. */
const MOCK: QuizItem[] = [
  { id: 603, mediaType: 'movie', title: 'The Matrix', year: 1999, posterPath: '/x.jpg', posterUrl: poster('MATRIX', '#1e3a8a', '#064e3b'), genre: 'Sci-Fi' },
  { id: 1396, mediaType: 'tv', title: 'Breaking Bad', year: 2008, posterPath: '/y.jpg', posterUrl: poster('BREAKING BAD', '#7c2d12', '#052e16'), genre: 'Crime' },
  { id: 999, mediaType: 'movie', title: 'A Ridiculously Long Movie Title That Should Wrap Cleanly Without Breaking The Card Layout Or Overflowing', year: 2021, posterPath: null, posterUrl: null, genre: 'Drama' },
  { id: 550, mediaType: 'movie', title: 'Fight Club', year: 1999, posterPath: '/z.jpg', posterUrl: poster('FIGHT CLUB', '#881337', '#1e1b4b'), genre: 'Thriller' },
];

declare global {
  interface Window {
    __quizSubmits?: SubmitPayload[];
    __quizUndos?: string[];
  }
}

/**
 * Renders the REAL DnaQuiz inside a faithful copy of the /app shell — the same
 * sticky header height, the same compact utility row, and the same fixed bottom
 * nav (with the pb-20 safe reserve) as `src/app/app/layout.tsx`. This is what
 * lets Playwright prove the one-tile requirement: artwork + title + four equal
 * buttons all visible, nothing hidden behind the bottom nav, no page scroll.
 */
export function DnaQuizHarness() {
  const onSubmit = async (p: SubmitPayload) => {
    if (typeof window !== 'undefined') (window.__quizSubmits ??= []).push(p);
    await new Promise((r) => setTimeout(r, 30)); // simulate a quick network round-trip
    return { ok: true as const };
  };
  const onUndo = async (eventId: string) => {
    if (typeof window !== 'undefined') (window.__quizUndos ??= []).push(eventId);
    return { ok: true as const };
  };

  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      {/* Mock global header — same height/treatment as the real <Nav> */}
      <header className="sticky top-0 z-40 flex h-16 items-center border-b border-white/10 bg-ink-950/80 backdrop-blur">
        <div className="container-page font-bold tracking-tight text-white">WatchVerdict</div>
      </header>

      <main className="container-page py-6">
        {/* Mock compact utility row — same shape/height as NavArrows on the quiz route */}
        <div className="mb-2 flex items-center justify-between gap-2" data-testid="mock-navrow">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm font-semibold text-slate-100">←</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm font-semibold text-slate-100">🏠</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm font-semibold text-slate-100">→</span>
        </div>

        <DnaQuiz items={MOCK} onSubmit={onSubmit} onUndo={onUndo} />
      </main>

      {/* Mock fixed bottom nav — same height/position/reserve as the real one */}
      <nav
        data-app-bottomnav
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-white/10 bg-ink-950/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden"
        data-testid="mock-bottomnav"
      >
        {['Home', 'Watch Now', 'New', 'On TV', 'Watchlist'].map((l) => (
          <span key={l} className="flex flex-1 flex-col items-center gap-0.5 px-1 py-1 text-[11px] text-slate-300">{l}</span>
        ))}
      </nav>
    </div>
  );
}
