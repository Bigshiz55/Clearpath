import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getPackBySlug } from '@/lib/packs/packs';
import { ensurePackIngested } from '@/lib/packs/lazyIngest';
import { PremiereCalendarView } from '@/components/packs/PremiereCalendarView';
import { CaseBrowserView } from '@/components/packs/CaseBrowserView';
import { ChecklistSection } from '@/components/packs/ChecklistSection';
import { FranchiseOrderView } from '@/components/packs/FranchiseOrderView';
import { CaseSearchBox } from '@/components/packs/CaseSearchBox';
import { PackEmptyState } from '@/components/packs/PackEmptyState';
import { PublicHeader, PublicFooter } from '@/components/discovery/DiscoveryLayout';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  try {
    const supabase = createClient();
    const pack = await getPackBySlug(supabase, params.slug);
    return { title: pack ? `${pack.displayName} · WatchVerd1ct` : 'Pack · WatchVerd1ct' };
  } catch {
    return { title: 'Pack · WatchVerd1ct' };
  }
}

/** Readable failure card — names the cause instead of a bare digest, matching
 *  the pattern already used by src/app/app/title/[type]/[id]/page.tsx. */
function PackErrorCard({ message }: { message: string }) {
  return (
    <>
      <PublicHeader />
      <main className="container-page py-8">
        <div className="mx-auto max-w-lg rounded-2xl border border-white/15 bg-white/[0.04] p-8 text-center">
          <h1 className="text-xl font-semibold text-white">This Pack couldn’t load</h1>
          <p className="mt-2 text-sm text-slate-400">{message}</p>
          <Link href="." className="btn-primary mt-6 inline-flex">
            ↻ Try again
          </Link>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}

/**
 * The shared Pack page. Renders every Pack from this SAME component. The
 * only thing that ever varies feature-by-feature is which of the Pack's
 * boolean flags (premiereCalendar, caseTracking, personTracking,
 * completionStats, franchiseContinuity) are true — nothing here branches on
 * `pack.slug`. A new Pack that enables the same flags renders correctly with
 * zero code changes; one that needs a genuinely new feature needs a new flag
 * column (a schema change, out of scope here), not a slug check.
 */
export default async function PackPage({ params }: { params: { slug: string } }) {
  const supabase = createClient();

  let pack;
  try {
    pack = await getPackBySlug(supabase, params.slug);
  } catch (e) {
    return <PackErrorCard message={causeMessage(e)} />;
  }
  if (!pack) notFound();

  try {
    // Lazy self-ingest: populates this Pack's data before rendering if it has
    // none yet, or its last successful ingest is stale. Concurrent requests
    // are serialized to exactly one actual ingest (migration 0038). A request
    // that loses the race, or that hits any other error here, still renders —
    // never blocked or blanked by ingest bookkeeping.
    const ingest = await ensurePackIngested(supabase, pack);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const hasAnyFeature = pack.premiereCalendar || pack.caseTracking;

    return (
      <>
      <PublicHeader />
      <main className="container-page space-y-6 py-8">
        <section>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">{pack.displayName}</h1>
          {pack.description && <p className="mt-1 text-sm text-slate-400">{pack.description}</p>}
        </section>

        {ingest.attempted && !ingest.ok && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.07] p-3 text-sm text-amber-200">
            Today’s listings refresh for this Pack didn’t fully complete{ingest.error ? `: ${ingest.error}` : '.'} Showing
            whatever was ingested before this; it’ll retry automatically on the next visit.
          </div>
        )}

        {ingest.inProgressElsewhere && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
            This Pack’s listings are refreshing right now — showing what’s already been ingested; reload in a moment
            for the latest.
          </div>
        )}

        {pack.premiereCalendar && (
          <section>
            <h2 className="mb-2 text-lg font-bold text-white">Premiere calendar</h2>
            <PremiereCalendarView pack={pack} userId={user?.id ?? null} />
          </section>
        )}

        {pack.caseTracking && (
          <>
            <CaseSearchBox packSlug={pack.slug} />
            <section>
              <h2 className="mb-2 text-lg font-bold text-white">Cases</h2>
              <CaseBrowserView pack={pack} userId={user?.id ?? null} />
            </section>
          </>
        )}

        {pack.completionStats && !pack.caseTracking && (
          <section>
            <h2 className="mb-2 text-lg font-bold text-white">My Checklist</h2>
            <ChecklistSection pack={pack} userId={user?.id ?? null} />
          </section>
        )}

        {pack.franchiseContinuity && (
          <section>
            <h2 className="mb-2 text-lg font-bold text-white">Franchise Order</h2>
            <FranchiseOrderView />
          </section>
        )}

        {!hasAnyFeature && (
          <PackEmptyState
            title="This Pack has no active features yet"
            detail="This Pack doesn't have any features enabled yet."
          />
        )}

        {!user && (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-400">
            Sign in to mark titles seen and follow people or Cases.
          </p>
        )}

        {/* TVmaze attribution — every surface showing TVmaze-sourced listings
            shares this one credit (see src/app/app/tv/page.tsx for the
            precedent). Poster art is hotlinked directly to TVmaze's own URLs,
            never mirrored to our storage. */}
        <p className="text-[11px] text-slate-500">
          Listings and artwork from{' '}
          <a href="https://www.tvmaze.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">
            TVmaze
          </a>
          ’s community broadcast guide — real schedules, refreshed daily. We never invent a listing; a channel with
          no data simply won’t appear.
        </p>
      </main>
      <PublicFooter />
    </>
    );
  } catch (e) {
    return <PackErrorCard message={causeMessage(e)} />;
  }
}

/**
 * A Postgres/DB error message is safe, human-legible text (e.g. "relation
 * \"packs\" does not exist") — never a secret — so it's fine to surface
 * directly rather than only a digest.
 *
 * Supabase's PostgrestError (thrown by `if (error) throw error` in the
 * packs data layer) is a plain object shaped like an Error, not always an
 * actual `instanceof Error` — so this checks for a usable `.message` string
 * on any thrown value, not only real Error instances.
 */
function causeMessage(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    const msg = (e as { message: string }).message;
    if (msg) return msg;
  }
  return 'An unexpected error occurred.';
}
