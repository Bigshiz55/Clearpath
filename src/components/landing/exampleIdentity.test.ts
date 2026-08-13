/**
 * THE LANDING EXAMPLE HAS A FIXED IDENTITY, NOT A SEARCH RESULT.
 *
 * The first version of this section resolved its title by running
 * `searchTitles('The Godfather')` and taking the first result whose title
 * contained "godfather". That is the popularity/search-order defect class in
 * miniature: the landing page's identity became a function of TMDB's ranking
 * and of a substring match, so "The Godfather Part III", a re-release entry or
 * a documentary about the film could all satisfy it, and which one won could
 * change between two requests with nothing here changing.
 *
 * The example is one canonical entity — TMDB movie 238 — loaded by id through
 * the same `getScoringData` path every other surface uses. This test is the
 * guard, and it is source-level on purpose: `loadExample` needs a TMDB key and
 * a network, so a runtime assertion would either be skipped or would prove the
 * fixture rather than the code.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'ExampleVerdict.tsx'), 'utf8');

/** The file with its comments removed. The doc comment explains the defect
 *  being guarded against and therefore names `searchTitles` on purpose — an
 *  assertion about what the code DOES must not read the prose about it. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the landing example identity', () => {
  it('is the canonical entity movie:238, declared as constants', () => {
    expect(CODE).toMatch(/const EXAMPLE_MEDIA_TYPE: MediaType = 'movie';/);
    expect(CODE).toMatch(/const EXAMPLE_TMDB_ID = 238;/);
  });

  it('loads that entity directly through the shared scoring path', () => {
    expect(CODE).toContain('getScoringData(EXAMPLE_MEDIA_TYPE, EXAMPLE_TMDB_ID, region)');
    // And the card is handed the SAME identity it was scored on — not an id
    // carried over from some other lookup.
    expect(CODE).toContain('tmdbId: EXAMPLE_TMDB_ID');
    expect(CODE).toContain('mediaType: EXAMPLE_MEDIA_TYPE');
  });

  it('performs no title search to decide what the example is', () => {
    // The import is gone, the call is gone, and so is the substring match that
    // picked a winner out of the results.
    expect(CODE).not.toMatch(/searchTitles/);
    expect(CODE).not.toMatch(/EXAMPLE_QUERY/);
    expect(CODE).not.toMatch(/\.includes\('godfather'\)/i);
    expect(CODE).not.toMatch(/results\s*\.\s*find|\.find\(\(r\)/);
  });

  it('carries no courtroom or jury language', () => {
    // The brand entrance is "Enter WatchVerd1ct"; the courtroom ceremony is
    // reserved for the Live Jury / Verdict Room and never appears here.
    expect(SRC).not.toMatch(/courtroom|\bjury\b|gavel/i);
  });

  it('states the anonymous case in one line, and points at Taste DNA', () => {
    expect(SRC).toContain('The general Verd1ct. Build your Taste DNA and it becomes your Match.');
    expect(SRC).toContain('This is the generic verdict. Yours gets personal.');
  });
});
