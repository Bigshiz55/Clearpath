import 'server-only';
import { mayCallUpstream } from './dataMode';
import { getTvHealth } from './health';
import {
  buildGuideHealth,
  type GuideHealthReport,
  type LicensingStatus,
  type ProviderFacts,
  type ProviderPurpose,
} from './providerHealth';
import { MANDATORY_CHANNELS } from './dayCoverageAudit';

/**
 * THE PROVIDER REGISTRY — what each source IS, and what we are allowed to do
 * with it, in one auditable list.
 *
 * `purpose` and `licensing` are editorial facts about a contract, not runtime
 * state, so they live here rather than being inferred from whether a key
 * happens to be set. Every previous mistake in this area came from inferring a
 * permission from an operational signal:
 *
 *   "a key exists"        → treated as a licence      (TV Media attribution)
 *   "some rows exist"     → treated as a full grid    (gridLive)
 *   "configured"          → treated as enabled        (coverage notice)
 *
 * Changing a `licensing` value is a deliberate act that should accompany a
 * document. It is not a config toggle and there is no environment variable for
 * it, on purpose.
 */

interface ProviderDefinition {
  providerId: string;
  name: string;
  purpose: ProviderPurpose;
  /** Env var whose presence means "credentials exist". Names only, never values. */
  credentialEnv: string | null;
  /** Explicit operator activation flag, where the provider has one. */
  enableEnv: string | null;
  /** Metered providers are gated by `evaluatePaidCall` before any request. */
  metered: boolean;
  licensing: LicensingStatus;
  /** `null` = undetermined. Undetermined never displays a credit. */
  attributionRequired: boolean | null;
  /** Why licensing is what it is. Shown to operators; carries no secrets. */
  licensingNote: string;
}

export const PROVIDER_DEFINITIONS: readonly ProviderDefinition[] = [
  {
    providerId: 'tv_media',
    name: 'TV Media',
    purpose: 'linear_epg',
    credentialEnv: 'TVMEDIA_API_KEY',
    enableEnv: 'TVMEDIA_ENABLED',
    metered: true,
    licensing: 'unconfirmed',
    /* UNCONFIRMED, NOT CONFIRMED-BY-DEFAULT. A working key proves the account
       exists; it does not prove the contract covers a public, distributable
       product. That question is unanswered — see TVMEDIA_ACTIVATION.md — and
       until it is answered in writing no paid call may be made. */
    attributionRequired: null,
    licensingNote:
      'Commercial licence required; the contract has not been shown to cover public/distributable use of derived listings. ' +
      'Attribution duty is also undetermined — the code previously carried attributionRequired:false while the UI printed a ' +
      'credit "required by their terms". Both cannot be right. See docs/tv-coverage/TVMEDIA_ACTIVATION.md.',
  },
  {
    providerId: 'tvmaze',
    name: 'TVmaze',
    purpose: 'supplemental_metadata',
    credentialEnv: null,
    enableEnv: null,
    metered: false,
    licensing: 'confirmed',
    attributionRequired: true,
    licensingNote:
      'CC BY-SA. Commercial use permitted with attribution; ShareAlike attaches to derived data. ' +
      'SUPPLEMENTAL ONLY — an episode database, not an EPG: it cannot evidence a linear schedule.',
  },
  {
    providerId: 'schedules_direct',
    name: 'Schedules Direct',
    purpose: 'linear_epg',
    credentialEnv: null,
    enableEnv: null,
    metered: false,
    licensing: 'rejected',
    attributionRequired: null,
    licensingNote:
      'REJECTED (owner decision, 2026-08-11). Terms restrict listings to personal use with noncommercial software and ' +
      'memberships to natural persons. Do not integrate, trial, or use as a fallback.',
  },
];

/** Present without ever reading the value — names only. */
function hasEnv(name: string | null): boolean {
  return name == null ? false : !!process.env[name];
}

function isEnabled(def: ProviderDefinition): boolean {
  if (def.enableEnv == null) return def.licensing === 'confirmed';
  return process.env[def.enableEnv] === '1';
}

/**
 * Assemble live provider health.
 *
 * Reads the same durable run records `/api/health/tv` uses, so the two cannot
 * disagree about when a provider last succeeded, and adds the contract facts
 * the older payload has no concept of.
 */
export async function getGuideProviderHealth(nowMs = Date.now()): Promise<GuideHealthReport> {
  const tv = await getTvHealth();
  const byId = new Map(tv.providers.map((p) => [p.providerId, p]));

  const facts: ProviderFacts[] = PROVIDER_DEFINITIONS.map((def) => {
    const run = byId.get(def.providerId);
    const egress = def.metered
      ? mayCallUpstream({ adapterId: def.providerId, cost: 'metered' })
      : { allowed: def.licensing === 'confirmed', code: 'allowed' as string };
    const listingCount = run?.channelsReturned ?? 0;

    return {
      providerId: def.providerId,
      name: def.name,
      purpose: def.purpose,
      configured: def.credentialEnv == null ? def.licensing === 'confirmed' : hasEnv(def.credentialEnv),
      enabled: isEnabled(def),
      egressPermitted: egress.allowed,
      egressDenialCode: egress.allowed ? null : egress.code,
      licensing: def.licensing,
      attributionRequired: def.attributionRequired,
      lastAttemptAtMs: run?.lastRunAt ? Date.parse(run.lastRunAt) : null,
      lastSuccessAtMs: run?.lastSuccessAt ? Date.parse(run.lastSuccessAt) : null,
      listingCount,
      uniqueLinearChannels: run?.channelsReturned ?? 0,
      coveredFromMs: run?.coverageStartUtc ? Date.parse(run.coverageStartUtc) : null,
      coveredToMs: run?.coverageEndUtc ? Date.parse(run.coverageEndUtc) : null,
      /* A SUPPLEMENTAL SOURCE IS NOT EXPECTED TO SUPPLY THESE, so listing them
         against TVmaze would be noise. They are charged to the linear EPG,
         which is the source that owes them. */
      missingMandatoryChannels: def.purpose === 'linear_epg' && listingCount === 0 ? [...MANDATORY_CHANNELS] : [],
    };
  });

  return buildGuideHealth(facts, { nowMs });
}

/** The operator-facing contract notes, safe to serialise. */
export function providerLicensingNotes(): { providerId: string; licensing: LicensingStatus; note: string }[] {
  return PROVIDER_DEFINITIONS.map((d) => ({ providerId: d.providerId, licensing: d.licensing, note: d.licensingNote }));
}

/**
 * May we display a TV Media credit right now?
 *
 * THREE conditions, and the third is the one that was missing: their data must
 * actually be rendered, the provider must not be licensing-rejected, and the
 * attribution duty must be KNOWN to exist. `attributionRequired` is currently
 * `null` for TV Media — the code carried `attributionRequired: false` while the
 * UI printed a credit "required by their terms", and both cannot be right.
 * Undetermined is not permission: printing a credit we cannot evidence is a
 * legal claim made by a UI string, and dropping it costs nothing while the
 * question is open. It returns on its own the moment the registry records a
 * documented duty.
 */
export function tvMediaAttributionApplicable(): boolean {
  const def = PROVIDER_DEFINITIONS.find((d) => d.providerId === 'tv_media');
  if (!def || def.attributionRequired !== true || def.licensing === 'rejected') return false;
  return hasEnv(def.credentialEnv) && isEnabled(def) && mayCallUpstream({ adapterId: def.providerId, cost: 'metered' }).allowed;
}
