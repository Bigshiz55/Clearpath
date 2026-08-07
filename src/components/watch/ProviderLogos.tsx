'use client';

import { tmdbImage } from '@/lib/tmdb/image';
import type { WatchLine } from '@/lib/availability/watchPresentation';
import { dedupeByBrand } from '@/lib/availability/providerBrand';

/**
 * THE ONE PROVIDER-LOGO STRIP. Every WatchVerd1ct result card renders where a
 * title can be watched through this, so the behaviour is identical everywhere.
 *
 * The card used to stack one full-width "Included with …" row per provider — a
 * seven-line directory that dwarfed the recommendation. This shows the same
 * facts as a compact, wrapped row of the networks' OWN logos: at most two rows,
 * one preferred, with a "+N" overflow that the section's "View options" CTA
 * expands. The full "Included with Hulu" / "Apple TV — buy $3.99" sentence is
 * preserved as each tile's title + aria-label, so a screen reader and a hover
 * lose nothing.
 *
 * WHAT IT DOES NOT DO:
 *  • It never invents a logo. When TMDB gave us no logo_path the tile shows the
 *    short service name — never a guessed image.
 *  • It never merges different services, and it never shows the same brand
 *    twice: "Peacock Premium" and "Peacock Premium Plus" collapse to a single
 *    Peacock tile (the exact plans stay in View options). Dedup is by the
 *    provider's own logo when present, else a brand key derived by stripping
 *    generic tier words — no per-brand table.
 *  • It never changes what may be claimed. Availability type is preserved as a
 *    small corner badge (Free / Rent / Buy; included is the unmarked default).
 */

/** At most this many tiles show before the rest collapse into "+N"; chosen so a
 *  provider strip stays within two rows even on a narrow phone (~4–5 per row). */
const MAX_TILES = 8;

const BADGE_TONE: Record<string, string> = {
  Free: 'bg-emerald-500/25 text-emerald-100',
  Rent: 'bg-amber-500/25 text-amber-100',
  Buy: 'bg-amber-500/25 text-amber-100',
};

export function ProviderLogos({ lines }: { lines: WatchLine[] }) {
  const streaming = lines.filter((l) => l.kind === 'streaming');
  if (streaming.length === 0) return null;

  const deduped = dedupeByBrand(streaming);
  const shown = deduped.slice(0, MAX_TILES);
  const extra = deduped.length - shown.length;

  const tileClass =
    'relative inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg ' +
    'border border-white/10 bg-white/5 px-1.5 transition hover:border-brand-400/60 hover:bg-brand-500/15';

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="where-to-watch-providers">
      {shown.map((l, i) => {
        const logo = l.logoPath ? tmdbImage(l.logoPath, 'w92') : null;
        const label = l.service ?? l.text;
        const inner = (
          <>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt={label}
                width={28}
                height={28}
                loading="lazy"
                className="h-7 w-7 rounded object-contain"
              />
            ) : (
              <span className="max-w-[8rem] truncate px-1 text-[11px] font-semibold text-slate-100">
                {label}
              </span>
            )}
            {l.badge && (
              <span
                className={`absolute -bottom-1 -right-1 rounded px-1 text-[8px] font-bold leading-tight ${BADGE_TONE[l.badge] ?? 'bg-slate-600 text-slate-100'}`}
                aria-hidden
              >
                {l.badge}
              </span>
            )}
          </>
        );
        // The accessible label always carries the FULL fact (service + type),
        // even though the tile shows only a logo + a two-letter badge.
        const a11y = l.text;
        return l.href ? (
          <a
            key={`${label}|${i}`}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="where-to-watch-line"
            title={a11y}
            aria-label={a11y}
            className={tileClass}
          >
            {inner}
          </a>
        ) : (
          <span
            key={`${label}|${i}`}
            data-testid="where-to-watch-line"
            title={a11y}
            aria-label={a11y}
            className={tileClass}
          >
            {inner}
          </span>
        );
      })}
      {extra > 0 && (
        <span
          data-testid="where-to-watch-more"
          className="inline-flex h-9 items-center rounded-lg border border-white/10 bg-white/5 px-2 text-[11px] font-bold text-slate-300"
          title={`${extra} more service${extra === 1 ? '' : 's'} — open View options for every plan`}
          aria-label={`${extra} more services — see View options`}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
