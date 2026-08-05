import type { SupportStage } from '../supportStage';

/**
 * THE SOURCE FEASIBILITY MATRIX.
 *
 * One row per candidate source, each with a go / conditional / no-go verdict
 * and the reason for it. Data rather than a document, because a document
 * drifts from the code and this is read by the admin dashboard, the source
 * registry seed, and the tests that stop a source being claimed as supported
 * before it has earned it.
 *
 * WHAT THE VERDICTS MEAN
 *   go           lawful, accessible, and worth building against now
 *   conditional  buildable, but gated on something outside the codebase —
 *                an account, a contract, a credential, a licence decision
 *   no_go        will not be used, with the reason stated plainly
 *
 * THE RANKING IS LAWFULNESS FIRST, NOT CONVENIENCE FIRST. Official and
 * licensed APIs outrank everything. Nothing here bypasses authentication,
 * paywalls, CAPTCHAs, geo-restrictions, rate limits or robots directives, and
 * search-result pages are explicitly not a production data source — they are
 * listed as `no_go` so the decision is recorded rather than rediscovered.
 *
 * Where a source is not usable, the gap is stated. It is never filled with
 * invented data.
 */

export type FeasibilityVerdict = 'go' | 'conditional' | 'no_go';

export type SourceCapability =
  | 'linear_schedule' | 'fast_channels' | 'local_lineups'
  | 'streaming_offers' | 'catalog_metadata' | 'episode_metadata' | 'rental_purchase';

export type CoverageLevel = 'national' | 'provider' | 'market' | 'affiliate';

export interface FeasibilityRow {
  slug: string;
  name: string;
  /** How the data is obtained. */
  sourceType: 'official_api' | 'licensed_api' | 'open_data' | 'partner_feed' | 'affiliate_feed' | 'public_schedule_page' | 'fixture';
  capabilities: SourceCapability[];
  accessibility: 'open' | 'free_account' | 'paid_account' | 'contract_required' | 'not_available';
  authType: 'none' | 'api_key' | 'oauth' | 'account';
  geography: string;
  coverageLevel: CoverageLevel;
  completeness: string;
  rateLimits: string;
  termsSummary: string;
  attributionRequired: boolean;
  /** 1 (trivial) to 5 (a project in itself). */
  parserComplexity: 1 | 2 | 3 | 4 | 5;
  /** What we fall back to when this source is unavailable. */
  fallback: string;
  stage: SupportStage;
  verdict: FeasibilityVerdict;
  reason: string;
  costClass: 'free' | 'metered';
}

