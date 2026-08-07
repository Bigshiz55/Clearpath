import { describe, it, expect } from 'vitest';
import {
  buildCoverageMatrix,
  FRESHNESS_WINDOW_MS,
  type ConfiguredChannel,
  type CoverageInput,
} from './coverageAudit';

const NOW = Date.UTC(2026, 7, 7, 12, 0, 0); // 2026-08-07T12:00Z
const HOUR = 3_600_000;

const ch = (id: string, adapter: 'tvmaze' | 'tv_media' = 'tvmaze', group = 'g'): ConfiguredChannel => ({
  id, displayName: id.toUpperCase(), sourceAdapter: adapter, group,
});

function input(over: Partial<CoverageInput>): CoverageInput {
  return {
    configured: [],
    stations: [],
    airings: [],
    runs: [{ providerId: 'tvmaze', status: 'success', startedAtMs: NOW - HOUR }],
    nowMs: NOW,
    ingestionDisabled: false,
    ...over,
  };
}

describe('TV coverage audit — per-channel classification', () => {
  it('HEALTHY: configured + fresh run + a future airing', () => {
    const m = buildCoverageMatrix(input({
      configured: [ch('lifetime')],
      stations: [{ providerId: 'tvmaze', providerStationId: 'lifetime', name: 'Lifetime' }],
      airings: [{ providerId: 'tvmaze', stationProviderId: 'lifetime', startAtUtcMs: NOW + 2 * HOUR }],
    }));
    expect(m.rows[0]!.status).toBe('HEALTHY');
    expect(m.rows[0]!.airings12h).toBe(1);
    expect(m.summary.healthy).toBe(1);
    expect(m.summary.healthyPct).toBe(100);
  });

  it('NO_SOURCE: source ran but returned no station for the channel', () => {
    const m = buildCoverageMatrix(input({
      configured: [ch('hallmark_family')],
      stations: [], // nothing ingested for it
    }));
    expect(m.rows[0]!.status).toBe('NO_SOURCE');
    expect(m.rows[0]!.stationIngested).toBe(false);
  });

  it('SOURCE_EMPTY: station exists but no future airings', () => {
    const m = buildCoverageMatrix(input({
      configured: [ch('oxygen')],
      stations: [{ providerId: 'tvmaze', providerStationId: 'oxygen', name: 'Oxygen' }],
      airings: [{ providerId: 'tvmaze', stationProviderId: 'oxygen', startAtUtcMs: NOW - 3 * HOUR }], // past only
    }));
    expect(m.rows[0]!.status).toBe('SOURCE_EMPTY');
  });

  it('INGEST_FAILED: the latest run for the source failed', () => {
    const m = buildCoverageMatrix(input({
      configured: [ch('lifetime')],
      runs: [{ providerId: 'tvmaze', status: 'failed', startedAtMs: NOW - HOUR }],
    }));
    expect(m.rows[0]!.status).toBe('INGEST_FAILED');
  });

  it('INGEST_DISABLED: dark channel is attributed to the disabled switch, not the channel', () => {
    const m = buildCoverageMatrix(input({
      configured: [ch('lifetime')],
      ingestionDisabled: true,
    }));
    expect(m.rows[0]!.status).toBe('INGEST_DISABLED');
    expect(m.ingestionDisabled).toBe(true);
  });

  it('STALE: has airings but the source ingest is older than the freshness window', () => {
    const m = buildCoverageMatrix(input({
      configured: [ch('lifetime')],
      stations: [{ providerId: 'tvmaze', providerStationId: 'lifetime', name: 'Lifetime' }],
      airings: [{ providerId: 'tvmaze', stationProviderId: 'lifetime', startAtUtcMs: NOW + 2 * HOUR }],
      runs: [{ providerId: 'tvmaze', status: 'success', startedAtMs: NOW - (FRESHNESS_WINDOW_MS + HOUR) }],
    }));
    expect(m.rows[0]!.status).toBe('STALE');
  });

  it('a HEALTHY channel stays HEALTHY even when ingestion is disabled (the data is already there)', () => {
    const m = buildCoverageMatrix(input({
      configured: [ch('lifetime')],
      stations: [{ providerId: 'tvmaze', providerStationId: 'lifetime', name: 'Lifetime' }],
      airings: [{ providerId: 'tvmaze', stationProviderId: 'lifetime', startAtUtcMs: NOW + HOUR }],
      ingestionDisabled: true,
    }));
    expect(m.rows[0]!.status).toBe('HEALTHY');
  });

  it('UNMAPPED: an ingested station with no configured channel is surfaced, never hidden', () => {
    const m = buildCoverageMatrix(input({
      configured: [ch('lifetime')],
      stations: [
        { providerId: 'tvmaze', providerStationId: 'lifetime', name: 'Lifetime' },
        { providerId: 'tv_media', providerStationId: 'ESPN', name: 'ESPN' }, // not configured
      ],
      airings: [{ providerId: 'tvmaze', stationProviderId: 'lifetime', startAtUtcMs: NOW + HOUR }],
    }));
    const espn = m.rows.find((r) => r.channelId === 'ESPN');
    expect(espn?.status).toBe('UNMAPPED');
  });

  it('12/24/48h windows count correctly and are monotonic', () => {
    const m = buildCoverageMatrix(input({
      configured: [ch('lifetime')],
      stations: [{ providerId: 'tvmaze', providerStationId: 'lifetime', name: 'Lifetime' }],
      airings: [
        { providerId: 'tvmaze', stationProviderId: 'lifetime', startAtUtcMs: NOW + 1 * HOUR },
        { providerId: 'tvmaze', stationProviderId: 'lifetime', startAtUtcMs: NOW + 13 * HOUR },
        { providerId: 'tvmaze', stationProviderId: 'lifetime', startAtUtcMs: NOW + 40 * HOUR },
        { providerId: 'tvmaze', stationProviderId: 'lifetime', startAtUtcMs: NOW + 100 * HOUR }, // beyond 48h
      ],
    }));
    const r = m.rows[0]!;
    expect(r.airings12h).toBe(1);
    expect(r.airings24h).toBe(2);
    expect(r.airings48h).toBe(3);
    expect(r.airings12h).toBeLessThanOrEqual(r.airings24h);
    expect(r.airings24h).toBeLessThanOrEqual(r.airings48h);
    expect(r.nextAiringUtcMs).toBe(NOW + 1 * HOUR);
  });

  it('is total: every configured channel yields exactly one row and counts sum to the total', () => {
    const configured = [ch('a'), ch('b', 'tv_media'), ch('c')];
    const m = buildCoverageMatrix(input({ configured }));
    const configuredRows = m.rows.filter((r) => r.group !== 'unmapped');
    expect(configuredRows).toHaveLength(3);
    const s = m.summary;
    expect(s.healthy + s.sourceEmpty + s.noSource + s.stale + s.ingestFailed + s.ingestDisabled).toBe(3);
    expect(s.totalConfigured).toBe(3);
  });
});
