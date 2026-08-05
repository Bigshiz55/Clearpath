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
 *
 * ── PRODUCTION FAILS CLOSED ───────────────────────────────────────────────
 *
 * In a real production deployment `DATA_MODE` is REQUIRED. There is no
 * production default — not `paid_live`, and not `free_live` either.
 *
 * An earlier revision defaulted production to `free_live` so the free TVmaze
 * pipeline would keep running. That reasoning was wrong in the way that
 * matters: it made an UNCONFIGURED production deployment indistinguishable
 * from a deliberately configured one. "Nobody set this" and "somebody chose
 * free_live" produced identical behaviour, so a missing variable — after a
 * project migration, an env wipe, a new deployment target — would silently
 * start calling providers with nobody having decided that it should.
 *
 * A missing or unrecognised `DATA_MODE` in production is now a
 * CONFIGURATION_ERROR, and the platform degrades deliberately:
 *
 *   - zero external provider requests, free or metered;
 *   - every ingestion adapter disabled;
 *   - /api/health/tv reports the error, loudly and by name;
 *   - the last stored VERIFIED data keeps being served, because deleting the
 *     listings we already have is a worse answer than serving them with an
 *     honest freshness label; and
 *   - fixture rows are still never shown to ordinary production users, so a
 *     misconfigured deployment cannot fall back into showing test data.
 *
 * Outside production — local development, unit tests, CI, and preview
 * deployments — an unset value still resolves to `fixture`, because there the
 * safe default IS the useful one: everything runs, nothing leaves the box.
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

/** True only for a real production deployment, not preview and not local. */
export function isProductionDeployment(vercelEnv?: string | undefined): boolean {
  return (vercelEnv ?? process.env.VERCEL_ENV ?? '').trim().toLowerCase() === 'production';
}

export const CONFIGURATION_ERROR = 'CONFIGURATION_ERROR' as const;

/**
 * The resolved state of the platform's data policy.
 *
 * `configured: false` is not "use a default" — it is a distinct operating
 * state in which nothing ingests and nothing external is called. Callers must
 * handle it explicitly; that is the whole point of making it a separate shape
 * rather than a mode value with a footnote.
 */
export type DataModeState =
  | { configured: true; mode: DataMode; explicit: boolean }
  | {
      configured: false;
      code: typeof CONFIGURATION_ERROR;
      reason: string;
      /** What was actually present, so an operator can see the typo. */
      rawValue: string | null;
    };

function rawDataMode(): string | null {
  const raw = process.env[DATA_MODE_ENV];
  if (raw === undefined) return null;
  return raw.trim();
}

/**
 * RESOLVE THE POLICY. This is the function everything else is built on.
 */
export function resolveDataMode(vercelEnv?: string | undefined): DataModeState {
  const raw = rawDataMode();
  const normalized = (raw ?? '').toLowerCase();
  const valid = (DATA_MODES as readonly string[]).includes(normalized);

  if (valid) return { configured: true, mode: normalized as DataMode, explicit: true };

  if (isProductionDeployment(vercelEnv)) {
    return {
      configured: false,
      code: CONFIGURATION_ERROR,
      rawValue: raw,
      reason:
        raw === null || raw === ''
          ? `${DATA_MODE_ENV} is not set on this production deployment. Production has no default: set it to one of ${DATA_MODES.join(', ')}. Until it is set, every ingestion adapter is disabled and no external provider is called.`
          : `${DATA_MODE_ENV}="${raw}" is not a recognised mode. Valid values are ${DATA_MODES.join(', ')}. Until it is corrected, every ingestion adapter is disabled and no external provider is called.`,
    };
  }

  // Local dev, unit tests, CI, preview: the safe default is also the useful
  // one — everything runs, nothing leaves the box.
  return { configured: true, mode: 'fixture', explicit: false };
}

/**
 * The mode, for callers that only need a label. A misconfigured production
 * deployment reports `fixture` here because that is the closest description
 * of its EGRESS behaviour (it reaches nothing) — but callers deciding whether
 * to ingest, or whether to show data, must use `resolveDataMode` /
 * `ingestionIsDisabled`, since a misconfigured deployment also may not show
 * fixture content. Kept narrow deliberately.
 */
export function currentDataMode(): DataMode {
  const state = resolveDataMode();
  return state.configured ? state.mode : 'fixture';
}

export function dataModeIsExplicit(): boolean {
  const state = resolveDataMode();
  return state.configured && state.explicit;
}

/** True when no adapter may ingest anything at all, for any provider. */
export function ingestionIsDisabled(vercelEnv?: string | undefined): boolean {
  return !resolveDataMode(vercelEnv).configured;
}

export type EgressDecision =
  | { allowed: true; mode: DataMode }
  | { allowed: false; mode: DataMode; reason: string; code: EgressDenialCode };

export type EgressDenialCode =
  | 'mode_is_fixture'
  | 'free_adapter_needs_free_or_paid_mode'
  | 'paid_adapter_needs_paid_mode'
  | 'paid_adapter_not_enabled'
  | 'non_production_environment'
  | 'configuration_error';

/** What an adapter costs us to call. */
export type AdapterCostClass = 'free' | 'metered';

/**
 * MAY THIS ADAPTER TOUCH THE NETWORK, RIGHT NOW, FOR THIS REASON?
 *
 * Every adapter asks this before its first `fetch`, and an adapter that does
 * not ask is a bug the architecture test catches (see egressContract.test.ts).
 *
 * The rules, in the order they are applied:
 *
 *  1. Preview and test environments never reach a live source. A preview
 *     deployment spending production allowance is the accident this rule
 *     exists to prevent; there is no legitimate case for it.
 *  2. An unconfigured production deployment reaches nothing at all.
 *  3. `fixture` mode reaches nothing at all.
 *  4. A `free` adapter needs `free_live` or `paid_live`.
 *  5. A `metered` adapter needs `paid_live` AND its own enable flag, because
 *     "we switched the mode" must never be sufficient to start a bill.
 */
export function mayCallUpstream(input: {
  adapterId: string;
  cost: AdapterCostClass;
  /** Vercel's env: 'production' | 'preview' | 'development', or unset locally. */
  vercelEnv?: string | undefined;
  nodeEnv?: string | undefined;
}): EgressDecision {
  const vercelEnv = (input.vercelEnv ?? process.env.VERCEL_ENV ?? '').trim().toLowerCase();
  const nodeEnv = (input.nodeEnv ?? process.env.NODE_ENV ?? '').trim().toLowerCase();
  const state = resolveDataMode(vercelEnv);
  const mode: DataMode = state.configured ? state.mode : 'fixture';

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

  if (!state.configured) {
    return { allowed: false, mode, code: 'configuration_error', reason: state.reason };
  }

  if (state.mode === 'fixture') {
    return {
      allowed: false, mode, code: 'mode_is_fixture',
      reason: `DATA_MODE=fixture: ${input.adapterId} reads generated data and makes no upstream request.`,
    };
  }

  if (input.cost === 'free') {
    return { allowed: true, mode };
  }

  if (state.mode !== 'paid_live') {
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
  const state = resolveDataMode();
  return {
    configured: state.configured,
    mode: state.configured ? state.mode : null,
    explicit: state.configured ? state.explicit : false,
    configurationError: state.configured ? null : { code: state.code, reason: state.reason },
    ingestionDisabled: !state.configured,
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
