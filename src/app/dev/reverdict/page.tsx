import { notFound } from 'next/navigation';
import { PosterCard } from '@/components/PosterCard';
import { ReVerdictTray } from '@/components/ReVerdictTray';
import { RewatchQuiz } from '@/components/RewatchQuiz';

export const dynamic = 'force-dynamic';

/** Harness only — the real screens need a session, so a browser test against
 *  them would assert on a login page. Gated behind MOBILE_HARNESS. */
const CARDS = [
  { title: 'Heat', year: 1995, mediaType: 'movie' as const, id: 949 },
  { title: 'Ronin', year: 1998, mediaType: 'movie' as const, id: 9403 },
  { title: 'Collateral', year: 2004, mediaType: 'movie' as const, id: 1620 },
];

export default function DevReVerdict() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <div className="container-page space-y-6 py-6">
      <h1 className="text-xl font-black text-white">Dev — re-Verd1ct</h1>
      <section aria-label="poster grid" className="poster-grid" data-testid="rv-grid">
        {CARDS.map((c) => (
          <PosterCard key={c.id} title={c.title} year={c.year} mediaType={c.mediaType} tmdbId={c.id} posterUrl={null} />
        ))}
      </section>
      <section data-testid="rv-quiz">
        <RewatchQuiz />
      </section>
      <ReVerdictTray />
    </div>
  );
}
