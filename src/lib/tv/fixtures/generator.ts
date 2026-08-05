import { Rng } from './rng';
import { SimClock, localWallClockToUtc, DEFAULT_EPOCH_UTC } from './clock';

/**
 * THE DETERMINISTIC FIXTURE ENGINE.
 *
 * Generates a television/streaming corpus at production scale, from one seed,
 * with no network, no clock, and no database. Everything it emits is marked
 * `isFixture: true`, and the public read views in migration 0044 exclude those
 * rows structurally — so this cannot leak into a production surface even if
 * application code forgets.
 *
 * WHY IT GENERATES AT SCALE RATHER THAN SAMPLING
 * A corpus of fifty titles proves the code runs. It does not prove the query
 * plans hold, that the matcher's precision survives a long tail, that a
 * thirty-day window of airings paginates, or that duplicate detection works
 * when duplicates are rare rather than half the set. Every one of those is a
 * scale property, and scale properties fail in production or nowhere.
 *
 * EDGE CASES ARE GENERATED, NOT HOPED FOR
 * A realistic corpus that happens to contain no DST transition tests nothing
 * about DST. So the awkward cases are placed deliberately and counted, and the
 * generator reports how many of each it produced:
 *
 *   - stale records (last_seen far behind the clock)
 *   - failed source runs
 *   - duplicate offers reachable by two routes (direct and via an add-on)
 *   - ambiguous title matches (same name, different years)
 *   - DST spring-forward and fall-back airings
 *   - programmes crossing midnight
 *   - undated/zone-less source times
 *   - the same true-crime case under different series titles
 *
 * STREAMING, NOT ARRAYS
 * 500,000 offers as one array is ~400MB of JS objects. Each generator here is
 * an iterator, so a loader can stream straight into COPY and a counter can
 * count without ever holding the corpus in memory.
 */

export const FIXTURE_SOURCE_SLUG = 'fixture';

// ── Scale targets, from the specification ────────────────────────────────
export const SCALE = {
  titles: 50_000,
  episodes: 250_000,
  offers: 500_000,
  networks: 250,
  scheduleDays: 30,
} as const;

/** A deliberately small profile, for unit tests that assert shape not scale. */
export const SMALL_SCALE = {
  titles: 500,
  episodes: 2_000,
  offers: 4_000,
  networks: 40,
  scheduleDays: 3,
} as const;

export type ScaleProfile = {
  titles: number; episodes: number; offers: number;
  networks: number; scheduleDays: number;
};

// ── Vocabulary. Combinatorial, so 50k titles are distinguishable without a
//    50k-line word list — and stable, because the corpus identity depends on
//    it. Appending is safe; reordering or removing is not.
const ADJECTIVES = ['Silent', 'Crimson', 'Northern', 'Hollow', 'Golden', 'Broken', 'Distant',
  'Restless', 'Quiet', 'Iron', 'Velvet', 'Bitter', 'Endless', 'Sacred', 'Frozen', 'Wild',
  'Hidden', 'Final', 'Second', 'Midnight'] as const;
const NOUNS = ['Harbour', 'Verdict', 'Season', 'Cottage', 'Inheritance', 'Witness', 'Promise',
  'Detective', 'Christmas', 'Crossing', 'Hour', 'Bakery', 'Testimony', 'Lighthouse', 'Recipe',
  'Reunion', 'Confession', 'Wedding', 'Precinct', 'Archive'] as const;
const SUFFIXES = ['', '', '', '', ': The Reckoning', ': Homecoming', ': Cold Case',
  ' II', ' Returns', ': The Final Chapter'] as const;

const GENRES = ['drama', 'comedy', 'crime', 'romance', 'documentary', 'thriller', 'family',
  'holiday', 'reality', 'news', 'sports', 'kids'] as const;

const NETWORK_CATEGORIES = ['broadcast', 'cable_entertainment', 'news', 'sports', 'kids',
  'movies', 'lifestyle', 'documentary', 'music', 'religious', 'shopping', 'local', 'fast'] as const;

