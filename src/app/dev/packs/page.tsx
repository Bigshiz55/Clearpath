import { notFound } from 'next/navigation';
import { PremiereListOrCalendar, type PremiereEntry } from '@/components/packs/PremiereListOrCalendar';
import { CaseList, type CaseSummary, type UnmatchedProgramme } from '@/components/packs/CaseList';
import { PackEmptyState } from '@/components/packs/PackEmptyState';
import { PublicHeader, PublicFooter } from '@/components/discovery/DiscoveryLayout';

/**
 * Pack pages harness (gated by MOBILE_HARNESS=1 — the same flag every other
 * /dev/* control harness uses, not a new variable). Renders the REAL,
 * exact client components both Pack pages use (PremiereListOrCalendar,
 * CaseList, PackEmptyState) with fixture props, so Playwright can verify
 * layout/responsiveness at both required viewports without a live Supabase
 * session or a real TVmaze ingest. 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

function iso(daysFromNow: number, hour = 20): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}
function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

const PREMIERE_ENTRIES: PremiereEntry[] = [
  {
    programmeId: 'fixture-1',
    title: 'A Cranberry Christmas',
    posterUrl: null,
    channel: 'Hallmark Channel',
    premiereDate: dateOnly(iso(1)),
    startAtUtc: iso(1),
    seen: false,
    people: [{ id: 'p1', name: 'Alexa Sample', role: 'lead', following: true }],
  },
  {
    programmeId: 'fixture-2',
    title: 'Mystery 101: The Locked Room',
    posterUrl: null,
    channel: 'Hallmark Mystery',
    premiereDate: dateOnly(iso(1)),
    startAtUtc: iso(1, 22),
    seen: true,
    people: [],
  },
  {
    programmeId: 'fixture-3',
    title: 'Love in the Vineyard',
    posterUrl: null,
    channel: 'Lifetime',
    premiereDate: dateOnly(iso(4)),
    startAtUtc: iso(4),
    seen: false,
    people: [{ id: 'p2', name: 'Sample Actor Two', role: 'lead', following: false }],
  },
];

const CASES: CaseSummary[] = [
  {
    id: 'case-1',
    slug: 'fixture-case',
    title: 'The Fixture Case',
    description: 'A sample multi-network case for visual QA.',
    programmes: [
      { id: 'prog-1', title: 'Dateline: The Fixture Case', posterUrl: null, networks: ['Dateline (NBC)'], seen: true },
      { id: 'prog-2', title: '20/20: Revisiting the Fixture Case', posterUrl: null, networks: ['20/20 (ABC)'], seen: false },
      { id: 'prog-3', title: '48 Hours: The Fixture Case, Ten Years Later', posterUrl: null, networks: ['48 Hours (CBS)'], seen: false },
    ],
    seenCount: 1,
    totalCount: 3,
    nextUpcomingAiring: iso(2),
  },
];

const UNMATCHED: UnmatchedProgramme[] = [
  { id: 'prog-4', title: 'Homicide Hunter: A Different Story', posterUrl: null, networks: ['Investigation Discovery'], seen: false },
  { id: 'prog-5', title: 'Snapped: Another Case', posterUrl: null, networks: ['Oxygen'], seen: false },
];

export default function PacksHarness() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();

  return (
    <>
      <PublicHeader />
      <main className="container-page space-y-10 py-8">
        <section>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Hallmark Universe</h1>
          <p className="mt-1 text-sm text-slate-400">Premiere calendar and cast tracking (fixture data).</p>
          <h2 className="mb-2 mt-4 text-lg font-bold text-white">Premiere calendar</h2>
          <PremiereListOrCalendar entries={PREMIERE_ENTRIES} packSlug="hallmark-universe" signedIn />
        </section>

        <section>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Crime Case Files</h1>
          <p className="mt-1 text-sm text-slate-400">Case tracking and completion stats (fixture data).</p>
          <h2 className="mb-2 mt-4 text-lg font-bold text-white">Cases</h2>
          <CaseList cases={CASES} unmatched={UNMATCHED} packSlug="crime-case-files" signedIn />
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold text-white">Empty state</h2>
          <PackEmptyState title="No premieres in the next 6 weeks" detail="Listings refresh daily." />
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
