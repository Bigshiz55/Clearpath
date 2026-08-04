import type { AvailabilityState } from '@/lib/watchmode/cardAvailability';

/**
 * THE ONE PLACE A CARD DECIDES WHAT TO SAY ABOUT WHERE SOMETHING CAN BE
 * WATCHED — and, just as importantly, what it must NOT say.
 *
 * Pure, client-safe, no I/O. Every surface (Watch, New Releases, On TV, Packs,
 * search, recommendations) routes through this so there is exactly one mapping
 * from verified data to displayed words and one mapping from state to call-to-
 * action. Per-page provider logic is how "Included with Hulu" ends up on a
 * rental, and how a show's ORIGINAL NETWORK ends up rendered as a place you
 * can watch it tonight.
 *
 * ── THE RULE THIS MODULE EXISTS TO ENFORCE ────────────────────────────────
 * A verdict is a claim about TASTE. Availability is a claim about FACT. The
 * card previously showed "82 · STREAM IT" directly above "Availability not
 * currently confirmed", which is a contradiction: the first reads as an
 * instruction to go stream it, while the second admits we do not know whether
 * that is possible. `scoreVerdict` takes a score and nothing else — it has
 * never had an availability input and never should. So the fix is not to
 * change the score; it is to stop the score's wording from making an
 * availability claim, and to put a real, separately-sourced WHERE TO WATCH
 * block next to it.
 *
 * ── WHAT MAY NEVER BECOME AN OPTION ───────────────────────────────────────
 * Nothing here infers a provider. An option must arrive already evidenced by
 * an application record. In particular a provider is NEVER derived from:
 * the title's original network, a poster, a search-result snippet, general
 * knowledge, or a service that used to carry the title. `originalNetwork` is
 * accepted as INPUT but can only ever reach `historical`, which the UI is
 * required to label as history rather than availability.
 */

// ---------------------------------------------------------------------------
// Options — the evidenced facts a card may present
// ---------------------------------------------------------------------------

export interface StreamingOption {
  kind: 'streaming';
  /** The service as the user knows it: "Hulu", "BritBox", "Prime Video". */
  service: string;
  state: AvailabilityState;
  /** REQUIRED when state is 'included_with_addon'. Without it the option is
   *  dropped rather than shown as ordinary inclusion — see `usableOptions`. */
  addonName: string | null;
  /** Formatted price, e.g. "$2.99". Only ever set from verified data. */
  price: string | null;
  /** A real deep link. Null means we have no link, never a guessed one. */
  watchLink: string | null;
  lastVerifiedAt: string | null;
  logoPath?: string | null;
}

export interface LiveOption {
  kind: 'live';
  /** The network CARRYING THE AIRING — not the network that first aired it. */
  network: string;
  /** Local station callsign when the lineup provides one. */
  station: string | null;
  /** Channel number, only when the user's own lineup supplies it. */
  channelNumber: string | null;
  startsAtIso: string;
  endsAtIso: string | null;
}

export type WatchOption = StreamingOption | LiveOption;

