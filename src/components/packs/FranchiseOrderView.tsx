import { createClient } from '@/lib/supabase/server';
import { listFranchiseNames, listFranchiseEntries } from '@/lib/packs/franchise';
import { PackEmptyState } from './PackEmptyState';
import { SourceNote } from './SourceNote';

const CONNECTION_LABEL: Record<string, string> = {
  direct_sequel: 'Direct sequel',
  shared_universe: 'Shared universe',
  standalone_same_franchise: 'Standalone, same franchise',
  unknown: 'Connection not yet verified',
};

/**
 * Franchise Order — verified viewing order only. Never inferred from
 * title-string similarity: every entry here is a real `franchise_entries`
 * row with its own source and confidence (migration 0039). Empty and honest
 * until a franchise is actually curated.
 */
export async function FranchiseOrderView() {
  const supabase = createClient();
  const names = await listFranchiseNames(supabase);

  if (names.length === 0) {
    return (
      <PackEmptyState
        title="No verified franchises yet"
        detail="Viewing order is only shown once it's been checked against a real source — never guessed from similar titles. Check back as franchises are curated."
      />
    );
  }

  const groups = await Promise.all(names.map(async (name) => ({ name, entries: await listFranchiseEntries(supabase, name) })));

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-base font-bold text-white">{g.name}</h3>
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
    </div>
  );
}
