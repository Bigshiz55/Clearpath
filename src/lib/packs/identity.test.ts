import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { canonicalPackSlug, shapeForPack, isMovieVault, CANONICAL_PACK_SLUGS } from './identity';
import { GROUP_TO_PACK } from './packChannelMap';

/**
 * THE BUG THIS FILE EXISTS TO MAKE IMPOSSIBLE.
 *
 * The real production Lifetime Pack has the slug `lifetime-vault`. The
 * eligibility layer shipped with its own hand-written table containing
 * `lifetime-movie-vault` and `lifetime` — neither of which is a real slug — in a
 * `Record<string, PackShape>` that silently opted out of the `PackSlug` union
 * the ingest path had been using correctly all along.
 *
 * The consequence was not a crash. `shapeForPack('lifetime-vault')` returned
 * `'open'`, the Pack fell through to "show everything the channels carry", and
 * the Vault kept listing Castle, The Rookie and Joyce Meyer — while the tests
 * passed, because they asserted against the invented slug.
 *
 * So these tests are about the four things that must be true at once, and one
 * of them is that the union and the table cannot drift apart again.
 */

describe('the real production slug resolves', () => {
  it('lifetime-vault IS the Lifetime Movie Vault', () => {
    // THE DEFECT, IN ONE ASSERTION. This returned 'open' in production.
    expect(canonicalPackSlug('lifetime-vault')).toBe('lifetime-vault');
    expect(shapeForPack('lifetime-vault')).toBe('movie-vault');
    expect(isMovieVault('lifetime-vault')).toBe(true);
  });

  it('the other two production slugs resolve to their own shapes', () => {
    expect(shapeForPack('crime-case-files')).toBe('crime-cases');
    expect(shapeForPack('hallmark-universe')).toBe('seasonal-movies');
  });
});

describe('historical aliases resolve to the SAME identity, not a second one', () => {
  it('lifetime-movie-vault — the slug eligibility.ts invented — resolves', () => {
    /* It has to keep working: it is in URLs, in the old diagnostic's default
       and in the previous tests. Resolving is not the same as duplicating —
       there is one shape table and this maps INTO it. */
    expect(canonicalPackSlug('lifetime-movie-vault')).toBe('lifetime-vault');
    expect(shapeForPack('lifetime-movie-vault')).toBe(shapeForPack('lifetime-vault'));
  });

  it('the Hallmark and crime aliases resolve too', () => {
    expect(canonicalPackSlug('hallmark')).toBe('hallmark-universe');
    expect(canonicalPackSlug('true-crime')).toBe('crime-case-files');
    expect(canonicalPackSlug('crime-cases')).toBe('crime-case-files');
  });

  it('is tolerant of case and surrounding whitespace, and nothing else', () => {
    expect(canonicalPackSlug('  Lifetime-Vault ')).toBe('lifetime-vault');
    expect(canonicalPackSlug('lifetime_vault')).toBeNull();
    expect(canonicalPackSlug('lifetime vault')).toBeNull();
  });
});

describe('UNRELATED Lifetime and general channels do NOT inherit Movie Vault rules', () => {
  it('bare "lifetime" is not the Vault', () => {
    /* `eligibility.ts` mapped bare 'lifetime' to 'movie-vault'. Lifetime the
       NETWORK is not the Lifetime Movie Vault the PACK, and a Pack that one day
       carries the network's general schedule must not silently acquire a film
       library's filter and hide its own programming. */
    expect(canonicalPackSlug('lifetime')).toBeNull();
    expect(isMovieVault('lifetime')).toBe(false);
  });

  it('nothing that merely CONTAINS a canonical slug resolves', () => {
    for (const near of [
      'lifetime-vault-2',
      'my-lifetime-vault',
      'lifetime-movies',
      'lmn',
      'lifetime-achievement-awards',
    ]) {
      expect(canonicalPackSlug(near), `"${near}" resolved`).toBeNull();
      expect(isMovieVault(near), `"${near}" got Movie Vault rules`).toBe(false);
    }
  });

  it('only ONE canonical slug is a movie vault', () => {
    const vaults = CANONICAL_PACK_SLUGS.filter((s) => isMovieVault(s));
    expect(vaults).toEqual(['lifetime-vault']);
  });
});

describe('unknown packs do not silently inherit anything', () => {
  it('an unknown slug is `open`, and `open` is not a filter', () => {
    /* `open` means "this Pack has made no editorial claim", which is different
       from "apply the strictest claim we have". A future Pack must not be
       filtered by rules nobody wrote for it. */
    expect(canonicalPackSlug('some-future-pack')).toBeNull();
    expect(shapeForPack('some-future-pack')).toBe('open');
    expect(isMovieVault('some-future-pack')).toBe(false);
  });

  it('empty, null and undefined are unknown rather than throwing', () => {
    for (const bad of ['', '   ', null, undefined]) {
      expect(canonicalPackSlug(bad)).toBeNull();
      expect(shapeForPack(bad)).toBe('open');
    }
  });
});

describe('there is exactly ONE resolver', () => {
  it('the shape table covers every slug the ingest map can produce', () => {
    /* The two halves that drifted. `GROUP_TO_PACK` is what ingest writes; the
       shape table is what the page reads. If ingest can create a Pack the shape
       table has never heard of, that Pack silently becomes `open` — which is
       exactly what happened. */
    for (const slug of Object.values(GROUP_TO_PACK)) {
      expect(CANONICAL_PACK_SLUGS, `${slug} is not in the shape table`).toContain(slug);
      expect(shapeForPack(slug), `${slug} falls through to open`).not.toBe('open');
    }
  });

  it('no other module keeps its own slug→shape table', () => {
    // A second table is how the first one drifted out of existence unnoticed.
    const eligibility = readFileSync('src/lib/packs/eligibility.ts', 'utf8');
    expect(eligibility).not.toContain('PACK_SHAPES');
    /* No slug LITERAL — prose may still say "the Lifetime Vault", but a quoted
       slug in this file means a second table has grown back. */
    for (const slug of [...CANONICAL_PACK_SLUGS, 'lifetime-movie-vault', 'true-crime']) {
      for (const quoted of [`'${slug}'`, `"${slug}"`]) {
        expect(eligibility.includes(quoted), `eligibility.ts names the slug ${quoted}`).toBe(false);
      }
    }
  });

  it('the runtime page and the admin diagnostic resolve through the same function', () => {
    /* THE STOP CONDITION. If these two disagree about which Pack a slug means,
       every measurement taken from the diagnostic describes a different Pack
       than the one users see. */
    const checklist = readFileSync('src/lib/packs/checklist.ts', 'utf8');
    const diagnostic = readFileSync('src/app/api/admin/packs/eligibility/route.ts', 'utf8');
    for (const [name, src] of [['checklist', checklist], ['diagnostic', diagnostic]] as const) {
      expect(src, `${name} does not import the canonical resolver`).toMatch(
        /from '(@\/lib\/packs\/identity|\.\/identity)'/,
      );
    }
    // And the diagnostic no longer defaults to a slug that does not exist.
    expect(diagnostic).not.toContain("?? 'lifetime-movie-vault'");
    expect(diagnostic).toContain("?? 'lifetime-vault'");
    expect(diagnostic).toContain('canonicalPackSlug');
  });
});
