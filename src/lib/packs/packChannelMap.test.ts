import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packForStation, knownTvMediaCallSigns, GROUP_TO_PACK } from './packChannelMap';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** These files DESCRIBE the code they must never contain, so prose would
 *  otherwise trip the assertions guarding it. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');


/**
 * THE DEFECT THIS SUITE PINS: pack_stations only ever held the eleven TVmaze
 * stations, so 2,802 TV Media airings — including every Hallmark movie — were
 * invisible to every pack query. The map below is the bridge; these tests keep
 * it truthful in both directions.
 */

describe('TV Media stations reach the right packs', () => {
  it('the production lineup call signs map where the user expects', () => {
    // Verified against the live zip-23059 lineup on 2026-08-05.
    expect(packForStation('tv_media', 'HALL')).toBe('hallmark-universe');
    expect(packForStation('tv_media', 'LIFE')).toBe('lifetime-vault');
    expect(packForStation('tv_media', 'OXY')).toBe('crime-case-files');
    expect(packForStation('tv_media', 'A&E')).toBe('crime-case-files');
  });

  it('matching is exact, never substring — LIFE must not grab lookalikes', () => {
    expect(packForStation('tv_media', 'LIFETIME AWARDS POP-UP')).toBeNull();
    expect(packForStation('tv_media', 'HALLOWEEN CHANNEL')).toBeNull();
    expect(packForStation('tv_media', 'OXYGEN BAR TV')).toBeNull();
  });

  it('case and whitespace do not matter; provider does', () => {
    expect(packForStation('tv_media', ' hall ')).toBe('hallmark-universe');
    // TVmaze links flow through the channel-group config, never this map.
    expect(packForStation('tvmaze', 'HALL')).toBeNull();
  });

  it('the general lineup never leaks into a pack', () => {
    // Real call signs from the same production lineup that must NOT match.
    for (const callSign of ['AMC', 'CNN', 'ESPN', 'FOOD', 'HGTV', 'TBS', 'DISC', 'TLC', 'OWN', 'TRUTV', 'BRAVO']) {
      expect(packForStation('tv_media', callSign), callSign).toBeNull();
    }
  });

  it('every mapped call sign routes to a real pack slug', () => {
    const slugs = new Set(Object.values(GROUP_TO_PACK));
    for (const cs of knownTvMediaCallSigns()) {
      expect(slugs.has(packForStation('tv_media', cs)!), cs).toBe(true);
    }
  });
});

describe('wiring happens in the background, never in a render', () => {
  const refresh = stripComments(read('src/lib/packs/packRefresh.ts'));

  it('wiring links tv_media stations, not only tvmaze', () => {
    expect(refresh).toContain("packForStation(s.provider_id");
    expect(refresh).toContain('TVMAZE_CHANNELS');
  });

  it('every Pack is wired in ONE pass — not one global ingest per Pack visited', () => {
    // The defect: the per-Pack lock guarded a GLOBAL TVmaze ingest, so
    // opening three Packs started three full-catalogue ingests.
    expect(refresh).toContain('refreshAllPackWiring');
    expect(refresh).not.toMatch(/runTvmazeIngest|pack_try_start_ingest/);
  });

  it('the render path reads freshness and nothing else', () => {
    const page = stripComments(read('src/app/packs/[slug]/page.tsx'));
    expect(page).toContain('getPackFreshness');
    expect(page).not.toMatch(/ensurePackIngested|refreshAllPackWiring|maxDuration/);
  });

  it('the background refresh endpoint is what runs the wiring', () => {
    const route = stripComments(read('src/app/api/tv/refresh/route.ts'));
    expect(route).toContain('refreshAllPackWiring');
    expect(route).toContain('runGatedTvIngest');
  });
});

describe('the ingest path actually takes the provider lock', () => {
  const gate = read('src/lib/viewing/ingest/scheduledIngest.ts');

  it('both providers run inside withProviderLock', () => {
    // The time gates answer "is a run DUE?", never "is one HAPPENING?". Two
    // triggers arriving together both read the same timestamp and both start.
    expect(gate).toContain('tv_try_acquire_ingest_lock');
    expect(gate).toContain('tv_release_ingest_lock');
    expect(gate).toMatch(/withProviderLock\(\s*\n?\s*admin, 'tvmaze'/);
    expect(gate).toMatch(/withProviderLock\(\s*\n?\s*admin, 'tv_media'/);
  });

  it('the lock is released in a finally, so a throwing ingest cannot strand it', () => {
    expect(gate).toMatch(/finally\s*\{[\s\S]*tv_release_ingest_lock/);
  });

  it('an environment without the lock still ingests — it fails OPEN', () => {
    // A missing RPC must not stop the pipeline; the time gates still bound it.
    expect(gate).toContain('lockAvailable');
    expect(gate).toMatch(/if \(lockAvailable && !acquired\) return skipped\(\)/);
  });
});
