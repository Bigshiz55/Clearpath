import type { FinderQuery } from '@/lib/finder';
import { EMPTY_QUERY } from '@/lib/finderParse';

/**
 * THE DETERMINISTIC FLOOR — AI MAY ADD, IT MAY NEVER SUBTRACT.
 *
 * The invariant this module exists to guarantee:
 *
 *   AI may enhance interpretation, but failure or absence of AI must never
 *   erase deterministic understanding the system already possesses.
 *
 * The ask path used to be an EITHER/OR:
 *
 *     const ai = await parseAskWithAI(text);
 *     if (ai) { query = ai.query; }          // AI replaces everything
 *     else    { query = naiveParseQuery(text); }
 *
 * Two independent ways for a stated constraint to vanish:
 *
 *   1. AI SUCCEEDS PARTIALLY. `ai.query` is a WHOLE query object with `null`
 *      in every field the model didn't fill, so assigning it wholesale threw
 *      away every constraint the deterministic parser had already extracted.
 *      A working API key made this MORE likely, not less — the failure needs
 *      no outage at all.
 *   2. AI IS ABSENT. `parseAskWithAI` funnels six distinct outcomes — no key,
 *      text too short, non-200, empty content, unparseable JSON, timeout —
 *      into one `null`, and the fallback branch only ran when the caller had
 *      supplied no structured query of its own. The client always supplies
 *      one, so on that path the deterministic parse never ran server-side.
 *
 * Both are the same bug: a value that was KNOWN was replaced by one that was
 * not. So the merge is expressed once, here, and the routes use it.
 *
 * ── The rule, by field SHAPE — never by vocabulary ────────────────────────
 *
 * There is deliberately no mention of runtime, years, genres, boxing, baseball
 * or any other subject in this file. It reads `EMPTY_QUERY` for the field set
 * and decides from the SHAPE of each value, so a constraint added to
 * `FinderQuery` tomorrow is covered the day it exists:
 *
 *   • NUMERIC BOUNDS (`number | null`) — an explicit threshold the user typed
 *     in their own words. Deterministic WINS outright, including over a
 *     conflicting AI value. "Under 100 minutes" is not a hint to be
 *     reinterpreted; it is the request. This is the only case where the floor
 *     overrides rather than fills, and it is the case the user stated most
 *     literally.
 *   • SETS (`T[]`) — semantic breadth, where a model genuinely reads better
 *     than a regex ("cozy mystery" → mystery). AI's set is kept when it has
 *     one; the deterministic set fills an EMPTY one. Never intersected: that
 *     would let AI narrow what the user said.
 *   • ENUMS / everything else — filled only when the merged value is still the
 *     neutral default, so an explicit "movie" survives an AI that said nothing,
 *     and an AI that genuinely resolved a field is left alone.
 *
 * `null`, `[]` and the value in `EMPTY_QUERY` all count as "said nothing".
 * That is what makes this safe to apply unconditionally: on a query where the
 * deterministic parser found nothing, it is the identity function.
 */

/** Fields whose neutral state is the value `EMPTY_QUERY` carries. */
const NEUTRAL = EMPTY_QUERY as unknown as Record<string, unknown>;

function saidNothing(key: string, value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return value === NEUTRAL[key];
}

/**
 * Apply the deterministic parse as a floor under an already-merged query.
 *
 * @param merged        the query as the caller built it — supplied UI state
 *                      with any AI enhancement already layered on top.
 * @param deterministic the parse of the user's own text, or null when there
 *                      was no text to parse (then this is the identity).
 */
export function applyDeterministicFloor(
  merged: FinderQuery,
  deterministic: FinderQuery | null,
): FinderQuery {
  if (!deterministic) return merged;

  const out = { ...merged } as unknown as Record<string, unknown>;
  const det = deterministic as unknown as Record<string, unknown>;

  for (const key of Object.keys(NEUTRAL)) {
    const detVal = det[key];
    // The deterministic parser had no opinion — nothing to protect.
    if (saidNothing(key, detVal)) continue;

    // A NUMERIC BOUND THE USER TYPED OUTRANKS AN INFERRED ONE.
    if (typeof detVal === 'number') {
      out[key] = detVal;
      continue;
    }

    // Sets and everything else: fill a gap, never overwrite a real answer.
    if (saidNothing(key, out[key])) out[key] = detVal;
  }

  return out as unknown as FinderQuery;
}

/**
 * Layer an AI query over a base WITHOUT letting its unfilled fields erase
 * anything. `parseAskWithAI` returns a complete `FinderQuery`, so a plain
 * spread writes `null` over every field the model left alone — which is the
 * partial-output half of the defect above.
 */
export function overlayAi(base: FinderQuery, ai: FinderQuery | null): FinderQuery {
  if (!ai) return base;
  const out = { ...base } as unknown as Record<string, unknown>;
  const src = ai as unknown as Record<string, unknown>;
  for (const key of Object.keys(NEUTRAL)) {
    if (!saidNothing(key, src[key])) out[key] = src[key];
  }
  return out as unknown as FinderQuery;
}
