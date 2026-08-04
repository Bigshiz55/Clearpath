import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

/**
 * RELIABILITY SPRINT — item 5, TV date/time: "one authoritative local-time
 * utility." TvDetective, MyReminders, EasyOnTv and the Pack premiere list
 * each reimplemented their own `new Date(iso).toLocaleTimeString(...)` clock
 * formatter instead of calling `clock.ts`'s `airingClock` — the one place
 * that already documents (and is tested against) the real bug this class of
 * code hit: formatting from a pre-formatted network-local string instead of
 * the real UTC instant. Consolidating means a future fix to that logic only
 * has to land once.
 */
describe('every airing-time label is formatted via clock.ts, not a re-implemented toLocaleTimeString', () => {
  const sites = [
    'src/components/TvDetective.tsx',
    'src/components/MyReminders.tsx',
    'src/components/EasyOnTv.tsx',
    'src/components/packs/PremiereListOrCalendar.tsx',
  ];

  it.each(sites)('%s imports and uses airingClock from viewing/clock', (path) => {
    const src = read(path);
    expect(src).toMatch(/import\s*\{[^}]*airingClock[^}]*\}\s*from\s*'@\/lib\/viewing\/clock'/);
    expect(src).toContain('airingClock(');
  });

  it.each(sites)('%s no longer hand-rolls its own toLocaleTimeString formatter', (path) => {
    const src = read(path);
    expect(src).not.toMatch(/new Date\([^)]*\)\.toLocaleTimeString/);
  });
});

describe('the premiere-calendar month fallback uses the viewer\'s local day, not toISOString\'s UTC day', () => {
  const src = read('src/components/packs/PremiereListOrCalendar.tsx');

  it('imports localIsoDate from the shared local-day module', () => {
    expect(src).toMatch(/import\s*\{[^}]*localIsoDate[^}]*\}\s*from\s*'@\/lib\/viewing\/localDay'/);
  });

  it('the empty-list month-anchor fallback calls localIsoDate(), not new Date().toISOString()', () => {
    expect(src).toMatch(/monthAnchor = sortedDates\[0\] \?\? localIsoDate\(\)/);
    expect(src).not.toMatch(/monthAnchor[\s\S]{0,40}toISOString/);
  });
});

describe('getPackPreview picks "next premiere" by the real airing instant, not calendar-day order alone', () => {
  const src = read('src/lib/packs/packs.ts');

  it('filters to premieres whose start_at_utc instant is still in the future', () => {
    expect(src).toMatch(/Date\.parse\(p\.startAtUtc\) >= Date\.now\(\)/);
  });

  it('sorts the remaining candidates by the real instant before picking the soonest', () => {
    expect(src).toMatch(/\.sort\(\(a, b\) => Date\.parse\(a\.startAtUtc\) - Date\.parse\(b\.startAtUtc\)\)/);
  });
});