export interface WatchPresentationInput {
  options: WatchOption[];
  /**
   * Whether the availability system actually looked. This is the difference
   * between "we have not checked" and "we checked and found nothing", and the
   * two must never collapse: the first is ignorance, the second is a result.
   */
  checked: boolean;
  /** Historical metadata ONLY. Cannot reach `lines`. */
  originalNetwork?: string | null;
  /** For deciding live-now vs upcoming. Injected so this stays pure. */
  now?: Date;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type WatchStatus = 'available' | 'none' | 'unknown';

export type CtaKind =
  | 'watch_now'
  | 'view_options'
  | 'tune_in'
  | 'set_reminder'
  | 'rent'
  | 'buy'
  | 'check_availability'
  | 'notify_me';

export interface WatchLine {
  /** Primary text, e.g. "Included with Hulu" or "CBS". */
  text: string;
  /** Secondary line, e.g. "WTVR · Channel 6" or "Tonight at 9:00 PM". */
  detail: string | null;
  /** "Last verified 3 days ago" — shown only where it changes the reading. */
  verified: string | null;
  href: string | null;
  /** Lets the UI style live airings differently from streaming rows. */
  kind: 'streaming' | 'live';
  /** True only for a live airing happening right now. */
  liveNow?: boolean;
}

export interface WatchPresentation {
  status: WatchStatus;
  lines: WatchLine[];
  cta: { kind: CtaKind; label: string; href: string | null };
  /** The honest sentence for an unknown/none state. Null when available. */
  note: string | null;
  /** e.g. "Originally aired on CBS" — history, never current availability. */
  historical: string | null;
  /** Screen-reader summary that names what kind of claim this is. */
  ariaLabel: string;
}

// ---------------------------------------------------------------------------
// State vocabulary
// ---------------------------------------------------------------------------

/** States that assert nothing and must never be rendered as availability. */
const NON_CLAIMS: ReadonlySet<AvailabilityState> = new Set<AvailabilityState>(['unverified', 'unavailable']);

/** Paid-transaction states — never describable as "included". */
const TRANSACTIONAL: ReadonlySet<AvailabilityState> = new Set<AvailabilityState>(['rent', 'buy']);

/**
 * Display order. A live airing happening NOW is the most actionable thing on
 * the card; a future airing ranks below anything already watchable.
 */
const STATE_RANK: Record<AvailabilityState, number> = {
  included_with_base_subscription: 20,
  included_with_prime: 21,
  included_with_premium_tier: 22,
  library_access: 23,
  included_with_addon: 24,
  free_with_ads: 25,
  leaving_soon: 26,
  rent: 40,
  buy: 41,
  coming_soon: 50,
  unavailable: 99,
  unverified: 99,
};

/**
 * The exact words for each state. Deliberately explicit rather than generated:
 * "included with premium tier" and "included through an add-on" are DIFFERENT
 * claims from "included with the base subscription", and a user who acts on
 * the wrong one hits a paywall.
 */
function streamingText(o: StreamingOption): string {
  const s = o.service;
  switch (o.state) {
    case 'included_with_base_subscription':
      return `Included with ${s}`;
    case 'included_with_premium_tier':
      return `${s} — premium tier`;
    case 'included_with_prime':
      return 'Included with Prime';
    case 'included_with_addon':
      return `${s} — ${o.addonName!} add-on`;
    case 'free_with_ads':
      return `Free with ads on ${s}`;
    case 'library_access':
      return `Included with ${s} library access`;
    case 'rent':
      return o.price ? `${s} — rent ${o.price}` : `${s} — rent`;
    case 'buy':
      return o.price ? `${s} — buy ${o.price}` : `${s} — buy`;
    case 'coming_soon':
      return `Coming soon to ${s}`;
    case 'leaving_soon':
      return `Leaving ${s} soon`;
    default:
      // Unreachable: NON_CLAIMS are filtered before this runs. Returning the
      // bare service name rather than throwing means a future state added to
      // the union degrades to something true instead of crashing a grid.
      return s;
  }
}

/**
 * Drops everything that is not a displayable, evidenced claim.
 *
 * An add-on option with no add-on name is DISCARDED, not downgraded: we know
 * the title needs an add-on but not which one, and rendering it as plain
 * inclusion would turn a partial fact into a false one.
 */
export function usableOptions(options: WatchOption[]): WatchOption[] {
  return options.filter((o) => {
    if (o.kind === 'live') return Boolean(o.network) && Boolean(o.startsAtIso);
    if (NON_CLAIMS.has(o.state)) return false;
    if (o.state === 'included_with_addon' && !o.addonName) return false;
    return Boolean(o.service);
  });
}

// ---------------------------------------------------------------------------
// Live airings
// ---------------------------------------------------------------------------

export function airingStatus(o: LiveOption, now: Date): 'live_now' | 'upcoming' | 'ended' {
  const start = Date.parse(o.startsAtIso);
  if (!Number.isFinite(start)) return 'upcoming';
  const end = o.endsAtIso ? Date.parse(o.endsAtIso) : NaN;
  if (now.getTime() < start) return 'upcoming';
  if (Number.isFinite(end)) return now.getTime() < end ? 'live_now' : 'ended';
  // No end time: treat as live for a conventional slot length rather than
  // claiming it has ended, which would hide something still on air.
  return now.getTime() < start + 60 * 60 * 1000 ? 'live_now' : 'ended';
}

/**
 * The airing time IN THE VIEWER'S OWN TIME ZONE. `toLocaleTimeString` with no
 * explicit zone uses the runtime's, which in the browser is the user's — the
 * requirement is that a 9pm ET airing does not read as 9pm to someone in
 * California.
 */
export function airingWhen(o: LiveOption, now: Date): string {
  const start = new Date(o.startsAtIso);
  if (Number.isNaN(start.getTime())) return '';
  const time = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const sameDay = start.toDateString() === now.toDateString();
  if (sameDay) return `Tonight at ${time}`;
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (start.toDateString() === tomorrow.toDateString()) return `Tomorrow at ${time}`;
  return `${start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${time}`;
}

/** "WTVR · Channel 6", or just one of them, or nothing. */
export function stationLine(o: LiveOption): string | null {
  const parts: string[] = [];
  if (o.station) parts.push(o.station);
  if (o.channelNumber) parts.push(`Channel ${o.channelNumber}`);
  return parts.length ? parts.join(' · ') : null;
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

/** Only surfaced once it is old enough to change how the claim should be read. */
export function verifiedLabel(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((now.getTime() - t) / DAY);
  if (days < 7) return null;
  if (days < 14) return 'Last verified over a week ago';
  if (days < 60) return `Last verified ${Math.floor(days / 7)} weeks ago`;
  return 'Last verified over 2 months ago';
}

// ---------------------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------------------

const CTA_LABEL: Record<CtaKind, string> = {
  watch_now: 'Watch now',
  view_options: 'View options',
  tune_in: 'Tune in',
  set_reminder: 'Set reminder',
  rent: 'Rent',
  buy: 'Buy',
  check_availability: 'Check availability',
  notify_me: 'Notify me',
};

/**
 * Turns evidenced options into exactly what the card should render.
 *
 * The call-to-action is derived from the VERIFIED STATE and nothing else. A
 * high personal score can never produce "Watch now" — that is the whole defect
 * being fixed. When we do not know where something is available, the action is
 * an honest invitation to go and find out.
 */
export function resolveWatchPresentation(input: WatchPresentationInput): WatchPresentation {
  const now = input.now ?? new Date();
  const historical = input.originalNetwork ? `Originally aired on ${input.originalNetwork}` : null;

  const usable = usableOptions(input.options);
  const live = usable.filter((o): o is LiveOption => o.kind === 'live')
    .map((o) => ({ o, status: airingStatus(o, now) }))
    .filter((x) => x.status !== 'ended');
  const streaming = usable.filter((o): o is StreamingOption => o.kind === 'streaming')
    .sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state]);

