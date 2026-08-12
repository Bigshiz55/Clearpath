/**
 * ONE ANSWER TO "WHICH PACK IS THIS?"
 *
 * THE DEFECT THIS EXISTS TO END. `eligibility.ts` shipped with its own
 * hand-written slug table:
 *
 *   'lifetime-movie-vault': 'movie-vault'
 *   'lifetime':             'movie-vault'
 *   'hallmark':             'seasonal-movies'
 *   'true-crime':           'crime-cases'
 *
 * Four of those six slugs do not exist. The real production slugs are
 * `lifetime-vault`, `hallmark-universe` and `crime-case-files`, and they were
 * already declared as a TYPED UNION in `packChannelMap.ts` — `PackSlug` — which
 * the ingest path has used correctly all along. Writing a second, untyped table
 * beside it meant the real Lifetime pack matched nothing, fell through to the
 * `open` shape, and kept showing Castle, The Rookie, Joyce Meyer and Dr. Pimple
 * Popper while the tests passed against slugs nobody uses.
 *
 * The lesson is not "be more careful with strings". It is that the union
 * existed and a `Record<string, …>` silently opted out of it. So the shape
 * table below is `Record<PackSlug, PackShape>`: adding a Pack without deciding
 * its editorial shape is now a compile error, and a slug that is not a real
 * Pack cannot be written at all.
 *
 * ALIASES RESOLVE, THEY DO NOT DUPLICATE. Historical and human-typed forms map
 * to the canonical slug, so the diagnostic, the runtime page and any tooling
 * ask the same question and get the same answer.
 *
 * PURE DATA. No I/O.
 */

import type { PackSlug } from './packChannelMap';

/**
 * What a Pack is editorially FOR.
 *
 * `open` is deliberately NOT a member of the canonical table — every real Pack
 * must state its shape. It exists only as the answer for a slug that is not a
 * known Pack at all, which is a different thing from a Pack that has no
 * editorial claim.
 */
export type PackShape = 'movie-vault' | 'crime-cases' | 'seasonal-movies' | 'open';

/**
 * THE CANONICAL TABLE. Exhaustive over `PackSlug` by type, so a new Pack cannot
 * be added without answering "what is this for?".
 */
const SHAPE_BY_SLUG: Record<PackSlug, PackShape> = {
  'lifetime-vault': 'movie-vault',
  'crime-case-files': 'crime-cases',
  'hallmark-universe': 'seasonal-movies',
};

export const CANONICAL_PACK_SLUGS: readonly PackSlug[] = Object.keys(SHAPE_BY_SLUG) as PackSlug[];

/**
 * Forms that mean a canonical Pack but are not the production slug.
 *
 * DELIBERATELY SHORT. Every entry is a real form somebody has written — a URL
 * that shipped, a slug an earlier build used, or the name a person types. It is
 * not a place to pre-emptively accept plausible variants: an alias that nothing
 * produces is an alias nobody maintains, and each one widens the surface on
 * which a WRONG pack could be resolved to Movie Vault rules.
 */
const ALIASES: Readonly<Record<string, PackSlug>> = {
  // The slug `eligibility.ts` invented, and which its own tests asserted.
  'lifetime-movie-vault': 'lifetime-vault',
  'hallmark': 'hallmark-universe',
  'true-crime': 'crime-case-files',
  'crime-cases': 'crime-case-files',
};

/**
 * Resolve any form to the canonical Pack slug, or null.
 *
 * NULL IS A REAL ANSWER, and callers must treat it as "not a known Pack" rather
 * than as a default. Silently inheriting Movie Vault rules is exactly how a
 * general channel would start hiding its own programming.
 */
export function canonicalPackSlug(input: string | null | undefined): PackSlug | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if ((CANONICAL_PACK_SLUGS as readonly string[]).includes(s)) return s as PackSlug;
  return ALIASES[s] ?? null;
}

/**
 * The editorial shape for a slug in any form.
 *
 * An unknown Pack gets `open` — it has made no editorial claim, so filtering it
 * would be inventing one. A KNOWN Pack always gets its declared shape.
 */
export function shapeForPack(input: string | null | undefined): PackShape {
  const slug = canonicalPackSlug(input);
  return slug ? SHAPE_BY_SLUG[slug] : 'open';
}

/** True when this Pack promises a film library rather than a channel schedule. */
export function isMovieVault(input: string | null | undefined): boolean {
  return shapeForPack(input) === 'movie-vault';
}
