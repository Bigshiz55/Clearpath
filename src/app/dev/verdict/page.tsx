import { notFound } from 'next/navigation';
import { PosterCard } from '@/components/PosterCard';
import { DocketTray } from '@/components/DocketTray';
import { VerdictDelivery } from '@/components/VerdictDelivery';

/**
 * Docket + Verd1ct harness (gated by MOBILE_HARNESS=1). Renders REAL poster
 * cards (so the W stamp is the shipped one), the real tray, and the real
 * verdict panel side by side, so the suite can drive add → cap → deliver
 * without a session. The per-title fact endpoints are intercepted by the tests.
 * 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

const TITLES = [
  { id: 101, title: 'Alpha', year: 2021 },
  { id: 102, title: 'Bravo', year: 2019 },
  { id: 103, title: 'Charlie', year: 2015 },
  { id: 104, title: 'Delta', year: 2023 },
  { id: 105, title: 'Echo', year: 2011 },
  { id: 106, title: 'Foxtrot', year: 2018 },
  { id: 107, title: 'Golf', year: 2020 },
  { id: 108, title: 'Hotel', year: 2016 },
  { id: 109, title: 'India', year: 2014 },
];

export default function VerdictHarnessPage() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <div className="min-h-dvh bg-ink-950 p-4 pb-40">
      <div className="container-page space-y-6">
        <section className="poster-grid" data-testid="harness-grid">
          {TITLES.map((t) => (
            <PosterCard key={t.id} tmdbId={t.id} mediaType="movie" title={t.title} year={t.year} />
          ))}
        </section>
        <section data-testid="harness-verdict">
          <VerdictDelivery />
        </section>
      </div>
      <DocketTray />
    </div>
  );
}
