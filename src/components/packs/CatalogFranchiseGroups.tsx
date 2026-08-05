import Link from 'next/link';
import type { CatalogFranchise } from '@/lib/packs/catalogFranchises';

/**
 * Presentational half of the catalog-backed Franchise Order — split out of
 * FranchiseOrderView so the /dev/packs harness can render it with fixture
 * groups (no TMDB, no Supabase) and Playwright can pin the layout at both
 * required viewports. Every entry links to the real title page by its real
 * TMDB id; the caption labels the data as catalog-derived, distinct from
 * editorially verified `franchise_entries` rows.
 */
export function CatalogFranchiseGroups({ groups }: { groups: CatalogFranchise[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="space-y-5" data-testid="catalog-franchises">
      {groups.map((g) => (
        <div key={g.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" data-testid="catalog-franchise">
          <h3 className="text-base font-bold text-white">{g.name}</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {g.kind === 'movies'
              ? 'From the TMDB catalog, in release order — catalog-derived, not editorially verified.'
              : 'Flagship series, from the TMDB catalog.'}
          </p>
          <ol className="mt-3 space-y-2">
            {g.entries.map((e, i) => (
              <li key={`${e.mediaType}-${e.tmdbId}`}>
                <Link
                  href={`/app/title/${e.mediaType}/${e.tmdbId}`}
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-ink-850 p-2.5 transition hover:border-brand-400/50 hover:bg-white/[0.05]"
                >
                  {g.kind === 'movies' && (
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-white/10 text-xs font-bold text-slate-300">
                      {i + 1}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{e.title}</span>
                    {e.year != null && <span className="text-[12px] text-slate-400">{e.year}</span>}
                  </span>
                  <span className="text-[12px] font-bold text-brand-200">View →</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
