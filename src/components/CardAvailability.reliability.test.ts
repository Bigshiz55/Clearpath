import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

/**
 * RELIABILITY SPRINT — "Watch Now" item 3. A card must never claim an
 * availability check is actively in progress ("Checking availability…")
 * when, for most titles, no such check is ever queued (the Watchmode sync
 * job only advances ~50 titles/day from a fixed candidate pool — see
 * src/lib/watchmode/sync.ts). It must instead land on one of the honest
 * terminal states named in the spec.
 */
describe('CardAvailability never claims an active check that may never run', () => {
  it('no literal "Checking availability" text remains anywhere in the component', () => {
    const src = read('src/components/CardAvailability.tsx');
    expect(src).not.toMatch(/Checking availability/i);
  });

  it('the unresolved state uses the spec-honest wording and testid', () => {
    const src = read('src/components/CardAvailability.tsx');
    expect(src).toContain('Availability not currently confirmed');
    expect(src).toContain('data-testid="card-availability-unconfirmed"');
    expect(src).toContain("availability.status === 'unconfirmed'");
  });

  it('the confirmed-available labels use spec-honest wording backed by real data', () => {
    const src = read('src/components/CardAvailability.tsx');
    expect(src).toContain('Available by subscription');
  });
});

describe('getCardAvailability/cardAvailability status vocabulary is honest end to end', () => {
  it('the shared type no longer exposes a "checking" status anywhere', () => {
    const src = read('src/lib/watchmode/cardAvailability.ts');
    expect(src).not.toContain("'checking'");
    expect(src).toContain("'unconfirmed'");
  });

  it('every EMPTY_AVAILABILITY fallback (client cache, API route) uses the renamed status', () => {
    for (const f of ['src/lib/tileFacts.ts', 'src/app/api/ratings/[type]/[id]/route.ts']) {
      const src = read(f);
      expect(src, f).not.toContain("status: 'checking'");
      expect(src, f).toContain("status: 'unconfirmed'");
    }
  });
});

describe('Watch Now default tab never renders silently blank', () => {
  it('an explicit fallback exists for when ready/recs/more are all empty', () => {
    const src = read('src/app/app/watch/page.tsx');
    expect(src).toContain('readyIsEmpty');
    expect(src).toContain('data-testid="watch-now-empty"');
    expect(src).toMatch(/Try again/);
  });

  it('the fallback is computed from all three real data sources, not just one', () => {
    const src = read('src/app/app/watch/page.tsx');
    const at = src.indexOf('const readyIsEmpty');
    const line = src.slice(at, src.indexOf('\n', at));
    expect(line).toContain('rankedReady.items.length === 0');
    expect(line).toContain('recs.length === 0');
    expect(line).toContain('rankedMore');
  });
});
