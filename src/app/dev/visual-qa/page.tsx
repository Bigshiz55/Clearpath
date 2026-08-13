import { notFound } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { PosterCard } from '@/components/PosterCard';
import { RatingsStrip } from '@/components/RatingsStrip';
import { AlgorithmScore } from '@/components/AlgorithmScore';
import { DocketTray } from '@/components/DocketTray';

/**
 * VISUAL-QA harness (gated by MOBILE_HARNESS=1) — renders the REAL production
 * chrome and content-heavy components together, in their worst-case states, so
 * the Playwright visual suite can catch the exact defects the screenshots showed:
 * the header + global build badge, the poster grid with long titles / missing
 * art / huge ratings, and the ratings strip. It stacks the components that the
 * per-screen harnesses never rendered side by side. A 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

const LONG = 'The Extraordinarily Long and Unabbreviated Title of a Motion Picture That Refuses to Wrap Nicely';

const CARDS = [
  { title: 'Se7en', year: 1995, mediaType: 'movie' as const, posterUrl: null, meta: null },
  { title: LONG, year: 2024, mediaType: 'movie' as const, posterUrl: null, meta: null },
  { title: 'A', year: 2023, mediaType: 'tv' as const, posterUrl: null, meta: null },
  { title: 'Gōngfu Sūpermán 功夫超人 — Édition Spéciale', year: 2022, mediaType: 'movie' as const, posterUrl: null, meta: 'Acción · Comedia' },
  { title: 'No Poster Available Here', year: null, mediaType: 'movie' as const, posterUrl: null, meta: 'Documentary' },
  { title: 'Kids Show With A Fairly Long Name Too', year: 2021, mediaType: 'tv' as const, posterUrl: null, meta: 'Family' },
];

export default function VisualQaHarness() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <>
      {/* Mirror the real app shell's bottom clearance so content never sits
          under the fixed mobile nav (app/layout.tsx uses pb-20 sm:pb-0). */}
      <div className="min-h-dvh pb-20 lg:pb-0">
      <Nav personalLabel="For Alexandra" isGuest={false} pro avatarLabel="A" />
      <main className="container-page py-6" data-testid="qa-main">
        <h1 className="mb-4 text-xl font-black text-white">Visual QA — cards, ratings, header</h1>

        <section data-testid="qa-ratings" className="card mb-6 p-4">
          <RatingsStrip
            ratings={{ standardScore: 100, audience: 100, rtAudience: 100, tomatometer: 100, imdb: 10, metacritic: 100 }}
            mediaType="movie"
            tmdbId={999}
          />
        </section>

        {/* THE RATINGS ROW AT CARD WIDTH.
            The browse card no longer carries source ratings — they are evidence
            and moved to the title page — but `AlgorithmScore` still renders
            them inside a grid-column-width card on WatchNowGrid, ReleaseWall
            and RecommendationSlate. That narrow column is where a rating clips,
            truncates to "IMDb 6", or wraps onto a second line, so the
            guarantees against all three are measured HERE now rather than
            against a full-width strip that has room to spare and proves
            nothing. 280px is `.poster-grid`'s own minimum column. */}
        <section data-testid="qa-ratings-card" className="card mb-6 w-[280px] p-3">
          <AlgorithmScore compact mediaType="movie" tmdbId={998} title="Ratings At Card Width" year={2024} />
        </section>

        <section aria-label="poster grid" className="poster-grid" data-testid="qa-grid">
          {CARDS.map((c, i) => (
            <PosterCard key={i} title={c.title} year={c.year} mediaType={c.mediaType} posterUrl={c.posterUrl} meta={c.meta ?? undefined} tmdbId={1000 + i} />
          ))}
        </section>
      </main>
      {/* The decision-pool tray, which the real app mounts in the /app layout.
          Without it this harness renders the W but not what the W does, and the
          workflow could not be driven end to end from a browser test. */}
      <DocketTray />
      </div>
    </>
  );
}