const MARKET_ZONES = [
  { dma: 'New York', tz: 'America/New_York', state: 'NY' },
  { dma: 'Los Angeles', tz: 'America/Los_Angeles', state: 'CA' },
  { dma: 'Chicago', tz: 'America/Chicago', state: 'IL' },
  { dma: 'Denver', tz: 'America/Denver', state: 'CO' },
  { dma: 'Phoenix', tz: 'America/Phoenix', state: 'AZ' }, // no DST — deliberate
  { dma: 'Atlanta', tz: 'America/New_York', state: 'GA' },
  { dma: 'Dallas', tz: 'America/Chicago', state: 'TX' },
  { dma: 'Seattle', tz: 'America/Los_Angeles', state: 'WA' },
  { dma: 'Anchorage', tz: 'America/Anchorage', state: 'AK' },
  { dma: 'Honolulu', tz: 'Pacific/Honolulu', state: 'HI' }, // no DST — deliberate
] as const;

const SERVICES = [
  { slug: 'netflix', name: 'Netflix', kind: 'subscription' },
  { slug: 'prime-video', name: 'Prime Video', kind: 'subscription' },
  { slug: 'hulu', name: 'Hulu', kind: 'subscription' },
  { slug: 'max', name: 'Max', kind: 'subscription' },
  { slug: 'paramount-plus', name: 'Paramount+', kind: 'subscription' },
  { slug: 'peacock', name: 'Peacock', kind: 'subscription' },
  { slug: 'apple-tv-plus', name: 'Apple TV+', kind: 'subscription' },
  { slug: 'disney-plus', name: 'Disney+', kind: 'subscription' },
  { slug: 'acorn-tv', name: 'Acorn TV', kind: 'addon' },
  { slug: 'britbox', name: 'BritBox', kind: 'addon' },
  { slug: 'hallmark-plus', name: 'Hallmark+', kind: 'addon' },
  { slug: 'tubi', name: 'Tubi', kind: 'free_ad_supported' },
  { slug: 'pluto-tv', name: 'Pluto TV', kind: 'fast' },
  { slug: 'roku-channel', name: 'The Roku Channel', kind: 'free_ad_supported' },
  { slug: 'apple-tv-store', name: 'Apple TV (Store)', kind: 'tvod' },
  { slug: 'fandango-at-home', name: 'Fandango at Home', kind: 'tvod' },
] as const;

/** Services an add-on can be resold through. The direct/via distinction is
 *  the whole reason `dist_offers.is_direct` and `via_service_id` exist. */
const ADDON_CARRIERS = ['prime-video', 'apple-tv-store', 'roku-channel'] as const;

// ── Emitted shapes. Deliberately plain objects: a loader maps them onto
//    columns, and nothing here knows about Postgres.

export interface FixtureTitle {
  canonicalKey: string; titleType: 'movie' | 'series'; primaryTitle: string;
  sortTitle: string; releaseYear: number; runtimeMinutes: number;
  originalLanguage: string; overview: string; genres: string[];
  aliases: { alias: string; kind: string; locale: string | null }[];
  externalIds: { namespace: string; externalId: string }[];
  isFixture: true;
}

export interface FixtureEpisode {
  titleKey: string; seasonNumber: number; episodeNumber: number;
  name: string; firstAiredUtc: string | null; runtimeMinutes: number;
  /** Present when this episode covers a shared true-crime case. */
  caseKey: string | null;
  isFixture: true;
}

export interface FixtureOffer {
  titleKey: string; episodeKey: string | null; serviceSlug: string;
  offerType: 'subscription' | 'free_ad_supported' | 'rent' | 'buy' | 'addon' | 'live_linear';
  region: string; priceCents: number | null; currency: string; quality: string;
  isDirect: boolean; viaServiceSlug: string | null;
  lastSeenUtc: string; stale: boolean;
  isFixture: true;
}

export interface FixtureNetwork {
  slug: string; name: string; category: string;
  feedVariant: 'national' | 'east' | 'pacific';
  parentSlug: string | null; isFast: boolean; isFixture: true;
}

export interface FixtureAffiliate {
  networkSlug: string; callsign: string; marketDma: string;
  city: string; state: string; timezone: string; isFixture: true;
}