  if (live.length === 0 && streaming.length === 0) {
    const unknown = !input.checked;
    return {
      status: unknown ? 'unknown' : 'none',
      lines: [],
      cta: unknown
        ? { kind: 'check_availability', label: CTA_LABEL.check_availability, href: null }
        : { kind: 'notify_me', label: CTA_LABEL.notify_me, href: null },
      note: unknown
        ? 'We haven’t confirmed where this is currently available.'
        : 'We checked and found no current way to watch this.',
      historical,
      ariaLabel: unknown
        ? 'Where to watch: not confirmed'
        : 'Where to watch: none found',
    };
  }

  const lines: WatchLine[] = [];
  const liveNow = live.filter((x) => x.status === 'live_now');
  const upcoming = live.filter((x) => x.status === 'upcoming')
    .sort((a, b) => Date.parse(a.o.startsAtIso) - Date.parse(b.o.startsAtIso));

  for (const { o, status } of [...liveNow, ...upcoming]) {
    lines.push({
      kind: 'live',
      text: o.network,
      detail: [stationLine(o), status === 'live_now' ? 'Live now' : airingWhen(o, now)]
        .filter(Boolean)
        .join(' · '),
      verified: null,
      href: null,
      liveNow: status === 'live_now',
    });
  }

  for (const o of streaming) {
    lines.push({
      kind: 'streaming',
      text: streamingText(o),
      detail: null,
      verified: verifiedLabel(o.lastVerifiedAt, now),
      href: o.watchLink,
    });
  }

  return {
    status: 'available',
    lines,
    cta: chooseCta(liveNow.length > 0, upcoming.length > 0, streaming),
    note: null,
    historical,
    ariaLabel: `Where to watch: ${lines.map((l) => [l.text, l.detail].filter(Boolean).join(', ')).join('; ')}`,
  };
}

