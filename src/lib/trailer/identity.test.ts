import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * WRONG-TRAILER SAFETY (P0). The whole trailer experience rests on ONE rule:
 * a trailer is resolved by the title's own TMDB id, never by a text/YouTube
 * search. That makes same-name/reboot cross-contamination (The Thing 1982 vs
 * The Thing 2011 — distinct TMDB ids) impossible by construction. These tests
 * fail if a future change reintroduces text-search resolution or breaks the
 * id-keyed fetch. Wrong trailer is worse than no trailer; when uncertain, poster
 * wins (the resolver returns null → the card stays on its poster).
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

describe('trailers resolve by title identity, never by text search', () => {
  it('the API route keys resolution on the TMDB [type]/[id], not a query string', () => {
    const src = read('src/app/api/trailer/[type]/[id]/route.ts');
    // Resolves the title's OWN videos by numeric id.
    expect(src).toMatch(/getTitleVideos\(\s*mediaType\s*,\s*id\s*\)/);
    expect(src).toMatch(/Number\(params\.id\)/);
    // Never performs a YouTube/web text search as trailer resolution.
    expect(src).not.toMatch(/youtube\.com\/results|googleapis|searchVideos/i);
  });

  it('the resolver is pure — it ranks SUPPLIED videos, it never fetches', () => {
    const src = read('src/lib/trailer/resolve.ts');
    expect(src).not.toMatch(/fetch\(/); // no network — videos are passed in
    // It only accepts a title's own YouTube-hosted videos; it does not query.
    expect(src).toMatch(/site\s*!==\s*'YouTube'/);
    expect(src).not.toMatch(/youtube\.com\/results|googleapis|searchVideos/i);
  });

  it('the card fetches the resolver by media type + numeric id', () => {
    const src = read('src/components/trailer/TrailerMedia.tsx');
    expect(src).toMatch(/\/api\/trailer\/\$\{mediaType\}\/\$\{tmdbId\}/);
    // The id comes from the resolved title prop, not any title-name string.
    expect(src).not.toMatch(/\/api\/trailer\/\$\{title\}/);
  });
});