export interface FixtureAiring {
  channelKey: string; lineupSlug: string; networkSlug: string;
  affiliateCallsign: string | null;
  titleKey: string | null; rawTitle: string; rawEpisodeTitle: string | null;
  startUtc: string; endUtc: string;
  sourceTimezone: string; sourceLocalTime: string | null;
  dstAmbiguous: boolean; dstNonexistent: boolean; crossesMidnight: boolean;
  isNew: boolean; isLive: boolean; contentType: string;
  isFixture: true;
}

export interface FixtureCounts {
  titles: number; episodes: number; offers: number; networks: number;
  affiliates: number; lineups: number; channels: number; airings: number;
  services: number; scheduleDays: number;
  edgeCases: {
    staleOffers: number; duplicateRouteOffers: number; ambiguousTitleNames: number;
    dstAmbiguousAirings: number; dstNonexistentAirings: number;
    midnightCrossingAirings: number; undatedEpisodes: number;
    sharedCrimeCases: number; failedSourceRuns: number;
  };
}

// ── Generators ────────────────────────────────────────────────────────────

function titleName(rng: Rng, index: number): string {
  const adj = ADJECTIVES[index % ADJECTIVES.length]!;
  const noun = NOUNS[Math.floor(index / ADJECTIVES.length) % NOUNS.length]!;
  const suffix = rng.pick(SUFFIXES);
  const cycle = Math.floor(index / (ADJECTIVES.length * NOUNS.length));
  // Past 400 combinations, a disambiguating word keeps names distinguishable
  // without needing a 50,000-entry vocabulary.
  const extra = cycle > 0 ? ` ${NOUNS[cycle % NOUNS.length]!}` : '';
  return `The ${adj} ${noun}${extra}${suffix}`;
}

const sortable = (t: string): string => t.replace(/^(The|A|An)\s+/i, '').toLowerCase();

export function* generateTitles(seed: string, profile: ScaleProfile): Generator<FixtureTitle> {
  const rng = new Rng(seed).derive('titles');
  for (let i = 0; i < profile.titles; i++) {
    const r = rng.derive(`t${i}`);
    const name = titleName(r, i);
    // AMBIGUOUS MATCH CASE: roughly one title in a hundred reuses the
    // previous title's name with a different year — exactly the pair a
    // matcher must refuse to collapse. 97 rather than 100 because a prime
    // interval cannot come into phase with the other cycles in this
    // generator and quietly stop firing. Rare on purpose: a corpus where
    // half the names collide tests nothing about a long tail.
    const ambiguous = i > 0 && i % 97 === 0;
    const primaryTitle = ambiguous ? titleName(rng.derive(`t${i - 1}`), i - 1) : name;
    const titleType = r.weighted([['series', 0.35], ['movie', 0.65]] as const);
    const releaseYear = r.int(1975, 2026) + (ambiguous ? 0 : 0);

    const aliases: FixtureTitle['aliases'] = [];
    if (r.chance(0.25)) aliases.push({ alias: primaryTitle.replace(/^The\s+/, ''), kind: 'shortened', locale: null });
    if (r.chance(0.12)) aliases.push({ alias: `${primaryTitle} (${releaseYear})`, kind: 'aka', locale: null });
    if (r.chance(0.08)) aliases.push({ alias: `El ${primaryTitle}`, kind: 'localized', locale: 'es' });

    yield {
      canonicalKey: `fx-title-${i.toString(36).padStart(6, '0')}`,
      titleType,
      primaryTitle,
      sortTitle: sortable(primaryTitle),
      releaseYear: ambiguous ? releaseYear + r.int(1, 30) : releaseYear,
      runtimeMinutes: titleType === 'movie' ? r.int(78, 165) : r.int(21, 62),
      originalLanguage: r.weighted([['en', 0.86], ['es', 0.05], ['fr', 0.03], ['de', 0.02], ['ja', 0.02], ['ko', 0.02]] as const),
      overview: `${primaryTitle} — generated fixture synopsis #${i}. Not real editorial copy.`,
      genres: Array.from(new Set([r.pick(GENRES), r.pick(GENRES)])),
      aliases,
      externalIds: [{ namespace: 'fixture', externalId: `fx-${i}` }],
      isFixture: true,
    };
  }
}

