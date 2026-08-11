import { describe, it, expect } from 'vitest';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { POSTER_PATHS, UNRESOLVED, posterCoverage, posterFor } from './poster';

/**
 * THE POSTER MAPPING IS EVIDENCE, NOT DECORATION.
 *
 * The point of these is that coverage cannot drift silently. A title is
 * allowed to have no artwork — the typographic tile is a designed state — but
 * only DELIBERATELY, by appearing in `UNRESOLVED` with a reason. That is what
 * stops "nobody got round to it" hiding behind "it has a fallback".
 */

describe('every diagnostic title is resolved or explained', () => {
  it('accounts for all of them', () => {
    const unexplained = TITLES.filter((t) => !POSTER_PATHS[t.id] && !UNRESOLVED[t.id]).map((t) => t.id);
    const { resolved, total } = posterCoverage();
    // eslint-disable-next-line no-console
    console.log(`[showdown] poster coverage: ${resolved}/${total}`);
    expect(
      unexplained,
      `these titles have neither a verified poster path nor a documented reason: ${unexplained.join(', ')}`,
    ).toEqual([]);
  });
});

describe('a path, once claimed, must be usable', () => {
  it('every claimed path has TMDB shape and resolves to a URL', () => {
    for (const [id, path] of Object.entries(POSTER_PATHS)) {
      expect(path, `${id} has a malformed poster path`).toMatch(/^\/[\w.-]+\.(jpg|png|webp)$/i);
      expect(posterFor(id).url, `${id} claims a path but produced no URL`).toBeTruthy();
    }
  });

  it('claims no path for a title that is not in the catalogue', () => {
    const ids = new Set(TITLES.map((t) => t.id));
    for (const id of Object.keys(POSTER_PATHS)) {
      expect(ids.has(id), `${id} has artwork but is not a diagnostic title`).toBe(true);
    }
  });
});

describe('the fallback is a real state, not a crash', () => {
  it('reports a reason rather than throwing when there is no art', () => {
    const art = posterFor('definitely-not-a-title');
    expect(art.url).toBeNull();
    expect(art.reason, 'a missing poster gave no explanation').toBeTruthy();
  });

  it('never returns a half-built URL', () => {
    for (const t of TITLES) {
      const art = posterFor(t.id);
      if (art.url !== null) expect(art.url).toMatch(/^https:\/\//);
    }
  });
});
