import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packForStation, knownTvMediaCallSigns, GROUP_TO_PACK } from './packChannelMap';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

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

describe('the wiring actually runs where stations are linked', () => {
  const lazy = read('src/lib/packs/lazyIngest.ts');

  it('lazy ingest links tv_media stations, not only tvmaze', () => {
    expect(lazy).toContain("packForStation('tv_media'");
    expect(lazy).toContain("eq('provider_id', 'tv_media')");
  });

  it('wiring runs on EVERY pack load, not only when an ingest is due', () => {
    // The healing case — stations already ingested by another pipeline — is
    // precisely the case where no fresh ingest is due, so gating the wiring
    // on winning the ingest race would have left Hallmark blind for hours.
    const noRunBranch = lazy.slice(lazy.indexOf('if (!decision?.should_run'), lazy.indexOf('const runId ='));
    expect(noRunBranch).toContain('wirePackStations');
  });
});
