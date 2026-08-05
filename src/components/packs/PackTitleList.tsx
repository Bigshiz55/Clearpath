'use client';

import { useMemo, useState, useTransition } from 'react';
import { Poster } from '@/components/PosterCard';
import { SeenToggle } from './SeenToggle';
import { setOnChecklist } from '@/lib/actions/packs';
import type { PackTitle } from '@/lib/packs/checklist';

/**
 * One list component for both Pack title surfaces, because they are the same
 * rows answering different questions (see src/lib/packs/checklist.ts):
 *
 *   mode="browse"    every title the Pack's channels carry. The primary
 *                    action is "Add to my checklist".
 *   mode="checklist" only what the user added. The primary action is
 *                    "Remove".
 *
 * The filters are deliberately NOT "Want to watch". Browse offers "On my
 * list" and "Watched", both of which are facts the user created. There is no
 * control anywhere that turns "you have not watched this" into "you want to
 * watch this".
 */

type Filter = 'all' | 'listed' | 'watched' | 'unwatched';

export function PackTitleList({
  items,
  packId,
  packSlug,
  signedIn,
  mode,
  listStorageAvailable,
}: {
  items: PackTitle[];
  packId: string;
  packSlug: string;
  signedIn: boolean;
  mode: 'browse' | 'checklist';
  listStorageAvailable: boolean;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [genre, setGenre] = useState<string | null>(null);
  // Optimistic membership so the row responds on the first tap.
  const [listed, setListed] = useState<Record<string, boolean>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const genres = useMemo(() => [...new Set(items.flatMap((i) => i.genres))].sort(), [items]);
  const isListed = (i: PackTitle) => listed[i.programmeId] ?? i.onList;

  const watchedCount = items.filter((i) => i.seen).length;

  const filtered = items.filter((i) => {
    if (filter === 'listed' && !isListed(i)) return false;
    if (filter === 'watched' && !i.seen) return false;
    if (filter === 'unwatched' && i.seen) return false;
    if (genre && !i.genres.includes(genre)) return false;
    return true;
  });

  function toggleList(item: PackTitle) {
    const next = !isListed(item);
    setListed((m) => ({ ...m, [item.programmeId]: next }));
    setError(null);
    startTransition(async () => {
      const res = await setOnChecklist({
        packId, packSlug, programmeId: item.programmeId, onList: next,
      });
      if (!res.ok) {
        // Put the row back the way it was — a failed write must not leave the
        // UI claiming something the database does not hold.
        setListed((m) => ({ ...m, [item.programmeId]: !next }));
        setError(res.error ?? 'Could not update your checklist.');
      }
    });
  }

  const chip = (active: boolean) =>
    `min-h-[36px] rounded-full border px-3.5 text-sm font-semibold transition ${
      active ? 'border-brand-400/60 bg-brand-500/25 text-brand-100' : 'border-white/15 bg-white/[0.04] text-slate-300 hover:border-white/30'
    }`;

  return (
    <div className="space-y-3" data-testid={mode === 'browse' ? 'pack-browse-list' : 'pack-checklist-list'}>
      {signedIn && (
        <p className="text-sm font-semibold text-slate-300">
          {mode === 'checklist'
            ? `${items.length} on your checklist · ${watchedCount} watched`
            : `${items.length} titles on this Pack's channels · ${watchedCount} you have watched`}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setFilter('all')} className={chip(filter === 'all')}>All</button>
        {mode === 'browse' && signedIn && listStorageAvailable && (
          <button type="button" onClick={() => setFilter('listed')} className={chip(filter === 'listed')}>On my list</button>
        )}
        <button type="button" onClick={() => setFilter('watched')} className={chip(filter === 'watched')}>Watched</button>
        <button type="button" onClick={() => setFilter('unwatched')} className={chip(filter === 'unwatched')}>Not watched</button>
      </div>

      {genres.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {genres.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGenre(genre === g ? null : g)}
              className={`min-h-[30px] rounded-full border px-2.5 text-xs font-semibold transition ${
                genre === g ? 'border-[#ff1493]/60 bg-[#ff1493]/20 text-pink-100' : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 p-2 text-sm text-red-200">{error}</p>
      )}

      <ul className="space-y-2">
        {filtered.map((item) => (
          <li
            key={item.programmeId}
            data-testid="pack-title-row"
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
          >
            <span className="block h-14 w-10 flex-none overflow-hidden rounded-md bg-ink-800">
              <Poster posterUrl={item.posterUrl} title={item.title} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{item.title}</p>
              {item.genres.length > 0 && (
                <p className="truncate text-[12px] text-slate-400">{item.genres.join(' · ')}</p>
              )}
            </div>
            <div className="flex flex-none items-center gap-1.5">
              {signedIn && listStorageAvailable && (
                <button
                  type="button"
                  onClick={() => toggleList(item)}
                  disabled={pending}
                  aria-pressed={isListed(item)}
                  data-testid="pack-list-toggle"
                  className={`min-h-[36px] rounded-lg border px-2.5 text-xs font-bold transition disabled:opacity-60 ${
                    isListed(item)
                      ? 'border-brand-400/60 bg-brand-500/25 text-brand-100'
                      : 'border-white/15 bg-white/[0.04] text-slate-200 hover:border-white/30'
                  }`}
                >
                  {isListed(item) ? 'On list ✓' : '+ List'}
                </button>
              )}
              {signedIn && (
                <SeenToggle
                  subjectType="programme"
                  subjectId={item.programmeId}
                  packSlug={packSlug}
                  initialSeen={item.seen}
                  size="sm"
                />
              )}
            </div>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-400">
          Nothing matches those filters.
        </p>
      )}
    </div>
  );
}
