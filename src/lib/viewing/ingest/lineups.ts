/**
 * DEVELOPMENT LINEUP REGISTRY.
 *
 * "Every channel" means every channel in an ENABLED lineup — not every channel
 * carried by every provider in the country. One lineup is one market on one
 * carrier, and the architecture is deliberately keyed on that rather than on a
 * city, a carrier or a timezone.
 *
 * Central and Mountain are defined here already but left disabled: enabling
 * them is a data change, not a code change, which is the property this registry
 * exists to prove.
 *
 * A lineup we cannot legally reach yet is marked `awaiting_plan_access`. It is
 * never quietly substituted with a generic one — fabricating provider access is
 * exactly the kind of thing that makes a schedule untrustworthy.
 */

export type LineupType = 'generic' | 'antenna' | 'cable' | 'satellite' | 'iptv';

export interface LineupDef {
  key: string;
  name: string;
  /** Provider's own lineup identifier. Null until the plan grants one. */
  providerLineupId: string | null;
  market: { name: string; postalCode: string | null; country: string; timezone: string };
  type: LineupType;
  enabled: boolean;
  /** True when the lineup is real but our plan does not yet reach it. */
  awaitingPlanAccess: boolean;
  /** Why this lineup is in the development set. */
  purpose: string;
}

export const LINEUPS: LineupDef[] = [
  {
    key: 'us_generic_eastern',
    name: 'US Generic Eastern',
    providerLineupId: null,
    market: { name: 'US Eastern', postalCode: null, country: 'US', timezone: 'America/New_York' },
    type: 'generic',
    enabled: true,
    awaitingPlanAccess: false,
    purpose: 'Primary development lineup — interface work and Eastern Time testing.',
  },
  {
    key: 'us_generic_pacific',
    name: 'US Generic Pacific',
    providerLineupId: null,
    market: { name: 'US Pacific', postalCode: null, country: 'US', timezone: 'America/Los_Angeles' },
    type: 'generic',
    enabled: true,
    awaitingPlanAccess: false,
    purpose: 'Timezone and schedule-state testing against a second zone.',
  },
  {
    key: 'richmond_ota',
    name: 'Richmond over-the-air',
    providerLineupId: null,
    market: { name: 'Richmond, VA', postalCode: '23219', country: 'US', timezone: 'America/New_York' },
    type: 'antenna',
    enabled: false,
    awaitingPlanAccess: true,
    purpose: 'Real local affiliates. Enable when the plan grants a Richmond lineup.',
  },
  {
    key: 'richmond_cable',
    name: 'Richmond cable',
    providerLineupId: null,
    market: { name: 'Richmond, VA', postalCode: '23219', country: 'US', timezone: 'America/New_York' },
    type: 'cable',
    enabled: false,
    awaitingPlanAccess: true,
    purpose: 'Real local cable lineup. Enable when the plan grants it.',
  },
  // Defined, disabled. Turning these on is a flag flip — no code change.
  {
    key: 'us_generic_central',
    name: 'US Generic Central',
    providerLineupId: null,
    market: { name: 'US Central', postalCode: null, country: 'US', timezone: 'America/Chicago' },
    type: 'generic',
    enabled: false,
    awaitingPlanAccess: false,
    purpose: 'Ready to enable once the call allowance supports a third lineup.',
  },
  {
    key: 'us_generic_mountain',
    name: 'US Generic Mountain',
    providerLineupId: null,
    market: { name: 'US Mountain', postalCode: null, country: 'US', timezone: 'America/Denver' },
    type: 'generic',
    enabled: false,
    awaitingPlanAccess: false,
    purpose: 'Ready to enable. Note Arizona needs its own lineup — it does not observe DST.',
  },
];

export const enabledLineups = (): LineupDef[] => LINEUPS.filter((l) => l.enabled);
export const lineupByKey = (k: string): LineupDef | undefined => LINEUPS.find((l) => l.key === k);

/** Lineups we intend to serve but cannot yet reach. Surfaced in admin, never faked. */
export const blockedLineups = (): LineupDef[] => LINEUPS.filter((l) => l.awaitingPlanAccess);

// ---------------------------------------------------------------------------
// DAILY SCHEDULING
// ---------------------------------------------------------------------------

/** Target local hour for the nightly run, in the lineup's market timezone. */
export const INGEST_LOCAL_HOUR = 2;

/**
 * Is it currently the ingestion hour in this lineup's market?
 *
 * Vercel Cron fires on a fixed UTC schedule, so a single UTC time drifts by an
 * hour across DST — 2:00 AM local becomes 1:00 or 3:00. Rather than document
 * that drift and accept it, the cron fires HOURLY and each lineup runs only
 * when it is genuinely 2 AM in its own market. Intl handles DST and the
 * non-observing zones, so Eastern, Pacific and Arizona each get their own 2 AM
 * without separate cron entries.
 */
export function isIngestHourFor(lineup: LineupDef, nowMs: number): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: lineup.market.timezone, hour: 'numeric', hour12: false,
    }).format(new Date(nowMs)),
  );
  return (hour % 24) === INGEST_LOCAL_HOUR;
}

/** Local calendar day for a lineup, so one run per day can be enforced. */
export function localDayKey(lineup: LineupDef, nowMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: lineup.market.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(nowMs));
}

/**
 * Which lineups should run right now.
 *
 * `lastRunDayKey` is each lineup's last successful local day, so a retry later
 * in the day is possible while an accidental second run in the same hour is not.
 */
export function lineupsDueNow(
  nowMs: number,
  lastRunDayKey: Record<string, string | null> = {},
): LineupDef[] {
  return enabledLineups().filter((l) => {
    if (!isIngestHourFor(l, nowMs)) return false;
    return lastRunDayKey[l.key] !== localDayKey(l, nowMs);
  });
}

/** Coverage window to request, in hours. */
export const COVERAGE_HOURS = { minimum: 24, preferred: 48, maximum: 72 } as const;
