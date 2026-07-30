'use client';

import { useState } from 'react';
import Image from 'next/image';
import { tmdbImage } from '@/lib/tmdb/image';

interface SimilarResult {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
}

/**
 * "More like this" for a checklist item — on-demand only, never fetched for
 * a whole checklist up front. Real TMDB recommendations, so results are
 * general TMDB catalog titles, not guaranteed to be on this Pack's channels.
 */
export function SimilarButton({ programmeId }: { programmeId: string }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SimilarResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (results != null) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/packs/similar?programmeId=${encodeURIComponent(programmeId)}`);
      const body = (await res.json()) as { results?: SimilarResult[] };
      setResults(body.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => void toggle()}
        className="text-[12px] font-semibold text-brand-300 hover:text-brand-200"
      >
        {open ? 'Hide similar titles' : 'More like this'}
      </button>
      {open && (
        <div className="mt-1.5">
          {busy && <p className="text-[12px] text-slate-500">Looking...</p>}
          {!busy && results != null && results.length === 0 && (
            <p className="text-[12px] text-slate-500">No matches found from TMDB for this title.</p>
          )}
          {!busy && results != null && results.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {results.map((r) => (
                <div key={`${r.mediaType}-${r.id}`} className="w-14 flex-shrink-0" title={`${r.title}${r.year ? ` (${r.year})` : ''}`}>
                  <div className="h-20 w-14 overflow-hidden rounded bg-ink-800">
                    {tmdbImage(r.posterPath, 'w185') ? (
                      <Image
                        src={tmdbImage(r.posterPath, 'w185')!}
                        alt={r.title}
                        width={56}
                        height={80}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-slate-400">{r.title}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