export const FEASIBILITY_MATRIX: readonly FeasibilityRow[] = [
  {
    slug: 'fixture',
    name: 'Deterministic fixture engine',
    sourceType: 'fixture',
    capabilities: ['linear_schedule', 'fast_channels', 'local_lineups', 'streaming_offers', 'catalog_metadata', 'episode_metadata'],
    accessibility: 'open', authType: 'none', geography: 'US', coverageLevel: 'affiliate',
    completeness: 'Complete by construction: 50k titles, 250k episodes, 500k offers, 250 networks, 30 days.',
    rateLimits: 'None — nothing leaves the process.',
    termsSummary: 'Ours. No third-party terms apply.',
    attributionRequired: false, parserComplexity: 1,
    fallback: 'n/a — it is the fallback for everything else in fixture mode.',
    stage: 'fixture_tested', verdict: 'go', costClass: 'free',
    reason: 'The whole product must be buildable, testable and demonstrable with no credentials and no cost. Never user-visible in production: excluded by is_fixture AND by support stage.',
  },
  {
    slug: 'tvmaze',
    name: 'TVmaze',
    sourceType: 'official_api',
    capabilities: ['linear_schedule', 'episode_metadata'],
    accessibility: 'open', authType: 'none', geography: 'US + international',
    coverageLevel: 'national',
    completeness: 'PARTIAL AND KNOWN: ~42 rows for an entire US day. First-run episodes on major networks only — no reruns, syndication, movies, daytime, or local affiliates. Measured, not estimated.',
    rateLimits: '~20 requests / 10 seconds, documented, unauthenticated.',
    termsSummary: 'Free for non-commercial and commercial use; attribution appreciated. No licence agreement required.',
    attributionRequired: false, parserComplexity: 2,
    fallback: 'Stored rows remain; the guide labels its own coverage.',
    stage: 'ingesting', verdict: 'go', costClass: 'free',
    reason: 'Free, official, no key, already ingesting. Genuinely useful for premieres — and honestly labelled as not a full grid, which is the mistake that made a six-hour window render one card.',
  },
  {
    slug: 'tmdb',
    name: 'TMDB',
    sourceType: 'official_api',
    capabilities: ['catalog_metadata', 'episode_metadata'],
    accessibility: 'free_account', authType: 'api_key', geography: 'global',
    coverageLevel: 'national',
    completeness: 'Excellent for titles, overviews, posters, genres, cast. No linear schedules and no authoritative offer data.',
    rateLimits: '~50 requests/second; generous.',
    termsSummary: 'Free API with mandatory attribution. Commercial use permitted.',
    attributionRequired: true, parserComplexity: 2,
    fallback: 'Cached rows; the UI labels missing metadata as unavailable rather than inventing it.',
    stage: 'ingesting', verdict: 'go', costClass: 'free',
    reason: 'Already the catalogue backbone. Attribution obligation is recorded on the source row and travels to every surface rendering its data.',
  },
  {
    slug: 'schedules_direct',
    name: 'Schedules Direct',
    sourceType: 'licensed_api',
    capabilities: ['linear_schedule', 'local_lineups', 'episode_metadata'],
    accessibility: 'paid_account', authType: 'account', geography: 'US + CA',
    coverageLevel: 'affiliate',
    completeness: 'Full US lineups by postal code including local affiliates — the coverage the product actually needs.',
    rateLimits: 'Documented; generous for a single deployment.',
    termsSummary: 'Non-profit, ~$25/year, documented JSON API licensed for exactly this use.',
    attributionRequired: false, parserComplexity: 3,
    fallback: 'TVmaze premieres plus stored rows, with coverage honestly labelled.',
    stage: 'evaluated', verdict: 'conditional', costClass: 'free',
    reason: 'The best fit on merit and the cheapest path to real affiliate-level coverage. CONDITIONAL only on an account being created — the adapter is written and the credentials are the single missing input.',
  },
  {
    slug: 'tv_media',
    name: 'TV Media',
    sourceType: 'licensed_api',
    capabilities: ['linear_schedule', 'local_lineups'],
    accessibility: 'contract_required', authType: 'api_key', geography: 'US + CA',
    coverageLevel: 'provider',
    completeness: 'Full grid by lineup. Pagination behaviour unverified against real documentation.',
    rateLimits: 'Plan-dependent; the real monthly limit is not known.',
    termsSummary: 'Commercial licence required. Metered allowance.',
    attributionRequired: false, parserComplexity: 3,
    fallback: 'TVmaze plus stored rows.',
    stage: 'evaluated', verdict: 'conditional', costClass: 'metered',
    reason: 'DISABLED. Metered, and the previous integration consumed allowance from three trigger paths with nothing able to answer whether a call was permitted. Requires DATA_MODE=paid_live AND TVMEDIA_ENABLED=1 — two explicit keys, neither set.',
  },
  {
    slug: 'watchmode',
    name: 'Watchmode',
    sourceType: 'licensed_api',
    capabilities: ['streaming_offers', 'rental_purchase'],
    accessibility: 'contract_required', authType: 'api_key', geography: 'US + international',
    coverageLevel: 'national',
    completeness: 'Offers including rent/buy with deeplinks. The closest fit for the availability surface.',
    rateLimits: 'Free tier ~2,500 calls/month; paid tiers higher.',
    termsSummary: 'FREE TIER IS NON-COMMERCIAL ONLY. A paid commercial tier is required before any public launch.',
    attributionRequired: false, parserComplexity: 2,
    fallback: 'Cached availability; the UI says "checking availability" rather than guessing.',
    stage: 'evaluated', verdict: 'conditional', costClass: 'metered',
    reason: 'CONDITIONAL on a commercial licensing decision by the account owner, not on engineering. The non-commercial tier cannot lawfully back a public product.',
  },
  {
    slug: 'gracenote',
    name: 'Gracenote / Nielsen',
    sourceType: 'licensed_api',
    capabilities: ['linear_schedule', 'local_lineups', 'catalog_metadata'],
    accessibility: 'contract_required', authType: 'api_key', geography: 'global',
    coverageLevel: 'affiliate',
    completeness: 'The industry reference for lineups and listings.',
    rateLimits: 'Contract-dependent.',
    termsSummary: 'Enterprise contract, negotiated pricing.',
    attributionRequired: true, parserComplexity: 3,
    fallback: 'Schedules Direct at a fraction of the cost.',
    stage: 'discovered', verdict: 'conditional', costClass: 'metered',
    reason: 'A commercial decision for the account owner. Not pursued while Schedules Direct covers the same need at ~$25/year.',
  },
  {
    slug: 'xmltv_open',
    name: 'XMLTV community grabbers',
    sourceType: 'open_data',
    capabilities: ['linear_schedule'],
    accessibility: 'open', authType: 'none', geography: 'varies',
    coverageLevel: 'national',
    completeness: 'Highly variable by grabber; many are thin wrappers around scraping.',
    rateLimits: 'n/a',
    termsSummary: 'The FORMAT is open. Individual grabbers frequently scrape sites whose terms forbid it — the format being open says nothing about the source being lawful.',
    attributionRequired: false, parserComplexity: 4,
    fallback: 'n/a',
    stage: 'evaluated', verdict: 'no_go', costClass: 'free',
    reason: 'The XMLTV format is fine and could be supported as an IMPORT format. Using community grabbers as a production source would mean inheriting whatever they scrape, which is not a lawfulness assessment we can make on their behalf.',
  },
  {
    slug: 'network_schedule_pages',
    name: 'Broadcaster schedule pages',
    sourceType: 'public_schedule_page',
    capabilities: ['linear_schedule'],
    accessibility: 'open', authType: 'none', geography: 'US',
    coverageLevel: 'national',
    completeness: 'One network at a time; layout changes without notice.',
    rateLimits: 'Unstated — which is itself a reason for caution.',
    termsSummary: 'Varies per broadcaster. Many terms prohibit automated collection outright.',
    attributionRequired: true, parserComplexity: 5,
    fallback: 'Licensed provider.',
    stage: 'discovered', verdict: 'no_go', costClass: 'free',
    reason: 'Only ever viable per-network after reading THAT network\'s terms and robots directives, and never as a general strategy. A licensed provider covers all of them lawfully for $25/year, which makes this a bad trade even where it would be permitted.',
  },
  {
    slug: 'search_result_pages',
    name: 'Search-engine result pages',
    sourceType: 'public_schedule_page',
    capabilities: ['linear_schedule', 'streaming_offers'],
    accessibility: 'not_available', authType: 'none', geography: 'global',
    coverageLevel: 'national',
    completeness: 'n/a',
    rateLimits: 'Automated querying is prohibited.',
    termsSummary: 'Prohibited by the terms of every major search engine.',
    attributionRequired: false, parserComplexity: 5,
    fallback: 'Licensed provider.',
    stage: 'discovered', verdict: 'no_go', costClass: 'free',
    reason: 'Explicitly excluded. Recorded here rather than omitted so the decision is visible and does not get rediscovered as a clever idea later.',
  },
  {
    slug: 'provider_lineup_lookup',
    name: 'Pay-TV provider lineup lookups',
    sourceType: 'affiliate_feed',
    capabilities: ['local_lineups'],
    accessibility: 'open', authType: 'none', geography: 'US',
    coverageLevel: 'provider',
    completeness: 'Channel-number mapping per provider and postal code.',
    rateLimits: 'Unstated.',
    termsSummary: 'Per-provider; several prohibit automated access.',
    attributionRequired: false, parserComplexity: 4,
    fallback: 'Schedules Direct carries provider lineups directly.',
    stage: 'discovered', verdict: 'no_go', costClass: 'free',
    reason: 'Superseded: Schedules Direct provides provider lineups under a licence, so there is no reason to take a legally ambiguous route to the same data.',
  },
] as const;

