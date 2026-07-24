import { notFound } from 'next/navigation';
import { RatingsStrip } from '@/components/RatingsStrip';
import { BuildCaseBox } from '@/components/BuildCaseBox';
import { Logo } from '@/components/Logo';
import { Avatar } from '@/components/Avatar';
import { ViewModeToggle } from '@/components/ViewModeToggle';
import { MobileNav } from '@/components/nav/MobileNav';
import type { NavLink } from '@/components/nav/MoreMenu';
import type { TileRatings } from '@/lib/ratings';
import type { MediaType } from '@/lib/types';

/**
 * Responsive test harness — renders the REAL mobile primitives so Playwright drives
 * the actual components, not stand-ins: the real `Logo` in a header that mirrors
 * `Nav` (item 1: logo must never clip), the real `BuildCaseBox` hero (item 7), the
 * shared single-column `.poster-grid` of verdict cards (item 2), the priority
 * `RatingsStrip` metric rows (item 3), the card action bar (item 4), and the real
 * `MobileNav` fixed bottom bar with the page reserving space for it (item 8).
 * Controlled data (long titles, missing ratings, all ratings, long platforms) with
 * NO auth/TMDB, so it's deterministic at every viewport. RESPONSIVE_HARNESS=1 gated.
 */
export const dynamic = 'force-dynamic';

const PRIMARY: NavLink[] = [
  { href: '/app', label: 'Home' },
  { href: '/app/watch', label: 'Watch' },
  { href: '/app/new', label: 'New' },
  { href: '/app/on-tv', label: 'TV' },
  { href: '/app/watchlist', label: 'List' },
];
const SECONDARY: NavLink[] = [{ href: '/app/dna', label: 'Your Watch DNA' }, { href: '/app/settings', label: 'Settings' }];

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
  // Audience-only: shows just "Audience 86%" — no critics, no IMDb placeholder.
  { title: 'Audience Only Pick', year: 2023, mediaType: 'movie', score: 74, call: 'WORTH A LOOK', ratings: R({ rtAudience: 86 }) },
  // Invalid IMDb (0) alongside a real audience: the IMDb element must be HIDDEN
  // (never "IMDb —" / "IMDb 0.0"), audience still shows and reflows to fill.
  { title: 'Zero-Rating Guard', year: 2022, mediaType: 'tv', score: 68, call: 'MAYBE', ratings: R({ rtAudience: 72, imdb: 0 }) },
  // NaN rating from a broken feed: also hidden, critics still shown.
  { title: 'Broken-Feed Guard', year: 2020, mediaType: 'movie', score: 70, call: 'WORTH A LOOK', ratings: R({ tomatometer: 81, imdb: Number.NaN }) },
];

function HarnessCard({ c }: { c: CardSpec }) {
  return (
    <div data-testid="card" className="card group flex h-full flex-col overflow-hidden">
      {/* action bar — three equal-width, 44px-tall For / Pass / Save buttons */}
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
        {/* verdict panel — score dominant, then the ruling, then metric rows */}
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
    // Reserve space for the fixed bottom nav exactly like the real app layout, so
    // the overlap test is meaningful.
    <div className="min-h-dvh pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:pb-0">
      {/* Real header, mirroring Nav.tsx structure (logo + compact right controls). */}
      <header data-testid="site-header" className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between gap-2 sm:gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-6">
            <Logo href="/dev/responsive" size="lg" />
          </div>
          <div className="flex items-center gap-2">
            <ViewModeToggle />
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-gold-400/50 bg-gold-500/10 px-2.5 py-1.5 text-sm font-semibold text-gold-100">
              <span aria-hidden className="text-base leading-none">⭐</span>
              <span className="hidden sm:inline">Pro</span>
            </span>
            <Avatar label="🍿" px={34} />
          </div>
        </div>
      </header>

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

      {/* The REAL fixed bottom nav (phones only). */}
      <MobileNav primary={PRIMARY} secondary={SECONDARY} />
    </div>
  );
}
