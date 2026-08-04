'use client';

import { useEffect, useState } from 'react';
import { loadTileFacts } from '@/lib/tileFacts';
import type { MediaType } from '@/lib/types';
import type { CardAvailability as CardAvailabilityData } from '@/lib/watchmode/cardAvailability';
import { timeAgo } from '@/lib/format/timeAgo';

/**
 * WHERE TO WATCH IT — from the cache the Watchmode sync job fills, never a
 * live call from here (see src/lib/watchmode/sync.ts). Three honest states,
 * visually distinct on purpose (req: absence of data must not read as
 * absence of availability):
 *  - never checked        -> "Availability not currently confirmed" (muted,
 *                             no claim either way — NOT "checking", because
 *                             the sync job only advances ~50 titles/day from
 *                             a fixed pool, so for most titles no check is
 *                             ever queued; claiming one is "in progress"
 *                             when it structurally may never run is exactly
 *                             the dead-end this wording used to produce)
 *  - checked, nothing     -> "Not currently available to stream" (a real result)
 *  - checked, N sources   -> the source badges, labeled by the real type we
 *                             have (subscription/rent/buy/free) — linked
 *                             where we have a deeplink
 *
 * Same per-title fetch `CardFacts`/`CardSynopsis` already make — see
 * `src/lib/tileFacts.ts` — so this costs the card nothing extra.
 */
const TYPE_LABEL: Record<CardAvailabilityData['sources'][number]['type'], string> = {
  subscription: 'Available by subscription',
  rent: 'Rent',
  buy: 'Buy',
  free: 'Free',
};

export function CardAvailability({ mediaType, tmdbId, className = '' }: { mediaType: MediaType; tmdbId: number; className?: string }) {
  const [availability, setAvailability] = useState<CardAvailabilityData | null>(null);

  useEffect(() => {
    let active = true;
    loadTileFacts(mediaType, tmdbId).then((f) => {
      if (active) setAvailability(f.availability);
    });
    return () => {
      active = false;
    };
  }, [mediaType, tmdbId]);

  if (!availability || availability.status === 'unconfirmed') {
    return (
      <div className={`text-[11px] text-slate-500 ${className}`} data-testid="card-availability-unconfirmed">
        Availability not currently confirmed
      </div>
    );
  }

  const checked = timeAgo(availability.checkedAt);

  if (availability.status === 'none') {
    return (
      <div className={`text-[11px] text-slate-500 ${className}`} data-testid="card-availability-none">
        Not currently available to stream
        {checked && <span data-testid="card-availability-checked"> · checked {checked}</span>}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
      data-testid="card-availability"
      data-checked-at={availability.checkedAt ?? undefined}
      title={checked ? `Availability checked ${checked}` : undefined}
    >
      {availability.sources.map((s) => {
        const label = `${TYPE_LABEL[s.type]} on ${s.name}`;
        const pill = (
          <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] font-semibold text-slate-200">
            {s.name}
          </span>
        );
        return s.deeplink ? (
          <a
            key={`${s.name}|${s.type}`}
            href={s.deeplink}
            target="_blank"
            rel="noopener noreferrer"
            title={`${label} ↗`}
            aria-label={`${label}, opens ${s.name} in a new tab`}
            data-testid="card-availability-link"
            className="transition hover:border-brand-400/60 hover:bg-brand-500/15"
          >
            {pill}
          </a>
        ) : (
          <span key={`${s.name}|${s.type}`} title={label}>
            {pill}
          </span>
        );
      })}
    </div>
  );
}
