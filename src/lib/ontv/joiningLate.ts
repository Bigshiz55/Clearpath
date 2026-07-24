/**
 * "Worth Joining Late?" — a distinctive WatchVerdict feature. PURE, deterministic,
 * explainable. NEVER random. Given how far a program is into its runtime and how
 * plot-dependent it is, it returns yes / maybe / no with a reason, plus restart /
 * on-demand hints.
 *
 * RULES (documented + tested in joiningLate.test.ts):
 *   Not airing yet ....................... not_started.
 *   Restart available .................... YES (reason: restart) regardless of %.
 *   Plot-dependent (movie / serialized drama, standalone=false):
 *     ≤ 12% elapsed ...................... YES.
 *     ≤ 30% elapsed ...................... MAYBE (better from the beginning).
 *     >  30% elapsed ..................... NO (too much has happened). If it will be
 *                                          on demand / airs again → NO + that hint.
 *   Episodic + standalone (sitcom, procedural like Castle, competition, news):
 *     ≤ 75% elapsed ...................... YES (little is truly missed).
 *     ≤ 90% elapsed ...................... MAYBE (almost over).
 *     >  90% elapsed ..................... NO (nearly finished).
 *   A rerun you can catch later never blocks — it just annotates the hint.
 */
import type { JoiningLateAssessment, Program, Airing } from './types';

/** Whether missing the opening materially hurts comprehension. */
export function isPlotDependent(p: Pick<Program, 'eventType' | 'genres' | 'mediaType'>, serialized: boolean): boolean {
  if (p.eventType === 'movie') return true;
  if (p.eventType === 'news' || p.eventType === 'kids' || p.eventType === 'awards' || p.eventType === 'live_event') return false;
  const g = p.genres.map((x) => x.toLowerCase());
  const proceduralish = g.some((x) => ['comedy', 'sitcom', 'talk', 'game show', 'reality', 'competition', 'variety'].includes(x));
  if (proceduralish) return false;
  // Serialized dramas/thrillers/mysteries are plot-dependent.
  return serialized || g.some((x) => ['drama', 'thriller', 'mystery', 'crime', 'sci-fi', 'fantasy'].includes(x));
}

export interface JoiningLateInput {
  airing: Pick<Airing, 'startAt' | 'endAt' | 'restartAvailable' | 'onDemandAvailable' | 'streamingLaterAvailable'>;
  program: Pick<Program, 'eventType' | 'genres' | 'mediaType'>;
  /** Serialized = story continues across episodes (vs standalone episodic). */
  serialized: boolean;
  now: number;
}

export function assessJoiningLate(input: JoiningLateInput): JoiningLateAssessment {
  const start = Date.parse(input.airing.startAt), end = Date.parse(input.airing.endAt);
  const total = Math.max(1, end - start);
  const elapsedMs = input.now - start;
  const minutesElapsed = Math.round(elapsedMs / 60000);
  const percentElapsed = Math.round((elapsedMs / total) * 100);
  const restart = input.airing.restartAvailable;
  const onDemandLater = input.airing.onDemandAvailable || input.airing.streamingLaterAvailable;

  const base = { minutesElapsed: Math.max(0, minutesElapsed), percentElapsed: Math.max(0, Math.min(100, percentElapsed)), restartAvailable: restart, onDemandLater };

  if (input.now < start) {
    return { verdict: 'not_started', reasonKey: 'not_started', reason: 'Not started yet', ...base };
  }
  if (restart) {
    return { verdict: 'yes', reasonKey: 'restart', reason: 'Restart available — start from the beginning', ...base };
  }

  const plot = isPlotDependent(input.program, input.serialized);
  const pct = base.percentElapsed;
  const mins = base.minutesElapsed;

  if (plot) {
    // Plot-dependent uses BOTH absolute minutes and percent, so a 2h movie 54m in
    // (a lot missed) and a 1h episode 27m in (less missed) are judged correctly.
    if (mins <= 15 && pct <= 40) return { verdict: 'yes', reasonKey: 'plot_early', reason: 'Only just started — jump in', ...base };
    if (mins <= 40 && pct <= 70) return { verdict: 'maybe', reasonKey: 'plot_better_start', reason: 'Better from the beginning', ...base };
    const tail = onDemandLater ? ' — available from the start later' : '';
    return { verdict: 'no', reasonKey: onDemandLater ? 'plot_late_ondemand' : 'plot_late', reason: `Too much has happened${tail}`, ...base };
  }
  // Standalone / episodic — little is truly missed.
  if (pct <= 75) return { verdict: 'yes', reasonKey: 'standalone_ok', reason: 'Standalone — you won’t miss much', ...base };
  if (pct <= 90) return { verdict: 'maybe', reasonKey: 'standalone_late', reason: 'Almost over', ...base };
  return { verdict: 'no', reasonKey: 'nearly_done', reason: 'Nearly finished', ...base };
}
