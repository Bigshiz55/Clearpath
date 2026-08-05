import { notFound } from 'next/navigation';
import { UpcomingScheduleList } from '@/components/packs/UpcomingScheduleList';
import { CatalogFranchiseGroups } from '@/components/packs/CatalogFranchiseGroups';
import { StaleDataNotice } from '@/components/packs/StaleDataNotice';
import { ChecklistView } from '@/components/packs/ChecklistView';
import { PackEmptyState } from '@/components/packs/PackEmptyState';
import { PublicHeader, PublicFooter } from '@/components/discovery/DiscoveryLayout';
import type { UpcomingEntry } from '@/lib/packs/schedule';
import type { CatalogFranchise } from '@/lib/packs/catalogFranchises';
import type { ChecklistItem } from '@/lib/packs/types';

/**
 * Pack REPAIR harness (gated by MOBILE_HARNESS=1, like every /dev/* page).
 * Renders the exact components the repaired /packs/[slug] page uses — the
 * upcoming-schedule fallback with all three evidence badges, the
 * catalog-backed franchise groups, the staleness notice, and the checklist —
 * with fixture props, so Playwright can pin layout and honesty of labels at
 * both required viewports without Supabase or TMDB. 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

function iso(daysFromNow: number, hour = 20): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

const UPCOMING: UpcomingEntry[] = [
  {
    airingId: 'air-1', programmeId: 'prog-1', title: 'Sample Verified Premiere Movie',
    posterUrl: null, channel: 'Hallmark Channel', startAtUtc: iso(1),
    programmeType: 'movie', kind: 'verified',
  },
  {
    airingId: 'air-2', programmeId: 'prog-2', title: 'Sample First-Seen Movie',
    posterUrl: null, channel: 'Hallmark Mystery', startAtUtc: iso(2),
    programmeType: 'movie', kind: 'derived',
  },
  {
    airingId: 'air-3', programmeId: 'prog-3', title: 'Sample Rerun Movie',
    posterUrl: null, channel: 'Lifetime', startAtUtc: iso(3),
    programmeType: 'movie', kind: 'scheduled',
  },
];

const FRANCHISES: CatalogFranchise[] = [
  {
    name: 'Sample Mystery Franchise',
    kind: 'movies',
    entries: [
      { tmdbId: 900001, mediaType: 'movie', title: 'Sample Mystery: The First Case', year: 2015, posterPath: null },
      { tmdbId: 900002, mediaType: 'movie', title: 'Sample Mystery: The Second Case', year: 2017, posterPath: null },
      { tmdbId: 900003, mediaType: 'movie', title: 'Sample Mystery: Year Unknown', year: null, posterPath: null },
    ],
  },
  {
    name: 'Sample Flagship Series',
    kind: 'series',
    entries: [{ tmdbId: 900010, mediaType: 'tv', title: 'Sample Flagship Series', year: 1992, posterPath: null }],
  },
];

const CHECKLIST: ChecklistItem[] = [
  {
    programmeId: 'prog-10', title: 'Sample Checklist Movie One', posterUrl: null,
    genres: ['Romance'], releaseYear: 2023, seen: true, latestAiringUtc: iso(1),
  },
  {
    programmeId: 'prog-11', title: 'Sample Checklist Movie Two', posterUrl: null,
    genres: ['Mystery'], releaseYear: 2024, seen: false, latestAiringUtc: iso(2),
  },
];

export default function PacksRepairHarness() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();

  return (
    <>
      <PublicHeader />
      <main className="container-page space-y-10 py-8">
        <section>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Pack repair states</h1>
          <p className="mt-1 text-sm text-slate-400">Fixture-driven render of the repaired pack components.</p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold text-white">Stale-data notice</h2>
          <StaleDataNotice coverageEndUtc={iso(-3)} />
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold text-white">Upcoming schedule (no verified premieres)</h2>
          <UpcomingScheduleList entries={UPCOMING} />
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold text-white">Franchise Order (catalog-derived)</h2>
          <CatalogFranchiseGroups groups={FRANCHISES} />
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold text-white">My Checklist (with items)</h2>
          <ChecklistView items={CHECKLIST} packSlug="hallmark-universe" signedIn />
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold text-white">Checklist empty states</h2>
          <div className="space-y-3">
            <PackEmptyState
              title="This Pack's channels aren't wired up"
              detail="No TV stations are linked to this Pack yet — a wiring problem on our side, not an empty catalog. It heals automatically on the next listings refresh."
            />
            <PackEmptyState
              title="No titles from this Pack's channels yet"
              detail="This Pack's channels are connected, but the listings feed hasn't carried any programmes for them yet. The checklist fills automatically as listings arrive — nothing to do on your side."
            />
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
