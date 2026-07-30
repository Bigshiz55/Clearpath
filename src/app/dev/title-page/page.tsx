import { notFound } from 'next/navigation';
import { PublicHeader, PublicFooter, DiscoveryArticle } from '@/components/discovery/DiscoveryLayout';
import { TitleHero } from '@/components/discovery/TitleHero';
import { buildTitlePages, type CachedTitle } from '@/lib/discovery/titlePages';

/**
 * TITLE-TEMPLATE harness (MOBILE_HARNESS=1) — renders the REAL movie/show
 * template from a clearly-labelled FIXTURE so the layout can be verified
 * without live TMDB data. The fixture is never published: it lives only on this
 * dev route and is not in the registry, the sitemap or Explore.
 */
export const dynamic = 'force-dynamic';

const FIXTURE: CachedTitle = {
  slug: 'fixture-movie-2019',
  tmdbId: 0,
  mediaType: 'movie',
  title: 'Fixture: A Demonstration Film',
  year: 2019,
  runtimeMinutes: 130,
  genres: ['Mystery', 'Comedy', 'Drama'],
  posterUrl: null,
  providers: ['Netflix', 'Prime Video'],
  ratings: [
    { source: 'IMDb', value: '7.9' },
    { source: 'TMDB audience', value: '78%' },
  ],
  overview: 'Fixture data used to verify the template renders.',
  verdictSummary:
    'This is fixture text standing in for original WatchVerd1ct analysis. In production this paragraph is written by an editor in the CMS and explains, in plain language, what kind of viewer this title actually serves and why the deterministic Watchability score landed where it did. A title without this analysis fails the quality gate and stays a draft, which is why no auto-generated boilerplate can reach the public site.',
  whoItIsFor:
    'Fixture text for the positive case. It describes the viewer whose Viewer DNA profile leans toward this title — the pace, tone and structural traits that make it a strong personal match — rather than repeating a synopsis that already exists on a dozen other sites.',
  whoShouldSkip:
    'Fixture text for the honest negative case. Every published title page must state who should skip it, because a page that only sells is a page nobody can trust. Here that would cover tone, pace, content and runtime reasons a viewer might reasonably pass.',
  characteristics: ['Fast, plot-forward pacing', 'Large ensemble cast', 'Comic tone under a real mystery'],
  contentNotes: ['Mild violence', 'Some strong language'],
  similar: [
    { slug: 'fixture-two-2021', label: 'Fixture: Another Film', kind: 'movie' },
    { slug: 'fixture-series-2010', label: 'Fixture: A Series', kind: 'show' },
  ],
  cachedAt: '2026-07-25',
};

export default function TitleTemplateHarness() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  const [page] = buildTitlePages([FIXTURE]);
  if (!page) notFound();
  const trail = [
    { href: '/', label: 'Home' },
    { href: '/explore', label: 'Movies' },
    { href: `/movie/${page.slug}`, label: page.heading },
  ];
  return (
    <div className="min-h-dvh">
      <PublicHeader />
      <main>
        <TitleHero page={page} />
        <DiscoveryArticle page={page} trail={trail} />
      </main>
      <PublicFooter />
    </div>
  );
}
