import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getPackBySlug } from '@/lib/packs/packs';
import { getPackFreshness } from '@/lib/packs/packRefresh';
import { PremiereCalendarView } from '@/components/packs/PremiereCalendarView';
import { CaseBrowserView } from '@/components/packs/CaseBrowserView';
import { PackBrowseSection, MyChecklistSection } from '@/components/packs/ChecklistSection';
import { FranchiseOrderView } from '@/components/packs/FranchiseOrderView';
import { CaseSearchBox } from '@/components/packs/CaseSearchBox';
import { PackEmptyState } from '@/components/packs/PackEmptyState';
import { StaleDataNotice } from '@/components/packs/StaleDataNotice';
import { PackChrome } from '@/components/packs/PackChrome';
import { publicEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * NO `maxDuration` OVERRIDE ANY MORE.
 *
 * This page used to declare `maxDuration = 60` because it ran a full TVmaze
 * ingest inside the customer's GET (see src/lib/packs/packRefresh.ts for the
 * autopsy). It now performs reads only — the Pack row, the user, listings
 * coverage, and whatever each section needs — so it belongs on the platform
 * default like every other page. If this ever needs raising again, something
 * has been put back on the request path that does not belong there.
 */

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const canonical = `${publicEnv.siteUrl()}/packs/${params.slug}`;
  try {
    const supabase = createClient();
    const pack = await getPackBySlug(supabase, params.slug);
    return {
      title: pack ? `${pack.displayName} · WatchVerd1ct` : 'Pack · WatchVerd1ct',
      alternates: { canonical },
    };
  } catch {
    return { title: 'Pack · WatchVerd1ct', alternates: { canonical } };
  }
}

/** Readable failure card — names the cause instead of a bare digest. */
function PackErrorCard({ message }: { message: string }) {
  return (
    <PackChrome>
      <main className="container-page py-8">
        <div className="mx-auto max-w-lg rounded-2xl border border-white/15 bg-white/[0.04] p-8 text-center">
          <h1 className="text-xl font-semibold text-white">This Pack couldn’t load</h1>
          <p className="mt-2 text-sm text-slate-400">{message}</p>
          <Link href="." className="btn-primary mt-6 inline-flex">↻ Try again</Link>
        </div>
      </main>
    </PackChrome>
  );
}

/**
 * The shared Pack page. Every Pack renders from this SAME component; the only
 * thing that varies is which of the Pack's boolean feature flags are true.
 * Nothing here branches on `pack.slug`.
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
    const [{ data: { user } }, freshness] = await Promise.all([
      supabase.auth.getUser(),
      getPackFreshness(supabase),
    ]);

    const hasAnyFeature = pack.premiereCalendar || pack.caseTracking;

    return (
      <PackChrome>
        <main className="container-page space-y-6 py-8">
          <section>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">{pack.displayName}</h1>
            {pack.description && <p className="mt-1 text-sm text-slate-400">{pack.description}</p>}
          </section>

          {/* Staleness is a fact the customer sees, not an empty state we
              hide behind. The notice also asks the server — off this
              request — to refresh, which is the only trigger a page render
              is allowed to have. */}
          {freshness.stale && <StaleDataNotice coverageEndUtc={freshness.coverageEndUtc} />}

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
            <>
              <section>
                <h2 className="mb-2 text-lg font-bold text-white">My Checklist</h2>
                <MyChecklistSection pack={pack} userId={user?.id ?? null} />
              </section>
              <section>
                <h2 className="mb-1 text-lg font-bold text-white">Browse Pack</h2>
                <p className="mb-2 text-sm text-slate-400">
                  Everything this Pack’s channels carry. Add what you want to your checklist.
                </p>
                <PackBrowseSection pack={pack} userId={user?.id ?? null} />
              </section>
            </>
          )}

          {pack.franchiseContinuity && (
            <section>
              <h2 className="mb-2 text-lg font-bold text-white">Franchise Order</h2>
              <FranchiseOrderView packSlug={pack.slug} />
            </section>
          )}

          {!hasAnyFeature && (
            <PackEmptyState
              title="This Pack has no active features yet"
              detail="This Pack doesn't have any features enabled yet."
            />
          )}

          {/* Listings attribution — both providers, because both feed this
              page and claiming only one would misstate the source. */}
          <p className="text-[11px] text-slate-500">
            Listings from{' '}
            <a href="https://www.tvmaze.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">
              TVmaze
            </a>{' '}
            and TV Media. Franchise membership and artwork from{' '}
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">
              TMDB
            </a>
            . We never invent a listing; a channel with no data simply won’t appear.
          </p>
        </main>
      </PackChrome>
    );
  } catch (e) {
    return <PackErrorCard message={causeMessage(e)} />;
  }
}

/**
 * A Postgres/DB error message is safe, human-legible text — never a secret —
 * so it is fine to surface directly rather than only a digest.
 */
function causeMessage(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    const msg = (e as { message: string }).message;
    if (msg) return msg;
  }
  return 'An unexpected error occurred.';
}
