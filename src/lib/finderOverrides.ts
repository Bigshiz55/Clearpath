/**
 * HAND-SET CONTROLS BEAT THE RE-PARSE.
 *
 * The Finder sends two things on every run: the user's sentence, and the state
 * of the controls. The server prefers the sentence, because an LLM reads
 * "out in the last 24 months, match 80+" far better than a regex does.
 *
 * That is right on the first run and wrong on every one after it. The sentence
 * does not change when someone drags a slider, so re-parsing it hands back the
 * same constraints, the search returns the same titles, and the control looks
 * broken — because it is being discarded.
 *
 * The fix is not "trust the client" (that would throw away the good parse) and
 * not "trust the sentence" (that is the bug). It is to track which fields the
 * person has touched BY HAND since they typed that sentence, and let exactly
 * those win. Everything else still comes from the parse.
 *
 * Pure. No I/O.
 */
import type { FinderQuery } from '@/lib/finder';

/** Only real query fields can be overridden — never arbitrary keys off the wire. */
export function sanitizeOverrides(raw: unknown, shape: FinderQuery): string[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(Object.keys(shape));
  const out: string[] = [];
  for (const k of raw) {
    if (typeof k !== 'string') continue;
    if (!allowed.has(k)) continue;
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

/**
 * Copy the named fields from the client's query on top of the parsed one.
 *
 * Returns a NEW object — the caller's inputs are untouched, so a failed merge
 * can never half-apply. Fields absent from `overrides` keep the parsed value,
 * including when the client's value is null: "I set this back to Any" is a
 * deliberate choice and must survive too.
 */
export function applyOverrides(
  parsed: FinderQuery,
  client: FinderQuery,
  overrides: readonly string[],
): FinderQuery {
  if (overrides.length === 0) return parsed;
  const out = { ...parsed } as unknown as Record<string, unknown>;
  const from = client as unknown as Record<string, unknown>;
  for (const key of overrides) {
    if (!Object.prototype.hasOwnProperty.call(from, key)) continue;
    out[key] = from[key];
  }
  return out as unknown as FinderQuery;
}
