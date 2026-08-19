import type { CanonicalIntent } from '@/lib/interpret/types';

/**
 * ONE OWNER PER SPAN — the legacy title extractor may not re-bind words the
 * canonical interpreter has already given a different job.
 *
 * THE DEFECT THIS EXISTS TO FIX (found by the deployed harness, not by a unit
 * test). "another boxing movie" returned nothing at all. The interpretation was
 * never wrong: `interpret()` read it as a `recommendation`, media `movie`,
 * required subject `boxing`. But `/api/ask`'s named-title arm does not consult
 * that reading unless it says `lookup`; otherwise it falls back to
 * `looksLikeTitleAsk` + `classifySearch`, a SECOND independent reader of the
 * same sentence. That reader strips the media noun and produces the phantom
 * title "another boxing", and the request is handed to the title machinery,
 * which searches the catalog for a film by that name. Discovery never runs.
 *
 * WHY THIS IS NOT ABOUT BOXING. Any `<determiner> <subject> <media-noun>` ask
 * takes the same wrong door — "a chess movie", "another western", "two space
 * movies". "movies about chess" survives today only because the catalog happens
 * to contain nothing near the phantom string; that is luck, not a design.
 * `ownership.test.ts` already states the rule this restores: on the canonical
 * path, semantics `CanonicalIntent` owns may not be re-derived from the raw
 * utterance.
 *
 * THE RULE. If every content word of the span the legacy extractor wants to
 * look up has ALREADY been bound by the canonical reading to a non-title role —
 * a subject, a genre, a tone, a person, a provider — then the sentence named no
 * title and the title arm must not run. Structural words (determiners, numbers,
 * media nouns, the handful of prepositions that join them) carry no identity
 * and are ignored on both sides.
 *
 * A canonical TITLE span is deliberately NOT a claim: "Show me The Lego Movie"
 * and a bare "Severance" must still reach the title machinery. This only ever
 * removes a lookup the canonical layer has positively contradicted.
 *
 * PURE. No I/O.
 */

/** Words that carry no identity — present in almost any phrasing of a request. */
const STRUCTURAL = new Set([
  // determiners / quantifiers
  'a', 'an', 'the', 'another', 'some', 'any', 'more', 'other', 'others', 'else',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'couple', 'few', 'several', 'lot', 'lots', 'bunch',
  // media nouns — the thing being asked for, never the thing's name
  'movie', 'movies', 'film', 'films', 'show', 'shows', 'series', 'tv',
  'television', 'documentary', 'documentaries', 'doc', 'docs', 'flick', 'flicks',
  'miniseries', 'episode', 'episodes', 'season', 'seasons', 'title', 'titles',
  // joiners that appear between a determiner, a subject and a medium
  'about', 'on', 'of', 'with', 'for', 'in', 'to', 'that', 'which', 'and', 'or',
]);

const words = (s: string): string[] =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Light stem so "comedies"/"comedy" and "movies"/"movie" compare equal. */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && (w.endsWith('es') || w.endsWith('s'))) return w.replace(/e?s$/, '');
  return w;
}

const contentWords = (s: string): string[] =>
  words(s).filter((w) => !STRUCTURAL.has(w) && !STRUCTURAL.has(stem(w))).map(stem);

/**
 * Every word the canonical reading has already bound to a NON-title role.
 * Title spans are excluded on purpose — see the header.
 */
export function canonicalClaimedWords(intent: CanonicalIntent): Set<string> {
  const claimed = new Set<string>();
  const add = (span: string) => contentWords(span).forEach((w) => claimed.add(w));
  intent.subjects.forEach((s) => add(s.span));
  intent.genres.forEach((g) => add(g.span));
  intent.tones.forEach((t) => add(t.term));
  intent.people.forEach((p) => add(p.span));
  intent.providers.forEach(add);
  return claimed;
}

/**
 * Has the canonical reading already accounted for every identity-bearing word
 * of `span`? True means the sentence named no title and the title arm must not
 * run on it.
 */
export function canonicalClaimsSpan(intent: CanonicalIntent | null, span: string | null): boolean {
  if (intent === null || span === null) return false;
  const content = contentWords(span);
  /* Nothing but structure — "another", "a movie". There is no name here to look
     up, whatever the extractor produced. */
  if (content.length === 0) return true;
  const claimed = canonicalClaimedWords(intent);
  if (claimed.size === 0) return false;
  return content.every((w) => claimed.has(w));
}
