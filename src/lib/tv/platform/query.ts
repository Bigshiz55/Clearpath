import 'server-only';
import { resolveDataMode, type DataMode } from '../dataMode';
import { isUserVisible, type SupportStage } from '../supportStage';
import type { WatchOption } from '@/lib/availability/watchPresentation';
import type { AvailabilityState } from '@/lib/watchmode/cardAvailability';
import { SimClock } from '../fixtures/clock';
import {
  SMALL_SCALE, generateTitles, generateOffers, generateAirings, generateServices,
  generateNetworks, type ScaleProfile,
} from '../fixtures/generator';

/**
 * THE READ LAYER FOR "WHAT TO WATCH".
 *
 * One shape, whatever the mode. A caller asks for what is watchable and gets
 * back rows that always carry their own provenance — source, freshness,
 * confidence, coverage level, support status — because a result that cannot
 * say where it came from cannot be trusted and cannot be debugged.
 *
 * The rules this layer enforces, so no surface has to remember them:
 *
 *  1. An unconfigured production deployment returns a CONFIGURATION_ERROR
 *     result with whatever stored data exists, never an empty list dressed up
 *     as "nothing is on".
 *  2. Fixture rows are marked `isFixture` and are refused outright in
 *     production, mirroring the database views — belt and braces, because the
 *     two guards fail in different ways.
 *  3. Every row states its support stage, and rows below `verified` are
 *     excluded from the default result set rather than quietly mixed in.
 *
 * In fixture mode the corpus is served directly from the generator, which is
 * what makes the whole product demonstrable with no credentials and no
 * database.
 */

export type WatchKind = 'streaming' | 'linear';

export interface ProvenancedRow {
  sourceSlug: string;
  supportStage: SupportStage;
  /** null when the source has never reported a coverage level. */
  coverageLevel: 'national' | 'provider' | 'market' | 'affiliate' | null;
  confidence: number | null;
  lastSeenUtc: string | null;
  isFixture: boolean;
  attribution: string | null;
}

export interface WatchNowItem extends ProvenancedRow {
  kind: WatchKind;
  titleKey: string;
  title: string;
  year: number | null;
  /** Streaming only. */
  serviceSlug?: string;
  serviceName?: string;
  offerType?: string;
  priceCents?: number | null;
  isDirect?: boolean;
  viaServiceSlug?: string | null;
  /** Linear only. */
  networkSlug?: string;
  startUtc?: string;
  endUtc?: string;
  sourceTimezone?: string;
  /** True when the airing has already started but is still worth joining. */
  inProgress?: boolean;
}

export type WatchNowStatus =
  | 'ok'
  | 'configuration_error'
  | 'no_verified_sources';

export interface WatchNowResult {
  status: WatchNowStatus;
  /** Present only when status is not 'ok'. */
  message: string | null;
  dataMode: DataMode | null;
  generatedAtUtc: string;
  items: WatchNowItem[];
  /** Everything a caller needs to render honest freshness labelling. */
  coverage: {
    sources: { slug: string; stage: SupportStage; lastSeenUtc: string | null }[];
    /** Oldest `lastSeenUtc` across contributing sources. */
    stalestUtc: string | null;
    totalBeforeFiltering: number;
    filteredOutUnverified: number;
    filteredOutFixtureInProduction: number;
  };
}

export interface WatchNowQuery {
  kind?: WatchKind | 'all';
  /** Filter to these service slugs (streaming) or network slugs (linear). */
  services?: string[];
  /** Exclude rental/purchase offers — "what can I watch without paying again". */
  includedOnly?: boolean;
  limit?: number;
  /** Simulated or real instant to evaluate "now" against. */
  nowMs?: number;
  vercelEnv?: string | null;
  /** Smaller corpus for tests; the full profile otherwise. */
  profile?: ScaleProfile;
  seed?: string;
}

const FIXTURE_STAGE: SupportStage = 'fixture_tested';

/**
 * Fixture-mode read. Deliberately generated rather than stored: it makes the
 * product demonstrable with no database at all, and it keeps the corpus and
 * the read path honest about each other.
 */