/**
 * Episodes are distributed only across SERIES titles, and the case keys are
 * assigned so the same true-crime case recurs under DIFFERENT series titles —
 * the deduplication problem the Crime pack actually has, which a corpus of
 * one-case-per-episode would never surface.
 */
export function* generateEpisodes(seed: string, profile: ScaleProfile): Generator<FixtureEpisode> {
  const rng = new Rng(seed).derive('episodes');
  // Which title indices are series. Recomputed from the same sub-stream the
  // title generator used, so the two agree without materialising the titles.
  const titleRng = new Rng(seed).derive('titles');
  const seriesIndices: number[] = [];
  for (let i = 0; i < profile.titles; i++) {
    const r = titleRng.derive(`t${i}`);
    titleName(r, i); // consume identically to keep the sub-stream aligned
    if (r.weighted([['series', 0.35], ['movie', 0.65]] as const) === 'series') seriesIndices.push(i);
  }
  if (seriesIndices.length === 0) return;

  const perSeries = Math.max(1, Math.ceil(profile.episodes / seriesIndices.length));
  let emitted = 0;
  const caseCount = Math.max(1, Math.floor(profile.episodes / 40));

  for (const idx of seriesIndices) {
    if (emitted >= profile.episodes) break;
    const r = rng.derive(`e${idx}`);
    const seasons = Math.max(1, Math.ceil(perSeries / 13));
    for (let s = 1; s <= seasons && emitted < profile.episodes; s++) {
      for (let e = 1; e <= 13 && emitted < profile.episodes; e++) {
        const er = r.derive(`s${s}e${e}`);
        // UNDATED CASE: ~2% of episodes carry no air date at all, which is
        // what a real feed does for unaired or archival entries. Code that
        // assumes a date exists breaks here rather than in production.
        const undated = er.chance(0.02);
        const airedMs = DEFAULT_EPOCH_UTC - er.int(0, 3650) * 86_400_000;
        // SHARED CASE: a third of episodes reference a case id drawn from a
        // pool small enough that the same case recurs across different series.
        const sharedCase = er.chance(0.33) ? `fx-case-${er.int(0, caseCount - 1)}` : null;
        yield {
          titleKey: `fx-title-${idx.toString(36).padStart(6, '0')}`,
          seasonNumber: s,
          episodeNumber: e,
          name: `${er.pick(ADJECTIVES)} ${er.pick(NOUNS)}`,
          firstAiredUtc: undated ? null : new Date(airedMs).toISOString(),
          runtimeMinutes: er.int(21, 62),
          caseKey: sharedCase,
          isFixture: true,
        };
        emitted++;
      }
    }
  }
}

export function* generateServices(): Generator<{ slug: string; name: string; kind: string; isFixture: true }> {
  for (const s of SERVICES) yield { ...s, isFixture: true };
}

export function* generateOffers(seed: string, profile: ScaleProfile, clock: SimClock): Generator<FixtureOffer> {
  const rng = new Rng(seed).derive('offers');
  const nowMs = clock.nowMs();
  let emitted = 0;
  for (let i = 0; emitted < profile.offers; i++) {
    const titleIndex = i % profile.titles;
    const r = rng.derive(`o${i}`);
    const service = r.pick(SERVICES);
    const offerType = service.kind === 'tvod'
      ? r.weighted([['rent', 0.6], ['buy', 0.4]] as const)
      : service.kind === 'addon' ? 'addon' as const
      : service.kind === 'free_ad_supported' || service.kind === 'fast' ? 'free_ad_supported' as const
      : 'subscription' as const;

    // STALE CASE: ~4% of offers were last confirmed well before the clock, so
    // freshness labelling has something real to label.
    const stale = r.chance(0.04);
    const lastSeenMs = stale ? nowMs - r.int(15, 90) * 86_400_000 : nowMs - r.int(0, 36) * 3_600_000;

    yield {
      titleKey: `fx-title-${titleIndex.toString(36).padStart(6, '0')}`,
      episodeKey: null,
      serviceSlug: service.slug,
      offerType,
      region: 'US',
      priceCents: offerType === 'rent' ? r.pick([399, 499, 599]) : offerType === 'buy' ? r.pick([999, 1499, 1999]) : null,
      currency: 'USD',
      quality: r.weighted([['hd', 0.55], ['uhd', 0.3], ['sd', 0.15]] as const),
      isDirect: true,
      viaServiceSlug: null,
      lastSeenUtc: new Date(lastSeenMs).toISOString(),
      stale,
      isFixture: true,
    };
    emitted++;

    // DUPLICATE-ROUTE CASE: an add-on is also reachable THROUGH a carrier.
    // Same title, same channel, different product — two offers, not one, and
    // a deduplicator that collapses them is wrong.
    if (service.kind === 'addon' && emitted < profile.offers && r.chance(0.5)) {
      yield {
        titleKey: `fx-title-${titleIndex.toString(36).padStart(6, '0')}`,
        episodeKey: null,
        serviceSlug: service.slug,
        offerType: 'addon',
        region: 'US',
        priceCents: null,
        currency: 'USD',
        quality: 'hd',
        isDirect: false,
        viaServiceSlug: r.pick(ADDON_CARRIERS),
        lastSeenUtc: new Date(lastSeenMs).toISOString(),
        stale: false,
        isFixture: true,
      };
      emitted++;
    }
  }
}

