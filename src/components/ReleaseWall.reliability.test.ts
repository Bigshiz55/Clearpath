import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

/**
 * RELIABILITY SPRINT — item 4, New Releases. Source-level on purpose: this
 * component fetches from a real API route on mount, so a rendered test would
 * need a live TMDB-backed server to prove anything about its failure paths.
 * These assertions pin the specific bugs the item-4 pass fixed so a future
 * edit can't silently reintroduce them.
 */
describe('ReleaseWall never mistakes a failed fetch for a confirmed-empty result', () => {
  const src = read('src/components/ReleaseWall.tsx');

  it('has a bounded fetch timeout — no unbounded wait on a hung request', () => {
    expect(src).toMatch(/FETCH_TIMEOUT_MS\s*=\s*20000/);
    expect(src).toMatch(/AbortController/);
    expect(src).toMatch(/setTimeout\(\(\) => controller\.abort\(\), FETCH_TIMEOUT_MS\)/);
  });

  it('never wipes the screen back to empty just because a refresh failed', () => {
    // The old bug: any catch/non-ok branch called setItems([]), discarding a
    // perfectly good previous result. Confirm that call no longer exists.
    expect(src).not.toMatch(/setItems\(\[\]\)/);
  });

  it('reads the degraded flag from the API response and tracks it in state', () => {
    expect(src).toContain('data.degraded');
    expect(src).toContain('setDegraded');
  });

  it('surfaces a distinct banner (with its own retry) when a real error leaves stale-but-shown results', () => {
    expect(src).toContain('data-testid="releases-stale-banner"');
    expect(src).toContain('data-testid="releases-degraded-banner"');
  });

  it('shows a last-updated indicator sourced from the server timestamp, not a fabricated one', () => {
    expect(src).toContain('data.updatedAt');
    expect(src).toContain('data-testid="releases-updated"');
    expect(src).toContain('agoLabel');
  });

  it('wires the diagnostics module\'s retry flag into a real retry button in the empty state', () => {
    expect(src).toContain('es.retry');
    expect(src).toContain('data-testid="releases-empty-retry"');
  });

  it('the empty-state diagnostics call passes through the errored flag, not just the item count', () => {
    expect(src).toMatch(/releasesEmptyState\(\{[^}]*errored[^}]*\}\)/);
  });

  it('the Retry button re-runs the memoized load() closure directly rather than reloading the page', () => {
    expect(src).toMatch(/onClick=\{\(\) => void load\(\)\}/);
  });
});

describe('servicesFeed.getReleases distinguishes "could not check" from "checked, found nothing"', () => {
  const src = read('src/lib/servicesFeed.ts');

  it('uses the checked (non-fail-open) discover call so a real TMDB failure is never silently dropped', () => {
    expect(src).toContain('discoverTitlesChecked');
    expect(src).not.toMatch(/discoverTitles\([^)]*\)\.catch\(\(\) => \[\]\)/);
  });

  it('computes and returns a degraded flag alongside items', () => {
    expect(src).toMatch(/degraded\s*=\s*checkedPools\.some/);
    expect(src).toMatch(/return \{ items: withNetwork, degraded \};/);
  });
});

describe('the releases API route forwards degraded + a real updatedAt timestamp', () => {
  const src = read('src/app/api/releases/route.ts');

  it('destructures degraded from getReleases and includes it in the JSON response', () => {
    expect(src).toMatch(/const \{ items, degraded \} = await getReleases/);
    expect(src).toContain('degraded,');
  });

  it('stamps a real server-generated updatedAt rather than letting the client guess', () => {
    expect(src).toContain('updatedAt: new Date().toISOString()');
  });
});
