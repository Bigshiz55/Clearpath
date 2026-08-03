/**
 * RECONCILING A FETCHED SCHEDULE AGAINST WHAT IS STORED.
 *
 * Pure: takes the rows we just fetched and the rows already in the database,
 * and returns the exact set of inserts, updates, expirations and untouched
 * rows. Keeping this out of the database layer is what makes "a failed refresh
 * must never wipe the active schedule" a testable property rather than a hope.
 *
 * The rule that matters most: reconciliation only ever expires rows inside the
 * window we actually fetched, and only when the fetch SUCCEEDED. A partial or
 * failed run leaves the stored schedule alone.
 */

export interface FetchedAiring {
  /** Provider's own airing id, when it has one. */
  providerAiringId: string | null;
  stationId: string;
  programmeId: string;
  startAtUtc: string;
  endAtUtc: string | null;
  /** Hash of the provider payload, so unchanged rows are cheap to detect. */
  rawHash: string;
  isNew?: boolean;
  isLive?: boolean;
  isRepeat?: boolean;
}

export interface StoredAiring extends FetchedAiring {
  id: string;
  lastSeenAt: string;
}

export interface ReconcileInput {
  lineupId: string;
  fetched: FetchedAiring[];
  stored: StoredAiring[];
  /** The window this fetch actually covered — expiry is scoped to it. */
  windowStartUtcMs: number;
  windowEndUtcMs: number;
  /** False when any part of the fetch failed. Suppresses all expiry. */
  fetchComplete: boolean;
  nowMs: number;
}

export interface ReconcilePlan {
  insert: FetchedAiring[];
  update: { id: string; row: FetchedAiring }[];
  /** Present and identical — only `last_seen_at` needs touching. */
  unchanged: string[];
  /** Stored inside the fetched window but absent from the fetch: cancelled. */
  expire: string[];
  /** Rows we deliberately left alone, with the reason. */
  skipped: { id: string; reason: string }[];
  stats: {
    fetched: number; stored: number;
    inserted: number; updated: number; unchanged: number; expired: number;
  };
}

/**
 * Identity for an airing.
 *
 * Provider id when available. Otherwise a composite of station + start +
 * programme — never title text alone, which would merge two different films
 * sharing a name and split one film whose title was punctuated differently.
 */
export function airingKey(a: FetchedAiring): string {
  if (a.providerAiringId) return `pid:${a.providerAiringId}`;
  return `k:${a.stationId}|${a.startAtUtc}|${a.programmeId}`;
}

const inWindow = (iso: string, startMs: number, endMs: number): boolean => {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= startMs && t <= endMs;
};

export function reconcile(i: ReconcileInput): ReconcilePlan {
  const plan: ReconcilePlan = {
    insert: [], update: [], unchanged: [], expire: [], skipped: [],
    stats: { fetched: i.fetched.length, stored: i.stored.length, inserted: 0, updated: 0, unchanged: 0, expired: 0 },
  };

  const storedByKey = new Map<string, StoredAiring>();
  for (const s of i.stored) storedByKey.set(airingKey(s), s);

  const seen = new Set<string>();
  for (const f of i.fetched) {
    const key = airingKey(f);
    // A provider can repeat a row inside one payload; take it once.
    if (seen.has(key)) continue;
    seen.add(key);

    const existing = storedByKey.get(key);
    if (!existing) {
      plan.insert.push(f);
      continue;
    }
    // Identical payload → nothing to write but the freshness stamp.
    if (existing.rawHash === f.rawHash) {
      plan.unchanged.push(existing.id);
      continue;
    }
    plan.update.push({ id: existing.id, row: f });
  }

  // EXPIRY. Only for a complete fetch, and only inside the window we asked
  // for — a 6-hour refresh must never delete tomorrow's listings.
  if (i.fetchComplete) {
    for (const s of i.stored) {
      if (seen.has(airingKey(s))) continue;
      if (!inWindow(s.startAtUtc, i.windowStartUtcMs, i.windowEndUtcMs)) {
        plan.skipped.push({ id: s.id, reason: 'outside the refreshed window' });
        continue;
      }
      plan.expire.push(s.id);
    }
  } else {
    for (const s of i.stored) {
      if (!seen.has(airingKey(s))) {
        plan.skipped.push({ id: s.id, reason: 'fetch incomplete — expiry suppressed' });
      }
    }
  }

  plan.stats.inserted = plan.insert.length;
  plan.stats.updated = plan.update.length;
  plan.stats.unchanged = plan.unchanged.length;
  plan.stats.expired = plan.expire.length;
  return plan;
}

/**
 * Rows whose licence retention has lapsed.
 *
 * Licensed schedule data is not ours to keep indefinitely. This selects what
 * must go; the caller deletes and records the count for the purge audit.
 */
export function selectExpiredByRetention(
  stored: { id: string; fetchedAt: string }[],
  retentionDays: number,
  nowMs: number,
): string[] {
  const cutoff = nowMs - retentionDays * 86_400_000;
  return stored
    .filter((s) => {
      const t = Date.parse(s.fetchedAt);
      return Number.isFinite(t) && t < cutoff;
    })
    .map((s) => s.id);
}

/**
 * Split into fixed-size batches for bulk writes.
 *
 * A first-time ingest across a wide window and every discovered channel can
 * mean thousands of rows; one PostgREST call per row (thousands of sequential
 * awaited round-trips) is what blew a real cron run past Vercel's function
 * timeout. Batching turns that into a handful of bulk upsert/insert calls —
 * still chunked, so one call's payload cannot grow unbounded either.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const n = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/** Stable hash of a provider payload, for change detection. */
export function hashPayload(o: unknown): string {
  const s = JSON.stringify(o, Object.keys(o as object).sort());
  let h = 2166136261;
  for (let n = 0; n < s.length; n++) {
    h ^= s.charCodeAt(n);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