export function feasibilityFor(slug: string): FeasibilityRow | undefined {
  return FEASIBILITY_MATRIX.find((r) => r.slug === slug);
}

export function byVerdict(verdict: FeasibilityVerdict): readonly FeasibilityRow[] {
  return FEASIBILITY_MATRIX.filter((r) => r.verdict === verdict);
}

/**
 * Sources usable RIGHT NOW with no external action: verdict `go`, and not
 * metered. This is what "the product works without a paid contract" means
 * concretely, and it is asserted by a test rather than believed.
 */
export function availableWithoutCredentials(): readonly FeasibilityRow[] {
  return FEASIBILITY_MATRIX.filter(
    (r) => r.verdict === 'go' && r.costClass === 'free'
      && (r.accessibility === 'open' || r.accessibility === 'free_account'),
  );
}

/** What each blocked source is actually waiting on, for the final report. */
export function blockedOn(): { slug: string; needs: string }[] {
  return FEASIBILITY_MATRIX
    .filter((r) => r.verdict === 'conditional')
    .map((r) => ({
      slug: r.slug,
      needs: r.accessibility === 'paid_account' ? 'an account and its credentials'
        : r.accessibility === 'contract_required' ? 'a commercial licensing decision by the account owner'
        : 'credentials',
    }));
}
