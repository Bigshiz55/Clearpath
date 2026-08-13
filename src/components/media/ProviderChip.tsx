import { tmdbImage } from '@/lib/tmdb/image';
import { officialProviderNames, resolveProviderBrand } from '@/lib/providers/brand';

/**
 * THE ONE STREAMING-PROVIDER BRAND CHIP.
 *
 * Logo-first, compact, recognizable. It renders the real branded logo in a
 * consistent bounding box — aspect-preserved, never stretched or cropped,
 * legible in dark mode, lazy, with an accessible label — whenever a VERIFIED
 * asset exists, which now includes brands the project has verified itself
 * (providers/assets.ts) and not only ones the caller happened to arrive with.
 * When no verified asset exists at all it falls back to a clean short NAME —
 * never a generic 📺 emoji, never a fabricated/guessed image URL.
 *
 * This is for STREAMING services (Netflix, Prime Video, …). Linear networks are a
 * DIFFERENT factual entity — see NetworkChip below — and must not be rendered
 * with a streaming provider's logo, or vice-versa.
 */

export interface ProviderChipData {
  /** Canonical/display provider name, e.g. "Netflix", "Prime Video".
   *  May legitimately be absent when a payload carries availability without a
   *  resolved service — the chip renders nothing rather than an empty pill. */
  name: string | null | undefined;
  /** TMDB logo_path when this caller holds one. Absent is fine — the registry
   *  falls back to its own verified asset for a brand we know. */
  logoPath?: string | null;
  /** TMDB watch-provider id, when the caller has one. The strongest key. */
  providerId?: number | null;
  /** Optional distribution note kept factually distinct, e.g. "via Amazon".
   *  Presentation may simplify, but an add-on route is NOT the base service. */
  via?: string | null;
}

export function ProviderChip({ data, withLabel = false }: { data: ProviderChipData; withLabel?: boolean }) {
  // The official spelling and the verified asset come from the one registry —
  // see src/lib/providers/brand.ts. `via` stays a separate fact: an add-on
  // route is not the base service and must not be folded into its name.
  const brand = resolveProviderBrand({ name: data.name, logoPath: data.logoPath, providerId: data.providerId });
  const logo = brand.logoPath ? tmdbImage(brand.logoPath, 'w92') : null;
  // NOTHING IDENTIFIES THIS SERVICE, SO NOTHING IS DRAWN. An empty white pill
  // is a brand mark for a brand that was never named; the caller's surrounding
  // copy still carries whatever the payload did know. (This branch used to be
  // unreachable because an absent name threw one level down — see
  // `safeName` in providers/brand.ts.)
  if (!brand.name && !logo) return null;
  const label = data.via ? `${brand.name} (${data.via})` : brand.name;

  if (logo) {
    return (
      <span
        className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-white/95 px-1.5 py-1 align-middle shadow-sm ring-1 ring-black/5"
        title={label}
      >
        {/* Fixed bounding box so one brand never dominates another because its
            source image has different dimensions. object-contain keeps aspect. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt={label}
          loading="lazy"
          data-testid="brand-mark"
          className="h-4 w-auto max-w-[68px] object-contain"
        />
        {withLabel && <span className="truncate pr-0.5 text-xs font-semibold text-ink-900">{brand.name}</span>}
        {data.via && <span className="pr-0.5 text-[10px] font-medium text-ink-700">{data.via}</span>}
      </span>
    );
  }

  // Clean text fallback — no emoji, no guessed logo.
  return (
    <span
      className="inline-flex max-w-full items-center rounded-md border border-white/15 bg-white/10 px-2 py-1 text-xs font-semibold text-slate-100"
      title={label}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * THE ONE LINEAR NETWORK/STATION BRAND CHIP.
 *
 * A LINEAR airing fact (ABC, CBS, Hallmark Channel…) — a different entity from a
 * streaming provider. It renders a verified network logo ONLY when real logo data
 * is present (today none is plumbed — `tv_stations.logo_url` / `linear_networks.
 * logo_path` exist but are unwritten, see docs/AI_DATA_ARCHITECTURE.md), so this
 * currently renders a clean network NAME. It never borrows a streaming logo and
 * never uses a 📺 emoji. When a verified linear logo source lands, pass `logoUrl`.
 */
export function NetworkChip({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  if (logoUrl) {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-white/95 px-1.5 py-1 align-middle shadow-sm ring-1 ring-black/5" title={name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={name} loading="lazy" data-testid="brand-mark" className="h-4 w-auto max-w-[68px] object-contain" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex max-w-full items-center rounded-md border border-brand-400/50 bg-brand-500/20 px-2 py-1 text-xs font-bold text-brand-100"
      title={name}
      data-testid="network-chip"
    >
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * A LIST OF SERVICES WE HOLD NO ASSETS FOR — SET AS TEXT, NOT AS EMOJI.
 *
 * Several surfaces know only NAMES ("everyone can watch it on Netflix, Hulu"),
 * because the group/verdict pipelines carry a service list rather than provider
 * rows with logo paths. Every one of them printed "📺 Netflix, Hulu".
 *
 * There is no asset to render, so the honest fallback is the official NAME —
 * which is what the brand registry is for. A television emoji is not a brand
 * mark, and standing one in front of a service list implies we know something
 * about the platform that we do not.
 */
export function ProviderNameList({
  names,
  label = 'On',
  className = '',
}: {
  names: string[];
  /** The lead-in word. "On [Netflix] [Hulu]". */
  label?: string;
  className?: string;
}) {
  const list = officialProviderNames(names);
  if (list.length === 0) return null;
  // A BRAND WE KNOW IS DRAWN, NOT SPELLED. These surfaces carry names only, so
  // this used to be a text list by necessity — but the registry now resolves a
  // verified asset from the name alone, and a service WatchVerd1ct knows should
  // look like itself here too. Anything we hold no asset for keeps the official
  // name, which is the honest fallback and never an emoji.
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`} data-testid="provider-name-list">
      <span className="text-slate-500">{label}</span>
      {list.map((n) => (
        <ProviderChip key={n} data={{ name: n }} />
      ))}
    </span>
  );
}
