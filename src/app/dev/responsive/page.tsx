import { notFound } from 'next/navigation';
import { RatingsStrip } from '@/components/RatingsStrip';
import { BuildCaseBox } from '@/components/BuildCaseBox';
import type { TileRatings } from '@/lib/ratings';
import type { MediaType } from '@/lib/types';

/**
 * Responsive test harness — renders the real responsive primitives (the shared
 * `.poster-grid` / `.card` / `.ratings-grid` system, `RatingsStrip`, the card
 * action bar, and the real `BuildCaseBox` "State Your Case" panel) with controlled
 * test data (long titles, missing ratings, all ratings, long platform names). It
 * needs NO auth or TMDB, so Playwright can drive it deterministically at every
 * viewport. Gated behind RESPONSIVE_HARNESS=1 so it never ships in normal builds.
 */
export const dynamic = 'force-dynamic';

const R = (o: Partial<TileRatings>): TileRatings => ({
  standardScore: 77, audience: null, rtAudience: null, tomatometer: null, imdb: null, metacritic: null, ...o,
});

interface CardSpec { title: string; year: number | null; mediaType: MediaType; score: number | null; call: string; ratings: TileRatings; platform?: string }

const CARDS: CardSpec[] = [
  { title: 'The Lord of the Rings: The Fellowship of the Ring — Extended Edition', year: 2001, mediaType: 'movie', score: 92, call: 'STREAM IT', ratings: R({ tomatometer: 91, rtAudience: 95, imdb: 8.9, metacritic: 92 }), platform: 'Max · Prime Video · Apple TV+' },
  { title: 'Dune', year: 2021, mediaType: 'movie', score: 84, call: 'STREAM IT', ratings: R({ tomatometer: 83, rtAudience: 90, imdb: 8.0 }) },
  { title: 'Sr.', year: 2022, mediaType: 'movie', score: 71, call: 'WORTH A LOOK', ratings: R({ imdb: 7.4 }) },
  { title: 'Some Obscure Indie With No Ratings At All', year: 2019, mediaType: 'movie', score: null, call: 'NO VERDICT', ratings: R({ standardScore: null }) },
  { title: 'Breaking Bad', year: 2008, mediaType: 'tv', score: 96, call: 'STREAM IT', ratings: R({ tomatometer: 96, rtAudience: 97, imdb: 9.5, metacritic: 87 }) },
  { title: 'A Show', year: 2024, mediaType: 'tv', score: 63, call: 'MAYBE', ratings: R({ tomatometer: 60, imdb: 6.8 }) },
  { title: '엘리트들 / La Casa de Papel — Parte 5, Volumen 2', year: 2021, mediaType: 'tv', score: 80, call: 'STREAM IT', ratings: R({ rtAudience: 84, imdb: 8.2, metacritic: 74 }) },
  { title: 'Interstellar', year: 2014, mediaType: 'movie', score: 88, call: 'STREAM IT', ratings: R({ tomatometer: 73, rtAudience: 86, imdb: 8.7, metacritic: 74 }) },
];

function HarnessCard({ c }: { c: CardSpec }) {
  return (
    <div data-testid="card" className="card group flex h-full flex-col overflow-hidden">
      {/* action bar — three equal-width, 44px-tall For / Pass / Save buttons.
          Tighter vertical padding on phones (mirrors PosterCard). */}
      <div className="flex items-center gap-1 border-b border-white/10 bg-ink-900/85 px-1.5 py-1 sm:py-1.5">
        <button data-testid="action" type="button" className="flex h-11 w-full min-w-0 flex-1 items-center justify-center gap-0.5 rounded-md border border-emerald-400/50 bg-emerald-500/15 text-xs font-bold text-emerald-100">For</button>
        <button data-testid="action" type="button" className="flex h-11 w-full min-w-0 flex-1 items-center justify-center gap-0.5 rounded-md border border-red-400/50 bg-red-500/15 text-xs font-bold text-red-200">Pass</button>
        <button data-testid="action" type="button" className="flex h-11 w-full min-w-0 flex-1 items-center justify-center gap-0.5 rounded-md border border-white/20 bg-white/10 text-xs font-bold text-white">＋ Save</button>
      </div>
      {/* Shorter 3:4 poster on phones, full 2:3 from sm up (mirrors PosterCard). */}
      <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-ink-700 to-ink-850 sm:aspect-[2/3]" />
      <div className="flex flex-1 flex-col p-3">
        <div data-testid="title" className="line-clamp-2 text-sm font-semibold text-white">{c.title}</div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
          <span className="flex-none rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">{c.mediaType === 'movie' ? 'Movie' : 'TV'}</span>
          <span className="truncate">{c.year ?? '—'}{c.platform ? ` · ${c.platform}` : ''}</span>
        </div>
        {/* verdict panel */}
        <div data-testid="verdict" className="mt-2 rounded-xl border-2 border-pink-400/70 bg-gradient-to-br from-pink-500/30 to-rose-500/20 px-2 py-2">
          <div className="flex items-center gap-2.5">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-[24%] bg-black/40 text-xl font-black text-white">{c.score ?? '—'}</span>
            <div className="min-w-0 flex-1">
              <span className="inline-flex max-w-full items-center rounded-md bg-emerald-500/25 px-2 py-0.5 text-sm font-black leading-tight tracking-tight text-emerald-100">{c.call}</span>
              <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-pink-100/90">Your VERD1CT</div>
            </div>
          </div>
          <RatingsStrip ratings={c.ratings} hideCall className="mt-2" />
        </div>
      </div>
    </div>
  );
}

export default function ResponsiveHarness() {
  if (process.env.RESPONSIVE_HARNESS !== '1') notFound();
  return (
    <div className="min-h-dvh pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
      <main className="container-page py-6">
        <h1 className="mb-4 text-lg font-black text-white">Responsive Harness</h1>

        <section className="mb-8">
          <BuildCaseBox hero />
        </section>

        <section>
          <div data-testid="poster-grid" className="poster-grid">
            {CARDS.map((c, i) => <HarnessCard key={i} c={c} />)}
          </div>
        </section>
      </main>
      {/* a fixed bottom bar mirroring the real MobileNav, to test content clearance */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-white/10 bg-ink-950/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:hidden">
        {['Home', 'Watch', 'New', 'TV', 'More'].map((l) => (
          <span key={l} className="flex flex-1 flex-col items-center gap-0.5 px-1 py-1 text-[11px] text-slate-300">{l}</span>
        ))}
      </nav>
    </div>
  );
}
