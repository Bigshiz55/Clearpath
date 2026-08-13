'use client';

import { useEffect, useState } from 'react';
import { listCrews, type Crew } from '@/lib/actions/crews';

/**
 * SAVED CREWS, AS PART OF THE ROOM — not a lonely underlined link.
 *
 * Everything shown is real and read from `listCrews()`: the crew's name, its
 * actual people (initials for the stack, count for the label) and `dna.nights`,
 * which is the number of nights that crew has genuinely decided together. A
 * crew with no history says nothing about history. There is no invented "last
 * watched", no fabricated activity, no placeholder streak.
 *
 * Three honest states, and the empty one is designed rather than apologised
 * for: signed-out and setup-needed both fall back to it, because from the
 * visitor's side "you have no crews yet" is the same true sentence.
 */
export function CrewRail({ onManage }: { onManage: () => void }) {
  const [crews, setCrews] = useState<Crew[] | null>(null);

  useEffect(() => {
    let live = true;
    void listCrews()
      .then((r) => live && setCrews(r.ok && r.crews ? r.crews : []))
      .catch(() => live && setCrews([]));
    return () => {
      live = false;
    };
  }, []);

  return (
    <section aria-labelledby="crew-rail-heading" data-testid="crew-rail" className="w-full">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="crew-rail-heading" className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
          Your crews
        </h2>
        <button
          type="button"
          onClick={onManage}
          data-testid="open-crews"
          className="min-h-[44px] rounded-lg px-2 text-xs font-bold text-brand-200 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          Manage
        </button>
      </div>

      {/* Reserved while loading so the composition does not jump when the
          answer arrives — this column sits beside the CTA. */}
      {crews === null ? (
        <div className="mt-2 h-[132px] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]" aria-hidden />
      ) : crews.length === 0 ? (
        <div
          data-testid="crew-rail-empty"
          className="mt-2 rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-4"
        >
          <p className="text-sm font-bold text-white">No crews yet</p>
          <p className="mt-1 text-[13px] leading-snug text-slate-400">
            Save the people you watch with and the room already knows whose taste to weigh.
          </p>
          <button
            type="button"
            onClick={onManage}
            className="mt-3 min-h-[44px] w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm font-bold text-white transition hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            Create a crew
          </button>
        </div>
      ) : (
        <ul className="mt-2 space-y-2" data-testid="crew-rail-list">
          {crews.slice(0, 3).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={onManage}
                data-testid="crew-rail-item"
                className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 text-left transition hover:border-brand-400/40 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                {/* Initials, not invented avatars. The overlap reads as a
                    group at a glance and degrades cleanly at any count. */}
                <span aria-hidden className="flex flex-none -space-x-2">
                  {c.people.slice(0, 3).map((p) => (
                    <span
                      key={p.id}
                      className="grid h-8 w-8 place-items-center rounded-full border border-ink-950 bg-gradient-to-br from-brand-500/70 to-[#ff1493]/60 text-[11px] font-black text-white"
                    >
                      {p.name.trim().charAt(0).toUpperCase() || '?'}
                    </span>
                  ))}
                  {c.people.length > 3 && (
                    <span className="grid h-8 w-8 place-items-center rounded-full border border-ink-950 bg-white/10 text-[10px] font-black text-slate-200">
                      +{c.people.length - 3}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-white">{c.name}</span>
                  <span className="block truncate text-[12px] text-slate-400">
                    {c.people.length} {c.people.length === 1 ? 'member' : 'members'}
                    {/* Real history only. `nights` is incremented when the crew
                        actually decides something together. */}
                    {c.dna.nights > 0 && ` · ${c.dna.nights} ${c.dna.nights === 1 ? 'night' : 'nights'} decided`}
                  </span>
                </span>
                <span aria-hidden className="flex-none text-slate-500">
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
