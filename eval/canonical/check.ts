import type { CanonicalIntent } from '@/lib/interpret/types';

/**
 * THE CERTIFICATION PREDICATE, extracted so it can be aimed at something other
 * than the real interpreter.
 *
 * A suite that only ever runs the CORRECT implementation cannot tell you it
 * would notice an incorrect one. Keeping the check as a pure function of
 * (intent, expectation) lets the integrity suite feed it a deliberately
 * sabotaged intent and prove the failures appear.
 *
 * Returns the list of violated expectations — empty means the intent satisfies
 * the frozen case.
 */
export interface FrozenCase {
  id: string;
  rawQuery: string;
  archetype: string;
  canonical?: Record<string, unknown>;
}

export function violations(intent: CanonicalIntent, canonical: Record<string, unknown> = {}): string[] {
  const out: string[] = [];
  const has = (k: string) => Object.prototype.hasOwnProperty.call(canonical, k);
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  if (has('media') && intent.media !== canonical['media']) out.push(`media=${intent.media}`);
  if (has('requestedCount') && intent.requestedCount !== canonical['requestedCount']) {
    out.push(`requestedCount=${intent.requestedCount}`);
  }
  if (has('requestedCountNull') && intent.requestedCount !== null) out.push('requestedCount not null');
  if (has('lookback') && !eq(intent.date.lookback, canonical['lookback'])) out.push('lookback');
  if (has('lookbackUnit') && intent.date.lookback?.unit !== canonical['lookbackUnit']) out.push('lookback unit');
  if (has('lookbackDirection') && intent.date.lookback?.direction !== canonical['lookbackDirection']) {
    out.push('lookback direction');
  }
  if (has('lookbackAbsent') && intent.date.lookback !== undefined) out.push('lookback present');
  if (has('minYearAbsent') && intent.date.minYear !== undefined) out.push('minYear computed in interpreter');
  if (has('providerContains') && !intent.providers.join('|').toLowerCase().includes(String(canonical['providerContains']))) {
    out.push('providers');
  }
  if (has('personContains') && !intent.people.map((p) => p.span).join('|').includes(String(canonical['personContains']))) {
    out.push('people');
  }
  if (has('personNeverContains')) {
    const bad = String(canonical['personNeverContains']).toLowerCase();
    if (intent.people.some((p) => p.span.toLowerCase().includes(bad))) out.push('request verb in person span');
  }
  if (has('notRecommendation') && intent.kind === 'recommendation') out.push('title read as a request');
  if (has('noPeople') && intent.people.length > 0) out.push('person named');
  if (has('personRelation') && intent.people[0]?.relation !== canonical['personRelation']) {
    out.push(`personRelation=${intent.people[0]?.relation}`);
  }
  if (has('personRole') && intent.people[0]?.role !== canonical['personRole']) {
    out.push(`personRole=${intent.people[0]?.role}`);
  }
  /* ADVERSARIAL-REVIEW KEYS. Each one pins an occurrence-ownership leak that
     was found by attacking the branch, not by reading it. */
  if (has('genreNeverContains')) {
    const bad = String(canonical['genreNeverContains']).toLowerCase();
    if (intent.genres.some((g) => g.span.toLowerCase() === bad)) out.push(`genre "${bad}" invented`);
  }
  if (has('genreContains') && !intent.genres.some((g) => g.span.toLowerCase() === String(canonical['genreContains']))) {
    out.push('genre missing');
  }
  if (has('subjectsEmpty') && intent.subjects.length > 0) {
    out.push(`stray subjects: ${intent.subjects.map((x) => x.span).join(',')}`);
  }
  if (has('maxYear') && intent.date.maxYear !== canonical['maxYear']) out.push(`maxYear=${intent.date.maxYear}`);
  return out;
}