function chooseCta(
  hasLiveNow: boolean,
  hasUpcoming: boolean,
  streaming: StreamingOption[],
): WatchPresentation['cta'] {
  // Something on air right now outranks everything else on the card.
  if (hasLiveNow) return { kind: 'tune_in', label: CTA_LABEL.tune_in, href: null };

  const linked = streaming.filter((o) => o.watchLink);
  const watchable = streaming.filter((o) => !TRANSACTIONAL.has(o.state) && o.state !== 'coming_soon');

  // More than one real way to watch: let the user choose rather than picking
  // for them and hiding the cheaper option.
  if (streaming.length > 1) return { kind: 'view_options', label: CTA_LABEL.view_options, href: null };

  if (watchable.length === 1 && linked.length === 1) {
    return { kind: 'watch_now', label: CTA_LABEL.watch_now, href: linked[0]!.watchLink };
  }
  if (watchable.length === 1) return { kind: 'view_options', label: CTA_LABEL.view_options, href: null };

  const only = streaming[0];
  if (only && TRANSACTIONAL.has(only.state)) {
    const kind: CtaKind = only.state === 'rent' ? 'rent' : 'buy';
    return { kind, label: CTA_LABEL[kind], href: only.watchLink };
  }

  // Nothing streamable right now, but a verified airing is coming.
  if (hasUpcoming) return { kind: 'set_reminder', label: CTA_LABEL.set_reminder, href: null };

  // coming_soon only — there is nothing to open yet.
  return { kind: 'notify_me', label: CTA_LABEL.notify_me, href: null };
}

// ---------------------------------------------------------------------------
// Adapters — the ONLY sanctioned way raw data becomes options
// ---------------------------------------------------------------------------

import { stateFromLegacyType } from '@/lib/availability/states';

/** The legacy per-title cache shape (`src/lib/watchmode/cardAvailability.ts`). */
export interface LegacyCardAvailability {
  status: 'unconfirmed' | 'none' | 'available';
  sources: { name: string; type: 'subscription' | 'rent' | 'buy' | 'free'; deeplink: string | null }[];
  checkedAt: string | null;
}

/**
 * Bridges the cached Watchmode rows into options.
 *
 * `stateFromLegacyType` maps `subscription` to BASE-tier inclusion only —
 * never premium, add-on or Prime. That is the conservative reading and it is
 * the right one: the legacy row records that a subscription covers it, not
 * WHICH subscription tier, and inventing the tier is how a card starts telling
 * someone a title is on their plan when it needs an upgrade.
 *
 * `checked` comes from `status !== 'unconfirmed'`, preserving the distinction
 * between "never looked" and "looked, found nothing" that the whole honest
 * unknown state depends on.
 */
export function optionsFromCardAvailability(a: LegacyCardAvailability): {
  options: WatchOption[];
  checked: boolean;
} {
  return {
    checked: a.status !== 'unconfirmed',
    options: a.sources.map<StreamingOption>((s) => ({
      kind: 'streaming',
      service: s.name,
      state: stateFromLegacyType(s.type),
      addonName: null,
      // The legacy cache carries no price, so none is shown. An absent price
      // is displayed as an absent price, never as a free or included title.
      price: null,
      watchLink: s.deeplink,
      lastVerifiedAt: a.checkedAt,
    })),
  };
}

/**
 * Builds a live option from a schedule airing.
 *
 * `network` here is the channel CARRYING THIS AIRING, taken from the schedule
 * feed — it is not, and must never be substituted with, the show's original
 * network from title metadata. The two look identical for a first-run episode
 * and are completely different for a rerun, which is exactly the confusion
 * this whole module exists to prevent.
 *
 * `endsAtIso` is derived from the runtime when the feed gives one. Without a
 * runtime the resolver falls back to treating the slot as an hour rather than
 * declaring the airing over, so something still on air is never hidden.
 */
export function liveOptionFromAiring(a: {
  network: string;
  airstamp: string;
  runtime?: number | null;
  station?: string | null;
  channelNumber?: string | null;
}): LiveOption {
  const start = Date.parse(a.airstamp);
  return {
    kind: 'live',
    network: a.network,
    station: a.station ?? null,
    channelNumber: a.channelNumber ?? null,
    startsAtIso: a.airstamp,
    endsAtIso:
      a.runtime && Number.isFinite(start) ? new Date(start + a.runtime * 60_000).toISOString() : null,
  };
}
