/**
 * PROVIDER HEALTH — one row per source, and no way to average them together.
 *
 * The guide reported health as a single blurry idea, and every wrong decision
 * this month came from that. `hasFullGridProvider()` meant "a key exists".
 * `gridLive` meant "some rows exist". Neither means "a licensed provider is
 * supplying a television schedule", and on production both were true while the
 * guide showed 12 channels of 76 with three of them websites.
 *
 * So health is per-provider and every field is separately measurable. The two
 * that carry the most weight:
 *
 *   • `purpose` — TVmaze is `supplemental_metadata`, permanently. It indexes
 *     episodes of series it tracks; it does not model a channel's 24-hour grid,
 *     so movies, reruns and paid programming produce no record at all. It can
 *     be perfectly healthy AND useless as proof of a linear schedule, and the
 *     type system now says so: `isFullGridHealthy` cannot return true for a
 *     supplemental provider no matter how many rows it returned.
 *
 *   • `licensing` — 'confirmed' | 'unconfirmed' | 'rejected'. A credential is
 *     not a licence. Schedules Direct is `rejected` (personal use,
 *     noncommercial software, natural persons); TV Media is `unconfirmed`
 *     until the contract question in `docs/tv-coverage/TVMEDIA_ACTIVATION.md`
 *     is answered in writing. Nothing may call a provider whose licensing is
 *     not `confirmed`.
 *
 * Pure: no I/O, no clock, no secrets. Callers pass already-fetched facts, which
 * is what makes the whole thing unit-testable and what keeps a key from ever
 * reaching a health payload.
 */

export type ProviderPurpose = 'linear_epg' | 'supplemental_metadata';

/** Whether we hold written permission for THIS product's public use. */
export type LicensingStatus = 'confirmed' | 'unconfirmed' | 'rejected';

/** Facts a caller gathers about one provider. No secrets, ever. */
export interface ProviderFacts {
  providerId: string;
  name: string;
  purpose: ProviderPurpose;
  /** Credentials present. NOT permission — see `licensing`. */
  configured: boolean;
  /** The operator's explicit enable flag (e.g. TVMEDIA_ENABLED). */
  enabled: boolean;
  /** The egress gate's current answer, and why. */
  egressPermitted: boolean;
  egressDenialCode?: string | null;
  licensing: LicensingStatus;
  /** Does the licence require a visible credit? `null` = we do not yet know. */
  attributionRequired: boolean | null;
  lastAttemptAtMs: number | null;
  lastSuccessAtMs: number | null;
  listingCount: number;
  uniqueLinearChannels: number;
  coveredFromMs: number | null;
  coveredToMs: number | null;
  /** Mandatory channels this provider was expected to supply and did not. */
  missingMandatoryChannels: string[];
}

export interface ProviderHealthReport extends Omit<ProviderFacts, 'egressDenialCode'> {
  /** ms since the last SUCCESSFUL ingest; null when it has never succeeded. */
  dataAgeMs: number | null;
  /** True only for a linear_epg provider that is licensed, on, and fresh. */
  fullGridHealthy: boolean;
  /** Null when nothing is wrong; otherwise ONE sentence naming the cause. */
  degradedReason: string | null;
  /** Show a credit right now? Requires rendering its data AND a known duty. */
  attributionApplicable: boolean;
}

/** A daily source plus grace. Older than this and the data is not "current". */
export const PROVIDER_FRESHNESS_MS = 26 * 3_600_000;

export interface HealthOptions {
  nowMs: number;
  freshnessMs?: number;
}

/**
 * Why is this provider not delivering a healthy licensed grid?
 *
 * Ordered by what a reader must fix FIRST. Licensing outranks everything: a
 * rejected source is not a configuration problem and must never be reported as
 * one, or someone will "fix" it by setting a flag.
 */
