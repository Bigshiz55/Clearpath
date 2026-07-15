import { describe, it, expect } from 'vitest';
import { buildPanel } from './swarm';
import type { VerdictReport } from './types';

function report(over: {
  genres: string[];
  runtimeMinutes?: number | null;
  seasons?: number | null;
  mediaType?: 'movie' | 'tv';
  breakdown?: Partial<{ engagement: number; watchability: number; production: number; quality: number }>;
  sources?: { name: string; value: number | null; available: boolean }[];
}): VerdictReport {
  return {
    title: {
      genres: over.genres,
      runtimeMinutes: over.runtimeMinutes ?? null,
      episodeRuntimeMinutes: null,
      numberOfSeasons: over.seasons ?? null,
      mediaType: over.mediaType ?? 'movie',
    },
    general: {
      score: 70,
      breakdown: {
        engagement: over.breakdown?.engagement ?? 50,
        watchability: over.breakdown?.watchability ?? 50,
        production: over.breakdown?.production ?? 50,
        quality: over.breakdown?.quality ?? 50,
      },
      sources: (over.sources ?? []).map((s) => ({ name: s.name, value: s.value, raw: null, available: s.available })),
    },
    tier: 'Worth Watching',
  } as unknown as VerdictReport;
}

describe('The Critics’ Table (grounded panel)', () => {
  it('always seats exactly the four panelists', () => {
    const p = buildPanel(report({ genres: ['Drama'] }));
    expect(p.panelists.map((x) => x.key)).toEqual(['action', 'pacing', 'indie', 'visual']);
  });

  it('the Action Junkie loves a high-engagement thriller and passes on a slow drama', () => {
    const love = buildPanel(report({ genres: ['Thriller'], breakdown: { engagement: 75 } })).panelists[0]!;
    expect(love.stance).toBe('love');
    const pass = buildPanel(report({ genres: ['Romance'], breakdown: { engagement: 40 } })).panelists[0]!;
    expect(pass.stance).toBe('pass');
  });

  it('the Pacing Critic is wary of a 3-hour movie and warns on a 6-season show', () => {
    const long = buildPanel(report({ genres: ['Drama'], runtimeMinutes: 190, breakdown: { watchability: 40 } })).panelists[1]!;
    expect(long.stance).toBe('pass');
    expect(long.line).toContain('190');
    const show = buildPanel(report({ genres: ['Drama'], mediaType: 'tv', seasons: 6 })).panelists[1]!;
    expect(show.stance).toBe('pass');
    expect(show.line).toContain('6 seasons');
  });

  it('the Indie Snob sides with critics over the crowd, and every line cites a real number', () => {
    const p = buildPanel(
      report({
        genres: ['Drama'],
        sources: [
          { name: 'Rotten Tomatoes', value: 92, available: true },
          { name: 'TMDB Audience', value: 70, available: true },
        ],
      }),
    ).panelists[2]!;
    expect(p.stance).toBe('love');
    expect(p.line).toContain('92');
    expect(p.line).toContain('70');
  });

  it('tallies the room lean', () => {
    const p = buildPanel(report({ genres: ['Action'], breakdown: { engagement: 80, production: 80 } }));
    expect(p.lean.love + p.lean.mixed + p.lean.pass).toBe(4);
  });
});
