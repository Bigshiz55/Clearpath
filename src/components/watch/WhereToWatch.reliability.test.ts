import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * RELIABILITY SPRINT — "Watch Now" item 3. A card must never claim an
 * availability check is actively in progress ("Checking availability…")
 * when, for most titles, no such check is ever queued (the Watchmode sync
 * job only advances ~50 titles/day from a fixed candidate pool — see
 * src/lib/watchmode/sync.ts). It must instead land on one of the honest
 * terminal states named in the spec.
 */
describe('a card never claims an active check that may never run', () => {
  const ui = read('src/components/watch/WhereToWatch.tsx');
  const lib = read('src/lib/availability/watchPresentation.ts');

  it('no literal "Checking availability" text remains anywhere in the where-to-watch path', () => {
    // For most titles no check is ever queued — the Watchmode sync job only
    // advances ~50 titles/day from a fixed pool (src/lib/watchmode/sync.ts) —
    // so "Checking…" would be an in-progress claim about work that will never
    // start. The honest terminal states below replaced it.
    expect(ui).not.toMatch(/Checking availability/i);
    expect(lib).not.toMatch(/Checking availability/i);
  });

  it('the unresolved state says we have not confirmed it, and offers a real next step', () => {
    // Wording tightened from "Availability not currently confirmed" to a
    // first-person sentence that cannot be misread as a status label on the
    // title itself, plus a CTA that does not pretend to be a watch link.
    expect(lib).toContain('We haven’t confirmed where this is currently available.');
    expect(lib).toContain("'check_availability'");
    expect(ui).toContain('data-testid="where-to-watch-note"');
  });

  it('"never checked" and "checked, found nothing" stay distinct states', () => {
    expect(lib).toContain('We checked and found no current way to watch this.');
    expect(lib).toMatch(/status: unknown \? 'unknown' : 'none'|unknown \? 'unknown' : 'none'/);
  });

  it('confirmed availability is labelled by the real state, never a generic "stream"', () => {
    expect(lib).toContain('Included with ${s}');
    expect(lib).toContain('Free with ads on ${s}');
    expect(lib).toContain('— rent');
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
