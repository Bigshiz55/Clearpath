/**
 * Watch-DNA CALIBRATION planner (pure). The first-run flow is a *preference
 * discovery* engine, NOT a recommendation feed: it must deliberately sample the
 * widest possible range of entertainment so DNA learns both likes AND dislikes,
 * and it must be FINITE. This module turns a pool of tagged candidates into a
 * capped, balanced, ordered plan.
 *
 * No I/O. Deterministic given (pool, seed). The route that fetches candidates
 * lives elsewhere; this is the part we can prove exhaustively with simulations.
 */

/** Normalized genre vocabulary the planner reasons about. */
export type CalGenre =
  | 'drama' | 'comedy' | 'crime' | 'thriller' | 'action' | 'mystery'
  | 'romance' | 'scifi' | 'fantasy' | 'horror' | 'documentary'
  | 'reality' | 'soap' | 'family' | 'animation';

export interface CalCandidate {
  key: string; // "movie:603" — stable, unique
  mediaType: 'movie' | 'tv';
  genres: CalGenre[];
  year: number | null;
  /** ISO country of origin; anything other than `domestic` counts as international. */
  country?: string;
  anime?: boolean;
  hallmark?: boolean;  // Hallmark/Lifetime-style
  prestige?: boolean;  // acclaimed "prestige" title
  polarizing?: boolean;
  family?: boolean;
}

export const CALIBRATION_SIZE = 20;
export const EARLY_COMPLETE = 10;
/** Seconds we assume per title, for "time remaining". */
export const SECONDS_PER_TITLE = 4;

/** Hard caps — NEVER exceeded, whatever the pool looks like. */
export const CAPS = { anime: 1, animation: 2, perGenre: 3 } as const;

/** Minimum coverage we try to guarantee when the pool can supply it. */
export const MINS = {
  movies: 8, tv: 8, international: 2, old: 3,
  reality: 1, documentary: 1, soap: 1, hallmark: 1, family: 1, prestige: 1, polarizing: 1,
} as const;

/** Target genre mix across the 20 (crime+thriller share one bucket of 2). */
const GENRE_TARGET: Partial<Record<CalGenre, number>> = {
  drama: 2, comedy: 2, crime: 2, action: 1, mystery: 1, romance: 1,
  scifi: 1, fantasy: 1, horror: 1, documentary: 1, reality: 1, soap: 1, family: 1,
};

export interface CalPlan {
  items: CalCandidate[];
  /** What the plan actually achieved — for the summary + tests. */
  report: {
    total: number;
    movies: number;
    tv: number;
    international: number;
    old: number;
    anime: number;
    animation: number;
    reality: number;
    documentary: number;
    soap: number;
    hallmark: number;
    family: number;
    prestige: number;
    polarizing: number;
    perGenre: Record<string, number>;
    /** Mins the pool could NOT satisfy (honestly surfaced, never hidden). */
    shortfalls: string[];
  };
}

function isOld(c: CalCandidate, oldBefore: number): boolean {
  return c.year != null && c.year < oldBefore;
}
function isIntl(c: CalCandidate, domestic: string): boolean {
  return !!c.country && c.country !== domestic;
}

interface Counters {
  total: number; movies: number; tv: number; international: number; old: number;
  anime: number; animation: number; reality: number; documentary: number; soap: number;
  hallmark: number; family: number; prestige: number; polarizing: number;
  perGenre: Record<string, number>;
}
const emptyCounters = (): Counters => ({
  total: 0, movies: 0, tv: 0, international: 0, old: 0, anime: 0, animation: 0,
  reality: 0, documentary: 0, soap: 0, hallmark: 0, family: 0, prestige: 0, polarizing: 0,
  perGenre: {},
});

/** Would adding this candidate break a HARD cap? Then it can never be chosen. */
function violatesCap(c: CalCandidate, k: Counters): boolean {
  if (c.anime && k.anime >= CAPS.anime) return true;
  if (c.genres.includes('animation') && k.animation >= CAPS.animation) return true;
  for (const g of c.genres) if ((k.perGenre[g] ?? 0) >= CAPS.perGenre) return true;
  return false;
}

/** How much this candidate helps the still-unmet needs (higher = pick sooner). */
function score(c: CalCandidate, k: Counters, o: { domestic: string; oldBefore: number; size: number }): number {
  let s = 0;
  const old = isOld(c, o.oldBefore);
  const intl = isIntl(c, o.domestic);
  // Rare required buckets are worth the most so they never get crowded out.
  if (c.anime && k.anime < MINS_ANIME) s += 60;
  if (c.genres.includes('reality') && k.reality < MINS.reality) s += 55;
  if (c.genres.includes('documentary') && k.documentary < MINS.documentary) s += 55;
  if (c.genres.includes('soap') && k.soap < MINS.soap) s += 55;
  if (c.hallmark && k.hallmark < MINS.hallmark) s += 55;
  if ((c.family || c.genres.includes('family')) && k.family < MINS.family) s += 35;
  if (c.prestige && k.prestige < MINS.prestige) s += 30;
  if (c.polarizing && k.polarizing < MINS.polarizing) s += 30;
  // Genre-mix targets.
  for (const g of c.genres) {
    const target = GENRE_TARGET[g] ?? 0;
    if (target && (k.perGenre[g] ?? 0) < target) s += 20;
  }
  // Format balance — push whichever format is behind its floor.
  const half = o.size / 2;
  if (c.mediaType === 'movie' && k.movies < half) s += 15;
  if (c.mediaType === 'tv' && k.tv < half) s += 15;
  // Attribute floors.
  if (intl && k.international < MINS.international) s += 25;
  if (old && k.old < MINS.old) s += 20;
  // Gentle anti-clustering: penalize genres already near the cap.
  for (const g of c.genres) if ((k.perGenre[g] ?? 0) >= 2) s -= 8;
  // Any brand-new genre adds breadth.
  if (c.genres.some((g) => !(k.perGenre[g] ?? 0))) s += 6;
  return s;
}
const MINS_ANIME = 1; // exactly one anime is desired AND the cap