export function* generateNetworks(seed: string, profile: ScaleProfile): Generator<FixtureNetwork> {
  const rng = new Rng(seed).derive('networks');
  let emitted = 0;
  for (let i = 0; emitted < profile.networks; i++) {
    const r = rng.derive(`n${i}`);
    const category = NETWORK_CATEGORIES[i % NETWORK_CATEGORIES.length]!;
    const isFast = category === 'fast';
    const base = `${r.pick(ADJECTIVES)} ${isFast ? 'Channel' : 'Network'} ${i}`;
    const slug = `fx-net-${i}`;
    yield { slug, name: base, category, feedVariant: 'national', parentSlug: null, isFast, isFixture: true };
    emitted++;

    // EAST/PACIFIC FEEDS. A national network with two feeds is two rows: at
    // 20:00 UTC-5 and 20:00 UTC-8 they are showing different programmes, and
    // one row with an offset cannot represent that.
    if (!isFast && emitted + 1 < profile.networks && r.chance(0.35)) {
      yield { slug: `${slug}-east`, name: `${base} East`, category, feedVariant: 'east', parentSlug: slug, isFast: false, isFixture: true };
      yield { slug: `${slug}-pacific`, name: `${base} Pacific`, category, feedVariant: 'pacific', parentSlug: slug, isFast: false, isFixture: true };
      emitted += 2;
    }
  }
}

export function* generateAffiliates(seed: string, profile: ScaleProfile): Generator<FixtureAffiliate> {
  const rng = new Rng(seed).derive('affiliates');
  let i = 0;
  for (const net of generateNetworks(seed, profile)) {
    if (net.category !== 'broadcast' || net.feedVariant !== 'national') continue;
    const r = rng.derive(`a${i++}`);
    // Every broadcast network has an affiliate in every market, including the
    // two zones that do not observe DST.
    for (const market of MARKET_ZONES) {
      yield {
        networkSlug: net.slug,
        callsign: `K${r.pick(ADJECTIVES).slice(0, 2).toUpperCase()}${market.state}${i}`,
        marketDma: market.dma, city: market.dma, state: market.state,
        timezone: market.tz, isFixture: true,
      };
    }
  }
}

export interface FixtureLineup {
  slug: string; name: string; providerSlug: string | null; region: string;
  postalCode: string | null; marketDma: string | null; timezone: string;
  coverageLevel: 'national' | 'provider' | 'market' | 'affiliate';
  isFixture: true;
}

