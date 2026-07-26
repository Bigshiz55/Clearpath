import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resolveProvider, tmdbProviderIds } from './providers';
import { DEFAULT_RESULT_LIMIT, MAX_RESULT_LIMIT } from '@/lib/finder';

/**
 * PHASE 6 — streaming, catalog and recommendation flows must NOT depend on the
 * live-TV schedule provider.
 *
 * This is an architectural test, not a mock: it reads the actual source and
 * fails if a catalog path ever imports the schedule layer. Without it, someone
 * could wire "What's on Netflix?" to the TV grid, and the whole product would
 * go dark the next time a listings provider had an outage.
 */

const ROOT = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Modules that serve streaming/catalog/recommendation requests. */
const CATALOG_MODULES = [
  'src/lib/finder.ts',
  'src/lib/scoring/general.ts',
  'src/lib/scoring/standardScore.ts',
  'src/lib/court/pool.ts',
  'src/app/api/finder/route.ts',
  'src/app/api/ask/route.ts',
];

/** Anything that reaches a TV schedule provider. */
const SCHEDULE_IMPORTS = [
  '@/lib/viewing/liveTv',
  '@/lib/viewing/registry',
  '@/lib/viewing/adapters/',
  '@/lib/gracenote',
  '@/lib/tvGrid',
];

describe('streaming and catalog flows are independent of the TV provider', () => {
  it('no catalog module imports a schedule provider', () => {
    const offenders: string[] = [];
    for (const rel of CATALOG_MODULES) {
      const path = join(process.cwd(), rel);
      let src: string;
      try { src = readFileSync(path, 'utf8'); } catch { continue; }
      for (const bad of SCHEDULE_IMPORTS) {
        if (src.includes(`from '${bad}`) || src.includes(`from "${bad}`)) {
          offenders.push(`${rel} imports ${bad}`);
        }
      }
    }
    expect(offenders, 'a catalog path must never depend on the TV grid').toEqual([]);
  });

  it('the provider registry is the ONLY place adapters are constructed', () => {
    const allowed = new Set([
      join(ROOT, 'lib/viewing/liveTv.ts'),
      join(ROOT, 'lib/viewing/registry.ts'),
    ]);
    const offenders: string[] = [];
    for (const f of walk(ROOT)) {
      // Harness and health pages legitimately introspect providers.
      if (f.includes('/dev/') || f.includes('/api/health/')) continue;
      if (f.includes('/lib/viewing/adapters/')) continue;
      if (allowed.has(f)) continue;
      const src = readFileSync(f, 'utf8');
      if (/new (TvMedia|SchedulesDirect|Tvmaze|MockSchedule)Adapter\s*\(/.test(src)) {
        offenders.push(f.replace(process.cwd() + '/', ''));
      }
    }
    expect(offenders, 'business logic must not name a provider').toEqual([]);
  });

  it('no module outside the viewing layer reads TV Media credentials', () => {
    const offenders: string[] = [];
    for (const f of walk(ROOT)) {
      if (f.includes('/lib/viewing/')) continue;
      if (f.includes('/api/health/')) continue;
      const src = readFileSync(f, 'utf8');
      if (src.includes('TVMEDIA_API_KEY') || src.includes('SCHEDULES_DIRECT_PASSWORD')) {
        offenders.push(f.replace(process.cwd() + '/', ''));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no provider credential is exposed under a NEXT_PUBLIC_ name', () => {
    for (const f of walk(ROOT)) {
      const src = readFileSync(f, 'utf8');
      expect(/NEXT_PUBLIC_[A-Z_]*(TVMEDIA|SCHEDULES_DIRECT)/.test(src), f).toBe(false);
    }
  });
});

describe('catalog result volume', () => {
  it('returns a browsable set by default, not an answer', () => {
    // 8 was the old default — an answer-shaped number for a browsing request.
    expect(DEFAULT_RESULT_LIMIT).toBeGreaterThanOrEqual(20);
    expect(DEFAULT_RESULT_LIMIT).toBeLessThanOrEqual(40);
    expect(MAX_RESULT_LIMIT).toBeGreaterThanOrEqual(DEFAULT_RESULT_LIMIT);
  });

  it('every provider named in the product brief resolves to a catalog id', () => {
    const named = [
      'Netflix', 'Prime Video', 'Hulu', 'Max', 'Disney+', 'Peacock',
      'Paramount+', 'Apple TV+', 'BritBox', 'Acorn TV', 'Hallmark+',
      'Starz', 'Showtime',
    ];
    for (const n of named) {
      const p = resolveProvider(n);
      expect(p, n).not.toBeNull();
      expect(p!.tmdbId, `${n} must map to a catalog id`).not.toBeNull();
    }
    expect(tmdbProviderIds(named).length).toBeGreaterThanOrEqual(12);
  });

  it('provider queries resolve from natural language, not exact strings', () => {
    const asks: [string, string][] = [
      ["what's on netflix tonight", 'Netflix'],
      ['show me thrillers on prime video', 'Prime Video'],
      ['what movies are on hbo max tonight', 'Max'],
      ['family movies on disney plus', 'Disney+'],
      ['what should I watch on britbox', 'BritBox'],
      ['new on paramount plus', 'Paramount+'],
    ];
    for (const [ask, want] of asks) {
      expect(resolveProvider(ask)?.name, ask).toBe(want);
    }
  });
});