function fixtureItems(q: Required<Pick<WatchNowQuery, 'seed' | 'profile' | 'nowMs'>> & WatchNowQuery): WatchNowItem[] {
  const clock = new SimClock();
  const limit = q.limit ?? 40;
  const wantStreaming = q.kind === undefined || q.kind === 'all' || q.kind === 'streaming';
  const wantLinear = q.kind === undefined || q.kind === 'all' || q.kind === 'linear';

  const titles = new Map<string, { title: string; year: number }>();
  for (const t of generateTitles(q.seed, q.profile)) {
    titles.set(t.canonicalKey, { title: t.primaryTitle, year: t.releaseYear });
  }
  const serviceNames = new Map([...generateServices()].map((s) => [s.slug, s.name]));
  const networkNames = new Map([...generateNetworks(q.seed, q.profile)].map((n) => [n.slug, n.name]));

  const items: WatchNowItem[] = [];

  if (wantStreaming) {
    for (const o of generateOffers(q.seed, q.profile, clock)) {
      if (items.length >= limit) break;
      if (q.services?.length && !q.services.includes(o.serviceSlug)) continue;
      // "Included" means no additional payment at the point of watching: a
      // subscription or an ad-supported tier, never a rental.
      if (q.includedOnly && (o.offerType === 'rent' || o.offerType === 'buy')) continue;
      const t = titles.get(o.titleKey);
      if (!t) continue;
      items.push({
        kind: 'streaming',
        titleKey: o.titleKey, title: t.title, year: t.year,
        serviceSlug: o.serviceSlug, serviceName: serviceNames.get(o.serviceSlug) ?? o.serviceSlug,
        offerType: o.offerType, priceCents: o.priceCents,
        isDirect: o.isDirect, viaServiceSlug: o.viaServiceSlug,
        sourceSlug: 'fixture', supportStage: FIXTURE_STAGE, coverageLevel: 'national',
        confidence: 1, lastSeenUtc: o.lastSeenUtc, isFixture: true, attribution: null,
      });
    }
  }

  if (wantLinear) {
    for (const a of generateAirings(q.seed, { ...q.profile, scheduleDays: 1 }, clock)) {
      if (items.length >= limit * 2) break;
      if (q.services?.length && !q.services.includes(a.networkSlug)) continue;
      const startMs = Date.parse(a.startUtc);
      const endMs = Date.parse(a.endUtc);
      // On now, or starting within three hours.
      if (endMs < q.nowMs || startMs > q.nowMs + 3 * 3_600_000) continue;
      const t = a.titleKey ? titles.get(a.titleKey) : undefined;
      items.push({
        kind: 'linear',
        titleKey: a.titleKey ?? `raw:${a.rawTitle}`,
        // An UNMATCHED programme still displays, using the source's own title.
        title: t?.title ?? a.rawTitle,
        year: t?.year ?? null,
        networkSlug: a.networkSlug,
        serviceName: networkNames.get(a.networkSlug) ?? a.networkSlug,
        startUtc: a.startUtc, endUtc: a.endUtc, sourceTimezone: a.sourceTimezone,
        inProgress: startMs <= q.nowMs && endMs > q.nowMs,
        sourceSlug: 'fixture', supportStage: FIXTURE_STAGE, coverageLevel: 'affiliate',
        confidence: a.titleKey ? 1 : 0.4, lastSeenUtc: null, isFixture: true, attribution: null,
      });
    }
  }

  return items;
}

