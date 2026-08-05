import 'server-only';

/**
 * THE THREE DATA MODES.
 *
 * The whole television/streaming platform runs in exactly one of three modes,
 * and the mode is the ONLY thing that decides whether an adapter is allowed to
 * touch the network and whose money it spends:
 *
 *   fixture    Nothing leaves the box. Every adapter reads deterministic,
 *              generated test data. The full product — ingestion, deltas,
 *              search, ranking, packs, admin — must be exercisable here, at
 *              realistic scale, with no credentials and no cost.
 *
 *   free_live  Adapters may call sources that are free, official, and
 *              permitted, under hard per-source quotas, with recording and
 *              replay so ordinary tests never repeat a live call. This is for
 *              PROVING an adapter against reality, not for collecting a
 *              commercial catalogue.
 *
 *   paid_live  Licensed adapters are permitted to spend metered allowance.
 *              Nothing enters this mode implicitly.
 *
 * WHY THIS EXISTS AS A GATE AND NOT A CONVENTION. The previous integration
 * consumed a metered TV Media allowance from three separate trigger paths
 * (an hourly GitHub workflow, a daily Vercel cron, and a callable route), and
 * nothing in the code could answer "is this call allowed to happen right now".
 * A convention cannot answer that. A gate can, and this is it.
 */

export const DATA_MODES = ['fixture', 'free_live', 'paid_live'] as const;
export type DataMode = (typeof DATA_MODES)[number];

export const DATA_MODE_ENV = 'DATA_MODE';

/**
 * Metered adapters need TWO keys turned, not one: the mode AND their own
 * explicit enable flag. A mode change alone must never start spending.
 */
export const PAID_ADAPTER_ENABLE_ENV: Record<string, string> = {
  tv_media: 'TVMEDIA_ENABLED',
};

/**
 * WHAT AN UNSET `DATA_MODE` MEANS.
 *
 * An unset or unrecognised value must never resolve to a mode that can spend
 * money. It does not: `paid_live` is reachable only by setting DATA_MODE
 * explicitly, and even then a metered adapter needs its own second key. That
 * invariant holds for every default below.
 *
 * Within that constraint the default is environment-aware, because a single
 * hard `fixture` default would have silently stopped the free TVmaze pipeline
 * that is already ingesting in production — a real regression bought for no
 * safety, since TVmaze is free and blocking it saves nothing.
 *
 *   VERCEL_ENV=production, unset  →  free_live   (free sources run; metered blocked)
 *   anything else, unset          →  fixture     (nothing leaves the box)
 *
 * `preview` is listed for completeness only: `mayCallUpstream` refuses preview
 * deployments outright, before the mode is even consulted.
 */
export function currentDataMode(): DataMode {
  const raw = (process.env[DATA_MODE_ENV] ?? '').trim().toLowerCase();
  if ((DATA_MODES as readonly string[]).includes(raw)) return raw as DataMode;
  const vercelEnv = (process.env.VERCEL_ENV ?? '').trim().toLowerCase();
  return vercelEnv === 'production' ? 'free_live' : 'fixture';
}

export function dataModeIsExplicit(): boolean {
  const raw = (process.env[DATA_MODE_ENV] ?? '').trim().toLowerCase();
  return (DATA_MODES as readonly string[]).includes(raw);
}

export type EgressDecision =
  | { allowed: true; mode: DataMode }
  | { allowed: false; mode: DataMode; reason: string; code: EgressDenialCode };

export type EgressDenialCode =
  | 'mode_is_fixture'
  | 'free_adapter_needs_free_or_paid_mode'
  | 'paid_adapter_needs_paid_mode'
  | 'paid_adapter_not_enabled'
  | 'non_production_environment';

/** What an adapter costs us to call. */
export type AdapterCostClass = 'free' | 'metered';

/**
 * MAY THIS ADAPTER TOUCH THE NETWORK, RIGHT NOW, FOR THIS REASON?
 *
 * Every adapter asks this before its first `fetch`, and an adapter that does
 * not ask is a bug the architecture test catches (see adapters/contract.test.ts).
 *
 * The rules, in the order they are applied:
 *
 *  1. Preview and test environments never reach a live source. A preview
 *     deployment spending production allowance is the accident this rule
 *     exists to prevent; there is no legitimate case for it.
 *  2. `fixture` mode reaches nothing at all.
 *  3. A `free` adapter needs `free_live` or `paid_live`.
 *  4. A `metered` adapter needs `paid_live` AND its own enable flag, because
 *     "we switched the mode" must never be sufficient to start a bill.
 */
export function mayCallUpstream(input: {
  adapterId: string;
  cost: AdapterCostClass;
  /** Vercel's env: 'production' | 'preview' | 'development', or unset locally. */
  vercelEnv?: string | undefined;
  nodeEnv?: string | undefined;
}): EgressDecision {
  const mode = currentDataMode();
  const vercelEnv = (input.vercelEnv ?? process.env.VERCEL_ENV ?? '').trim().toLowerCase();
  const nodeEnv = (input.nodeEnv ?? process.env.NODE_ENV ?? '').trim().toLowerCase();

  if (vercelEnv === 'preview') {
    return {
      allowed: false, mode, code: 'non_production_environment',
      reason: 'Preview deployments never call live sources — a preview must not spend production allowance.',
    };
  }
  if (nodeEnv === 'test') {
    return {
      allowed: false, mode, code: 'non_production_environment',
      reason: 'Automated tests never call live sources; use a recorded fixture.',
    };
  }

  if (mode === 'fixture') {
    return {
      allowed: false, mode, code: 'mode_is_fixture',
      reason: `DATA_MODE=fixture: ${input.adapterId} reads generated data and makes no upstream request.`,
    };
  }

  if (input.cost === 'free') {
    return { allowed: true, mode };
  }

  if (mode !== 'paid_live') {
    return {
      allowed: false, mode, code: 'paid_adapter_needs_paid_mode',
      reason: `${input.adapterId} is metered and requires DATA_MODE=paid_live (currently ${mode}).`,
    };
  }

  const flag = PAID_ADAPTER_ENABLE_ENV[input.adapterId];
  if (flag && (process.env[flag] ?? '').trim() !== '1') {
    return {
      allowed: false, mode, code: 'paid_adapter_not_enabled',
      reason: `${input.adapterId} is metered: set ${flag}=1 to authorise spending. DATA_MODE alone is deliberately not enough.`,
    };
  }

  return { allowed: true, mode };
}

/** Shown by /api/health/tv and the admin dashboard. Carries no secret. */
export function dataModeReport() {
  const mode = currentDataMode();
  return {
    mode,
    explicit: dataModeIsExplicit(),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    meteredAdapters: Object.entries(PAID_ADAPTER_ENABLE_ENV).map(([adapterId, flag]) => ({
      adapterId,
      enableFlag: flag,
      enabled: (process.env[flag] ?? '').trim() === '1',
      // The decision, not the credential.
      egress: mayCallUpstream({ adapterId, cost: 'metered' }),
    })),
  };
}