/** Fold a chosen candidate into the counters. */
function apply(c: CalCandidate, k: Counters, o: { domestic: string; oldBefore: number }): void {
  k.total += 1;
  if (c.mediaType === 'movie') k.movies += 1; else k.tv += 1;
  if (isIntl(c, o.domestic)) k.international += 1;
  if (isOld(c, o.oldBefore)) k.old += 1;
  if (c.anime) k.anime += 1;
  if (c.genres.includes('reality')) k.reality += 1;
  if (c.genres.includes('soap')) k.soap += 1;
  if (c.hallmark) k.hallmark += 1;
  if (c.family || c.genres.includes('family')) k.family += 1;
  if (c.prestige) k.prestige += 1;
  if (c.polarizing) k.polarizing += 1;
  if (c.genres.includes('documentary')) k.documentary += 1;
  if (c.genres.includes('animation')) k.animation += 1;
  for (const g of c.genres) k.perGenre[g] = (k.perGenre[g] ?? 0) + 1;
}

export interface CalOptions {
  size?: number;
  domestic?: string;
  oldBefore?: number;
}

/**
 * Build the calibration plan: greedily pick the candidate that best fills the
 * still-unmet diversity needs, never breaking a hard cap, until `size` titles or
 * the pool is exhausted. Balanced, capped, finite, and honest about shortfalls.
 */
export function buildCalibrationPlan(pool: CalCandidate[], opts: CalOptions = {}): CalPlan {
  const size = opts.size ?? CALIBRATION_SIZE;
  const domestic = opts.domestic ?? 'US';
  const oldBefore = opts.oldBefore ?? 2005;
  const o = { domestic, oldBefore, size };

  // Dedupe by key, keep order stable.
  const seen = new Set<string>();
  const remaining = pool.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));

  const k = emptyCounters();
  const chosen: CalCandidate[] = [];

  while (chosen.length < size) {
    let best: CalCandidate | null = null;
    let bestScore = -Infinity;
    let bestIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i]!;
      if (violatesCap(c, k)) continue;
      const s = score(c, k, o);
      if (s > bestScore) { bestScore = s; best = c; bestIdx = i; }
    }
    if (!best) break; // nothing left that respects the caps
    apply(best, k, o);
    chosen.push(best);
    remaining.splice(bestIdx, 1);
  }

  const shortfalls: string[] = [];
  if (k.movies < Math.min(MINS.movies, size)) shortfalls.push(`movies ${k.movies}/${MINS.movies}`);
  if (k.tv < Math.min(MINS.tv, size)) shortfalls.push(`tv ${k.tv}/${MINS.tv}`);
  if (k.international < MINS.international) shortfalls.push(`international ${k.international}/${MINS.international}`);
  if (k.old < MINS.old) shortfalls.push(`older ${k.old}/${MINS.old}`);
  for (const key of ['reality', 'documentary', 'soap', 'hallmark', 'family', 'prestige', 'polarizing'] as const) {
    if (k[key] < MINS[key]) shortfalls.push(`${key} ${k[key]}/${MINS[key]}`);
  }

  return {
    items: chosen,
    report: {
      total: k.total, movies: k.movies, tv: k.tv, international: k.international, old: k.old,
      anime: k.anime, animation: k.animation, reality: k.reality, documentary: k.documentary,
      soap: k.soap, hallmark: k.hallmark, family: k.family, prestige: k.prestige, polarizing: k.polarizing,
      perGenre: k.perGenre, shortfalls,
    },
  };
}

/** Progress model for the UI — finite, with an honest ETA. */
export function calibrationProgress(answered: number, size = CALIBRATION_SIZE) {
  const done = Math.min(answered, size);
  const remaining = Math.max(0, size - done);
  return {
    index: Math.min(done + 1, size),
    size,
    percent: Math.round((done / size) * 100),
    secondsRemaining: remaining * SECONDS_PER_TITLE,
    reachedEarly: done >= EARLY_COMPLETE,
    complete: done >= size,
  };
}

/** Assert every hard invariant on a finished plan — used by the simulation suite. */
export function calibrationInvariants(plan: CalPlan, poolWasBroad: boolean, size = CALIBRATION_SIZE): string[] {
  const errs: string[] = [];
  const r = plan.report;
  if (plan.items.length > size) errs.push(`over size: ${plan.items.length}`);
  if (new Set(plan.items.map((i) => i.key)).size !== plan.items.length) errs.push('duplicates');
  if (r.anime > CAPS.anime) errs.push(`anime ${r.anime} > ${CAPS.anime}`);
  if (r.animation > CAPS.animation) errs.push(`animation ${r.animation} > ${CAPS.animation}`);
  for (const [g, n] of Object.entries(r.perGenre)) if (n > CAPS.perGenre) errs.push(`genre ${g} ${n} > ${CAPS.perGenre}`);
  // A broad pool must produce a full, well-covered set with no shortfalls.
  if (poolWasBroad) {
    if (plan.items.length !== size) errs.push(`broad pool not full: ${plan.items.length}`);
    if (r.shortfalls.length) errs.push(`broad pool shortfalls: ${r.shortfalls.join(', ')}`);
  }
  return errs;
}
