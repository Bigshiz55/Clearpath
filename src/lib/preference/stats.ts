/**
 * CASE STATS + LEVELS — the progress numbers shown on the home card and profile,
 * derived from the event log. Positive, neutral language ("caught your interest",
 * "ruled out"), never "failures". Levels reflect DNA development, not tap count.
 * Pure.
 */
import type { PreferenceEvent } from './types';
import { primarySignal } from './signals';

export interface CaseStats {
  titlesExamined: number;
  watched: number;
  watchedLiked: number;
  watchedDisliked: number;
  dnf: number;
  caughtInterest: number;
  ruledOut: number;
  skipped: number;
}

/** Derive the headline counts from the event log. */
export function caseStats(events: PreferenceEvent[]): CaseStats {
  const seenTitles = new Set<string>();
  const s: CaseStats = {
    titlesExamined: 0, watched: 0, watchedLiked: 0, watchedDisliked: 0,
    dnf: 0, caughtInterest: 0, ruledOut: 0, skipped: 0,
  };
  for (const e of events) {
    if (e.action === 'skip' && !e.experienceGrade && !e.attractionGrade && !e.discoveryGrade) {
      s.skipped += 1;
      continue;
    }
    const sig = primarySignal(e);
    if (!sig) { s.skipped += 1; continue; }
    seenTitles.add(e.titleId);

    if (e.experienceGrade === 'dnf') s.dnf += 1;

    if (sig.channel === 'experience') {
      s.watched += 1;
      if (sig.polarity > 0) s.watchedLiked += 1;
      else s.watchedDisliked += 1;
    } else if (sig.channel === 'attraction') {
      if (sig.polarity > 0) s.caughtInterest += 1;
      else s.ruledOut += 1;
    }
  }
  s.titlesExamined = seenTitles.size;
  return s;
}

// ---- Levels — secondary to DNA quality, driven by developed strength ---------

export interface Level {
  n: number;
  name: string;
  /** Minimum DNA Strength (developed %) to reach this level. */
  min: number;
}

export const LEVELS: Level[] = [
  { n: 1, name: 'First Impression', min: 0 },
  { n: 2, name: 'Taste Witness', min: 20 },
  { n: 3, name: 'Case Builder', min: 40 },
  { n: 4, name: 'Evidence Analyst', min: 60 },
  { n: 5, name: 'DNA Investigator', min: 78 },
  { n: 6, name: 'Verdict Expert', min: 90 },
];

/** The level for a given DNA Strength (developed %). */
export function levelFor(developed: number): Level {
  let current = LEVELS[0]!;
  for (const l of LEVELS) if (developed >= l.min) current = l;
  return current;
}