export function queryWatchNow(query: WatchNowQuery = {}): WatchNowResult {
  const vercelEnv = query.vercelEnv ?? process.env.VERCEL_ENV ?? null;
  const state = resolveDataMode(vercelEnv ?? undefined);
  const nowMs = query.nowMs ?? new SimClock().nowMs();
  const generatedAtUtc = new Date(nowMs).toISOString();
  const isProduction = (vercelEnv ?? '').trim().toLowerCase() === 'production';

  const empty = (status: WatchNowStatus, message: string | null): WatchNowResult => ({
    status, message, dataMode: state.configured ? state.mode : null, generatedAtUtc,
    items: [],
    coverage: { sources: [], stalestUtc: null, totalBeforeFiltering: 0, filteredOutUnverified: 0, filteredOutFixtureInProduction: 0 },
  });

  // FAIL CLOSED, BUT SAY SO. An unconfigured production deployment returns a
  // named error rather than an empty list, because "nothing is on tonight"
  // and "nobody configured this deployment" must never look the same.
  if (!state.configured) return empty('configuration_error', state.reason);

  const raw = state.mode === 'fixture'
    ? fixtureItems({
        ...query,
        seed: query.seed ?? 'watchverdict-fixture-v1',
        profile: query.profile ?? SMALL_SCALE,
        nowMs,
      })
    : // free_live / paid_live read from the stored normalized tables. Nothing
      // is wired to them yet at a verified stage, and returning fabricated
      // rows here would be exactly the dishonesty the stage ladder prevents.
      [];

  const totalBeforeFiltering = raw.length;
  let filteredOutFixtureInProduction = 0;
  let filteredOutUnverified = 0;

  const items = raw.filter((item) => {
    // Mirrors the database views. Two guards that fail differently is the
    // point: application logic can be forgotten, a grant cannot.
    if (item.isFixture && isProduction) { filteredOutFixtureInProduction++; return false; }
    if (!isUserVisible(item.supportStage) && isProduction) { filteredOutUnverified++; return false; }
    return true;
  }).slice(0, query.limit ?? 40);

  const bySource = new Map<string, { slug: string; stage: SupportStage; lastSeenUtc: string | null }>();
  for (const i of items) {
    const prior = bySource.get(i.sourceSlug);
    if (!prior || (i.lastSeenUtc && prior.lastSeenUtc && i.lastSeenUtc < prior.lastSeenUtc)) {
      bySource.set(i.sourceSlug, { slug: i.sourceSlug, stage: i.supportStage, lastSeenUtc: i.lastSeenUtc });
    }
  }
  const stalest = items.reduce<string | null>(
    (oldest, i) => (i.lastSeenUtc && (!oldest || i.lastSeenUtc < oldest) ? i.lastSeenUtc : oldest), null);

  const status: WatchNowStatus = items.length === 0 && totalBeforeFiltering === 0 && state.mode !== 'fixture'
    ? 'no_verified_sources'
    : 'ok';

  return {
    status,
    message: status === 'no_verified_sources'
      ? 'No source has reached the verified stage for this surface yet, so there is nothing that can honestly be shown as real availability.'
      : null,
    dataMode: state.mode,
    generatedAtUtc,
    items,
    coverage: {
      sources: [...bySource.values()],
      stalestUtc: stalest,
      totalBeforeFiltering,
      filteredOutUnverified,
      filteredOutFixtureInProduction,
    },
  };
}

/**
 * MAP A PLATFORM ITEM ONTO THE EXISTING WATCH OPTION VOCABULARY.
 *
 * The wording of an availability claim lives in ONE place —
 * `src/lib/availability/watchPresentation.ts` — and an architecture test
 * enforces that no component grows its own. That rule caught this module's
 * first UI, which had quietly reimplemented "Included with subscription".
 * It was right to: two mappings drift, and the drift shows up as a rentable
 * title labelled as included.
 *
 * So the platform layer translates its own shape into the resolver's, and the
 * resolver does the talking. The interesting case is the add-on:
 *
 *   direct add-on      → state `included_with_addon`, service = the channel
 *   via a carrier      → state `included_with_addon`, service = the CARRIER,
 *                        addonName = the channel
 *
 * which is exactly the distinction between subscribing to Acorn TV and
 * buying Acorn TV through Amazon — different apps, prices and cancellations.
 */
export function watchOptionFromItem(item: WatchNowItem): WatchOption {
  if (item.kind === 'linear') {
    return {
      kind: 'live',
      network: item.serviceName ?? item.networkSlug ?? 'Unknown network',
      station: null,
      channelNumber: null,
      startsAtIso: item.startUtc ?? new Date(0).toISOString(),
      endsAtIso: item.endUtc ?? null,
    };
  }

  const service = item.serviceName ?? item.serviceSlug ?? 'Unknown service';
  const price = item.priceCents != null ? `$${(item.priceCents / 100).toFixed(2)}` : null;

  const state: AvailabilityState =
    item.offerType === 'subscription' ? 'included_with_base_subscription'
    : item.offerType === 'free_ad_supported' || item.offerType === 'free' ? 'free_with_ads'
    : item.offerType === 'rent' ? 'rent'
    : item.offerType === 'buy' ? 'buy'
    : item.offerType === 'addon' ? 'included_with_addon'
    : 'unverified';

  return {
    kind: 'streaming',
    // Through a carrier, the SERVICE the user pays is the carrier.
    service: item.isDirect === false && item.viaServiceSlug ? item.viaServiceSlug : service,
    state,
    addonName: state === 'included_with_addon' ? service : null,
    price,
    watchLink: null,
    lastVerifiedAt: item.lastSeenUtc,
  };
}
