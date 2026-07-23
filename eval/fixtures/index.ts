/**
 * Phase 4 — the frozen "world" the deterministic evaluator runs against.
 *
 * A `FixtureWorld` is a fully-reproducible snapshot: a fixed `nowMs`, the
 * catalog, the profiles, and helpers that resolve broadcast airings (declared
 * as offsets from `now`) into concrete UTC airstamps. All time math flows
 * through the injected `nowMs` so a run is bit-for-bit reproducible.
 */
import { CATALOG, catalogId, type FixtureTitle } from './titles';
import { PROFILES, profile, type EvalProfile } from './profiles';

export * from './titles';
export * from './profiles';

/** A fixed reference instant so fixtures never depend on wall-clock time.
 *  2026-07-23T18:00:00Z (a Thursday afternoon ET). */
export const FIXTURE_NOW_MS = Date.parse('2026-07-23T18:00:00.000Z');

export interface ResolvedAiring {
  title: FixtureTitle;
  id: string;
  networkKey: string;
  startMs: number;
  endMs: number;
  runtimeMinutes: number;
  isRerun: boolean;
}

export interface FixtureWorld {
  nowMs: number;
  catalog: FixtureTitle[];
  profiles: Record<string, EvalProfile>;
  titleById(id: string): FixtureTitle | null;
  profile(key: string): EvalProfile;
  /**
   * Broadcast airings visible in a window, using the SAME in-progress semantics
   * the production stored-grid path uses: an airing is visible when it has not
   * finished (`end > now`) and starts at/before the window close.
   */
  airingsWithin(opts: { horizonHours: number; networkKey?: string | null; movieOnly?: boolean }): ResolvedAiring[];
}

export function makeWorld(nowMs: number = FIXTURE_NOW_MS): FixtureWorld {
  const byId = new Map<string, FixtureTitle>();
  // Keep the FIRST declaration for a given id as canonical (the duplicate 2003
  // second listing is a rerun feed — it must dedup away, not overwrite).
  for (const t of CATALOG) {
    const id = catalogId(t);
    if (!byId.has(id)) byId.set(id, t);
  }

  return {
    nowMs,
    catalog: CATALOG,
    profiles: PROFILES,
    titleById: (id) => byId.get(id) ?? null,
    profile,
    airingsWithin({ horizonHours, networkKey = null, movieOnly = false }) {
      const windowClose = nowMs + horizonHours * 3600_000;
      const out: ResolvedAiring[] = [];
      for (const t of CATALOG) {
        for (const a of t.facts.airings ?? []) {
          if (networkKey && a.networkKey !== networkKey) continue;
          if (movieOnly && t.facts.contentType !== 'movie') continue;
          const startMs = nowMs + a.startOffsetHours * 3600_000;
          const endMs = startMs + a.runtimeMinutes * 60_000;
          // in-progress-inclusive window (matches tvGrid.getStoredGridAirings)
          if (endMs > nowMs && startMs <= windowClose) {
            out.push({
              title: t,
              id: catalogId(t),
              networkKey: a.networkKey,
              startMs,
              endMs,
              runtimeMinutes: a.runtimeMinutes,
              isRerun: Boolean(a.isRerun),
            });
          }
        }
      }
      return out.sort((x, y) => x.startMs - y.startMs);
    },
  };
}
