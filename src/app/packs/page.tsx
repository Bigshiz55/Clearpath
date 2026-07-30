import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { listPacks } from '@/lib/packs/packs';
import { PublicHeader, PublicFooter } from '@/components/discovery/DiscoveryLayout';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Packs · WatchVerd1ct',
  description: 'Optional depth layers for the shows you already watch — premiere calendars, case tracking, and more.',
};

/** Short, honest one-liners per Pack, keyed by slug — no slug branching in the
 *  data layer or the shared [slug] page itself, just this index's own copy. */
const BLURB: Record<string, string> = {
  'hallmark-lifetime': 'Never miss a premiere — a calendar of what’s new on Hallmark & Lifetime, with Follow and Seen tracking.',
  'true-crime': 'Browse true crime Cases across the networks that cover them, and track what you’ve already seen.',
};

export default async function PacksIndexPage() {
  const supabase = createClient();
  const packs = await listPacks(supabase).catch(() => []);

  return (
    <>
      <PublicHeader />
      <main className="container-page space-y-6 py-8">
        <section>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Packs</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Optional depth layers for the shows you already watch — a premiere calendar, case tracking, and more,
            for the networks you follow most.
          </p>
        </section>

        {packs.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            No Packs are available right now.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {packs.map((pack) => (
              <Link
                key={pack.slug}
                href={`/packs/${pack.slug}`}
                data-testid={`pack-card-${pack.slug}`}
                className="card group flex flex-col gap-2 p-5 transition hover:-translate-y-0.5 hover:border-white/25"
              >
                <h2 className="text-xl font-bold text-white">{pack.displayName}</h2>
                <p className="text-sm text-slate-400">{pack.description || BLURB[pack.slug] || 'Explore this Pack.'}</p>
                <span className="mt-2 text-sm font-semibold text-brand-300 group-hover:text-brand-200">
                  Open {pack.displayName} →
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
      <PublicFooter />
    </>
  );
}