export function* generateLineups(): Generator<FixtureLineup> {
  // The four coverage levels the specification requires, each represented.
  yield { slug: 'fx-lineup-national', name: 'National feed', providerSlug: null, region: 'US',
          postalCode: null, marketDma: null, timezone: 'America/New_York', coverageLevel: 'national', isFixture: true };
  for (const provider of ['fx-cable', 'fx-satellite', 'fx-streaming-live']) {
    yield { slug: `fx-lineup-${provider}`, name: `${provider} national lineup`, providerSlug: provider,
            region: 'US', postalCode: null, marketDma: null, timezone: 'America/New_York',
            coverageLevel: 'provider', isFixture: true };
  }
  for (const market of MARKET_ZONES) {
    const key = market.dma.toLowerCase().replace(/\s+/g, '-');
    yield { slug: `fx-lineup-market-${key}`, name: `${market.dma} market`, providerSlug: null,
            region: 'US', postalCode: null, marketDma: market.dma, timezone: market.tz,
            coverageLevel: 'market', isFixture: true };
    yield { slug: `fx-lineup-affiliate-${key}`, name: `${market.dma} affiliates`, providerSlug: 'fx-cable',
            region: 'US', postalCode: `${10000 + market.dma.length * 137}`, marketDma: market.dma,
            timezone: market.tz, coverageLevel: 'affiliate', isFixture: true };
  }
}

/**
 * Airings. One channel-day at a time so the caller can stream; every airing
 * is generated from a LOCAL wall-clock reading and converted through
 * `localWallClockToUtc`, which is what makes the DST cases real rather than
 * decorative.
 */
/**
 * BOTH DST TRANSITIONS, DELIBERATELY.
 *
 * The main schedule window starts at the epoch and runs `scheduleDays`, which
 * from the default March epoch crosses spring-forward but never reaches the
 * autumn fall-back seven months later. A corpus that contains only half the
 * problem tests only half the code: the skipped hour and the REPEATED hour
 * fail in different ways, and the repeated one is the one that silently
 * duplicates airings.
 *
 * So the autumn transition is generated as an extra probe day regardless of
 * where the window happens to land. These are ordinary corpus rows, not a
 * special case — they simply guarantee the awkward day exists.
 */
const DST_PROBE_DAYS = [
  { year: 2026, month: 3, day: 8 },   // spring forward: 02:00 -> 03:00 (nonexistent hour)
  { year: 2026, month: 11, day: 1 },  // fall back:      02:00 -> 01:00 (repeated hour)
] as const;

