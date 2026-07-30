import { notFound } from 'next/navigation';
import { Top10Rail, type RailItem } from '@/components/Top10Rail';
import type { StandardContribution } from '@/lib/scoring/standardScore';

/**
 * Top 10 rail harness (gated by MOBILE_HARNESS=1). Real component, fixed data,
 * including the two cases that matter: working that reconciles, and working
 * that does not. 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

const c = (key: string, value: number, weight: number) => ({ key, value, weight }) as StandardContribution;

const ITEMS: RailItem[] = [
  {
    id: 501,
    mediaType: 'movie',
    title: 'Reconciling Pick',
    year: 2024,
    posterUrl: null,
    score: 89,
    work: {
      contributions: [c('imdb', 78, 0.5), c('rottenTomatoes', 90, 0.5)],
      score: 84,
      personalDelta: 5,
      missingKeys: ['metacritic'],
    },
  },
  {
    id: 502,
    mediaType: 'tv',
    title: 'No Working Available',
    year: 2019,
    posterUrl: null,
    score: 71,
    work: { contributions: [], score: 71 },
  },
  { id: 503, mediaType: 'movie', title: 'Bare Score', year: 2001, posterUrl: null, score: 64 },
  ...Array.from({ length: 9 }, (_, i) => ({
    id: 600 + i,
    mediaType: 'movie' as const,
    title: `Filler ${i + 1}`,
    year: 2020,
    posterUrl: null,
    score: 80 - i,
    work: { contributions: [c('imdb', 80 - i, 1)], score: 80 - i },
  })),
];

export default function Top10HarnessPage() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <div className="min-h-dvh bg-ink-950 p-4">
      <div className="container-page">
        <Top10Rail title="Your Top 10 right now" eyebrow="ranked by your Watch DNA" items={ITEMS} />
      </div>
    </div>
  );
}