function degradedReasonFor(f: ProviderFacts, dataAgeMs: number | null, freshnessMs: number): string | null {
  if (f.licensing === 'rejected') {
    return `${f.name} is licensing-rejected for this product and must not be called.`;
  }
  if (f.purpose === 'supplemental_metadata') {
    return `${f.name} is a supplemental metadata source, not a linear EPG — it cannot evidence a full schedule.`;
  }
  if (f.licensing !== 'confirmed') {
    return `${f.name} licensing is ${f.licensing}; calls are blocked until it is confirmed in writing.`;
  }
  if (!f.configured) return `${f.name} has no credentials configured.`;
  if (!f.enabled) return `${f.name} is configured but not enabled by its explicit activation flag.`;
  if (!f.egressPermitted) {
    return `${f.name} is blocked by the egress gate${f.egressDenialCode ? ` (${f.egressDenialCode})` : ''}.`;
  }
  if (f.lastSuccessAtMs == null) return `${f.name} has never completed a successful ingest.`;
  if (dataAgeMs != null && dataAgeMs > freshnessMs) {
    return `${f.name} data is ${Math.round(dataAgeMs / 3_600_000)}h old, past the ${Math.round(freshnessMs / 3_600_000)}h freshness window.`;
  }
  if (f.listingCount === 0) return `${f.name} is current but returned no listings.`;
  if (f.missingMandatoryChannels.length > 0) {
    return `${f.name} is missing ${f.missingMandatoryChannels.length} mandatory channel(s): ${f.missingMandatoryChannels.join(', ')}.`;
  }
  return null;
}

export function buildProviderHealth(f: ProviderFacts, opts: HealthOptions): ProviderHealthReport {
  const freshnessMs = opts.freshnessMs ?? PROVIDER_FRESHNESS_MS;
  const dataAgeMs = f.lastSuccessAtMs == null ? null : Math.max(0, opts.nowMs - f.lastSuccessAtMs);
  const degradedReason = degradedReasonFor(f, dataAgeMs, freshnessMs);

  /* A SUPPLEMENTAL SOURCE CAN NEVER BE "FULL GRID HEALTHY".
     This is the guard the old `gridLive` lacked: TVmaze returning 133 rows is
     not a grid, and no row count may promote it to one. */
  const fullGridHealthy =
    f.purpose === 'linear_epg' &&
    f.licensing === 'confirmed' &&
    f.configured &&
    f.enabled &&
    f.egressPermitted &&
    f.listingCount > 0 &&
    dataAgeMs != null &&
    dataAgeMs <= freshnessMs;

  /* ATTRIBUTION IS OWED ONLY WHEN WE RENDER THEIR DATA AND THE LICENCE SAYS SO.
     `attributionRequired: null` means undetermined, and undetermined is NOT a
     licence to display a credit — a credit under someone else's data is its own
     kind of false statement. */
  const attributionApplicable = f.attributionRequired === true && f.listingCount > 0 && f.licensing !== 'rejected';

  const { egressDenialCode: _drop, ...rest } = f;
  return { ...rest, dataAgeMs, fullGridHealthy, degradedReason, attributionApplicable };
}

export interface GuideHealthReport {
  providers: ProviderHealthReport[];
  /** True only if SOME provider is a healthy licensed linear grid. */
  hasLicensedLinearGrid: boolean;
  /** What the guide may honestly claim right now. */
  claim: 'full_grid' | 'partial_listings';
  /** Every distinct degraded reason, for an operator to read top-down. */
  degradedReasons: string[];
}

export function buildGuideHealth(facts: readonly ProviderFacts[], opts: HealthOptions): GuideHealthReport {
  const providers = facts.map((f) => buildProviderHealth(f, opts));
  const hasLicensedLinearGrid = providers.some((p) => p.fullGridHealthy);
  return {
    providers,
    hasLicensedLinearGrid,
    claim: hasLicensedLinearGrid ? 'full_grid' : 'partial_listings',
    degradedReasons: providers.map((p) => p.degradedReason).filter((r): r is string => r != null),
  };
}
