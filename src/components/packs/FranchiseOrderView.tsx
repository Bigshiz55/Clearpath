import { createClient } from '@/lib/supabase/server';
import { listFranchiseNames, listFranchiseEntries } from '@/lib/packs/franchise';
import { getCatalogFranchises } from '@/lib/packs/catalogFranchises';
import { CatalogFranchiseGroups } from './CatalogFranchiseGroups';
import { PackEmptyState } from './PackEmptyState';
import { SourceNote } from './SourceNote';

const CONNECTION_LABEL: Record<string, string> = {
  direct_sequel: 'Direct sequel',
  shared_universe: 'Shared universe',
  standalone_same_franchise: 'Standalone, same franchise',
  unknown: 'Connection not yet verified',
};

/**
 * FRANCHISE ORDER — scoped to this Pack, and honest about how strong each
 * claim is.
 *
 * Two tiers, in this order:
 *
 *   1. `franchise_entries` — an editorially VERIFIED viewing order, with a
 *      source URL and confidence per entry. Scoped by `pack_slug` (0043) so
 *      Lifetime's franchises can never render under Hallmark, which is what
 *      the previous global lookup did.
 *   2. The build-time catalog artifact — membership and RELEASE order,
 *      resolved from TMDB at build time, doing zero upstream work here.
 *
 * The two are labelled differently on purpose. Release order is a derivable
 * fact; a verified viewing order is somebody's checked judgement. Presenting
 * them identically, as the old view did, quietly upgraded one into the other.
 */
export async function FranchiseOrderView({ packSlug }: { packSlug: string }) {
  const supabase = createClient();

  // Pack scoping depends on 0043's pack_slug column. Until it exists, show
  // NO curated groups rather than every Pack's — a wrong franchise is worse
  // than a missing one, and the catalog tier below still carries the section.
  let names: string[] = [];
  try {
    names = await listFranchiseNames(supabase, packSlug);
  } catch {
    names = [];
  }
  const groups = await Promise.all(
    names.map(async (name) => ({ name, entries: await listFranchiseEntries(supabase, name).catch(() => []) })),
  );
  const verified = groups.filter((g) => g.entries.length > 0);

  // Synchronous: a build artifact, not a lookup. See catalogFranchises.ts.
  const catalog = getCatalogFranchises(packSlug);

  if (verified.length === 0 && catalog.length === 0) {
    return (
      <PackEmptyState
        title="No franchises to show yet"
        detail="Nothing has been curated for this Pack and the catalog holds no matching series. Viewing order is never guessed from similar titles."
      />
    );
  }

  return (
    <div className="space-y-5">
      {verified.map((g) => (
        <div key={g.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" data-testid="verified-franchise">
          <h3 className="text-base font-bold text-white">{g.name}</h3>
          <p className="mt-0.5 text-[11px] text-brand-200">Verified viewing order — checked against a source, not derived.</p>
          <ol className="mt-3 space-y-2">
            {g.entries.map((e, i) => (
              <li key={e.id} className="flex items-start gap-3 rounded-lg border border-white/10 bg-ink-850 p-2.5">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-white/10 text-xs font-bold text-slate-300">
                  {e.sequenceNumber ?? i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{e.title}</p>
                  <p className="text-[12px] text-slate-400">{CONNECTION_LABEL[e.connection]}</p>
                  <div className="mt-1"><SourceNote sourceUrl={e.sourceUrl} confidence={e.confidence} /></div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
      <CatalogFranchiseGroups groups={catalog} />
    </div>
  );
}