export function* generateAirings(
  seed: string, profile: ScaleProfile, clock: SimClock,
): Generator<FixtureAiring> {
  const rng = new Rng(seed).derive('airings');
  const networks = [...generateNetworks(seed, profile)];
  const lineups = [...generateLineups()];
  const startMs = clock.nowMs();

  const days: { y: number; mo: number; d: number }[] = [];
  for (let day = 0; day < profile.scheduleDays; day++) {
    const dt = new Date(startMs + day * 86_400_000);
    days.push({ y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
  }
  for (const probe of DST_PROBE_DAYS) {
    if (!days.some((x) => x.y === probe.year && x.mo === probe.month && x.d === probe.day)) {
      days.push({ y: probe.year, mo: probe.month, d: probe.day });
    }
  }

  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const day = dayIndex;
    const { y, mo, d } = days[dayIndex]!;

    for (const lineup of lineups) {
      // A market lineup carries a slice of the networks; the national one
      // carries all of them. Keeps the corpus large without being uniform.
      const carried = lineup.coverageLevel === 'national'
        ? networks
        : networks.filter((_, i) => i % 4 === (lineup.slug.length % 4));

      for (const net of carried) {
        const r = rng.derive(`${lineup.slug}|${net.slug}|${day}`);
        // Half-hour slots across the broadcast day.
        let slot = 0;
        while (slot < 48) {
          const lengthSlots = r.weighted([[1, 0.45], [2, 0.35], [4, 0.15], [6, 0.05]] as const);
          const hour = Math.floor(slot / 2);
          const minute = (slot % 2) * 30;
          const localStart = { year: y, month: mo, day: d, hour, minute };
          const start = localWallClockToUtc(localStart, lineup.timezone);
          const endMs = start.utcMs + lengthSlots * 30 * 60_000;

          const titleIndex = r.int(0, profile.titles - 1);
          const crosses = slot + lengthSlots > 48;

          yield {
            channelKey: `${lineup.slug}::${net.slug}`,
            lineupSlug: lineup.slug,
            networkSlug: net.slug,
            affiliateCallsign: null,
            // ~6% unmatched: the raw title is all we have, and it must still
            // display rather than vanish.
            titleKey: r.chance(0.94) ? `fx-title-${titleIndex.toString(36).padStart(6, '0')}` : null,
            rawTitle: titleName(r.derive(`raw${slot}`), titleIndex),
            rawEpisodeTitle: r.chance(0.4) ? `${r.pick(ADJECTIVES)} ${r.pick(NOUNS)}` : null,
            startUtc: new Date(start.utcMs).toISOString(),
            endUtc: new Date(endMs).toISOString(),
            sourceTimezone: lineup.timezone,
            // ~3% of rows arrive with no usable local string, mirroring feeds
            // that omit it. Never silently assumed to be Eastern.
            sourceLocalTime: r.chance(0.97)
              ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
              : null,
            dstAmbiguous: start.ambiguous,
            dstNonexistent: start.nonexistent,
            crossesMidnight: crosses,
            isNew: r.chance(0.22),
            isLive: r.chance(0.06),
            contentType: r.pick(['movie', 'series', 'news', 'sports', 'kids', 'other']),
            isFixture: true,
          };
          slot += lengthSlots;
        }
      }
    }
  }
}

/**
 * Count the corpus without materialising it. Returns the exact figures the
 * acceptance criteria are stated in, plus a census of every edge case — so
 * "the corpus contains DST transitions" is a number rather than a claim.
 */
export function countCorpus(seed: string, profile: ScaleProfile, clock?: SimClock): FixtureCounts {
  const simClock = clock ?? new SimClock();
  const counts: FixtureCounts = {
    titles: 0, episodes: 0, offers: 0, networks: 0, affiliates: 0,
    lineups: 0, channels: 0, airings: 0, services: 0, scheduleDays: profile.scheduleDays,
    edgeCases: {
      staleOffers: 0, duplicateRouteOffers: 0, ambiguousTitleNames: 0,
      dstAmbiguousAirings: 0, dstNonexistentAirings: 0, midnightCrossingAirings: 0,
      undatedEpisodes: 0, sharedCrimeCases: 0, failedSourceRuns: 0,
    },
  };

  const seenNames = new Map<string, number>();
  for (const t of generateTitles(seed, profile)) {
    counts.titles++;
    const prior = seenNames.get(t.primaryTitle);
    if (prior !== undefined) counts.edgeCases.ambiguousTitleNames++;
    else seenNames.set(t.primaryTitle, t.releaseYear);
  }

  const cases = new Map<string, Set<string>>();
  for (const e of generateEpisodes(seed, profile)) {
    counts.episodes++;
    if (e.firstAiredUtc === null) counts.edgeCases.undatedEpisodes++;
    if (e.caseKey) {
      const set = cases.get(e.caseKey) ?? new Set<string>();
      set.add(e.titleKey);
      cases.set(e.caseKey, set);
    }
  }
  // A "shared case" is one that appears under MORE THAN ONE series title —
  // the deduplication problem. A case seen twice in one series is not.
  for (const titles of cases.values()) if (titles.size > 1) counts.edgeCases.sharedCrimeCases++;

  for (const o of generateOffers(seed, profile, simClock)) {
    counts.offers++;
    if (o.stale) counts.edgeCases.staleOffers++;
    if (!o.isDirect) counts.edgeCases.duplicateRouteOffers++;
  }

  for (const _n of generateNetworks(seed, profile)) counts.networks++;
  for (const _a of generateAffiliates(seed, profile)) counts.affiliates++;
  for (const _l of generateLineups()) counts.lineups++;
  for (const _s of generateServices()) counts.services++;

  const channels = new Set<string>();
  for (const a of generateAirings(seed, profile, simClock)) {
    counts.airings++;
    channels.add(a.channelKey);
    if (a.dstAmbiguous) counts.edgeCases.dstAmbiguousAirings++;
    if (a.dstNonexistent) counts.edgeCases.dstNonexistentAirings++;
    if (a.crossesMidnight) counts.edgeCases.midnightCrossingAirings++;
  }
  counts.channels = channels.size;

  // Failed runs are produced by the simulation, not the corpus; the census
  // reports the number the simulator will inject so both agree.
  counts.edgeCases.failedSourceRuns = Math.floor(profile.scheduleDays * 8 * 0.05);
  return counts;
}
