/**
 * FOLLOW-UPS — the "never accept a shallow answer" machinery.
 *
 * "I like crime movies" is not an answer, it's the start of one. This module
 * holds a probe bank keyed by axis and by common subject, and `buildFollowUp`
 * turns a trigger into a ready `FollowUp` with the specific, fanning-out probes
 * that pull a real answer out ("What kind — serial killers? Heists?"). Titles
 * get a generic "what grabbed you" probe when nothing more specific fits.
 *
 * Pure. The turn a follow-up was opened on is passed in.
 */
import type { FollowUp, TasteCategory } from './types';
import { normalizeSubject } from './categories';

/** The generic title probe — used when we have a reaction but no specific axis. */
export const GENERIC_TITLE_PROBES: string[] = [
  'What grabbed you — the mystery, or the tension?',
  'Was it the story, or the way it was told?',
];

/** Fan-out probes by axis. Most specific first; the model picks or rephrases one. */
export const CATEGORY_PROBES: Partial<Record<TasteCategory, string[]>> = {
  crime: [
    'What kind — serial killers? Heists?',
    'Courtroom, or detective stories?',
    'Police corruption, or true crime?',
  ],
  horrorTolerance: [
    'Slow-burn dread, or jump scares?',
    'Supernatural, or a real-world monster?',
    'The gory kind, or the psychological kind?',
  ],
  sciFi: [
    'Hard sci-fi, or space opera?',
    'Dystopia, or first contact?',
    'Big ideas, or big spectacle?',
  ],
  comedyTolerance: [
    'Dry and deadpan, or broad and silly?',
    'Satire, or feel-good?',
    'Cringe comedy, or witty banter?',
  ],
  psychologicalThrillers: [
    'Psychological, or edge-of-your-seat?',
    'A slow tightening, or a race against the clock?',
    'A whodunit, or you-know-who-but-can-they-be-stopped?',
  ],
  romance: [
    'Sweeping and grand, or small and real?',
    'A happy ending, or something bittersweet?',
    'Slow-burn longing, or sparks from the start?',
  ],
  mystery: [
    'A locked-room puzzle, or a slow unravelling?',
    'Cosy and clever, or dark and dangerous?',
    'Do you want to solve it before they do?',
  ],
};

/** Fan-out probes by common subject word (catches genres with no 1:1 axis). */
export const SUBJECT_PROBES: Record<string, string[]> = {
  crime: CATEGORY_PROBES.crime!,
  horror: CATEGORY_PROBES.horrorTolerance!,
  'sci-fi': CATEGORY_PROBES.sciFi!,
  'science fiction': CATEGORY_PROBES.sciFi!,
  scifi: CATEGORY_PROBES.sciFi!,
  comedy: CATEGORY_PROBES.comedyTolerance!,
  comedies: CATEGORY_PROBES.comedyTolerance!,
  thriller: CATEGORY_PROBES.psychologicalThrillers!,
  thrillers: CATEGORY_PROBES.psychologicalThrillers!,
  romance: CATEGORY_PROBES.romance!,
  drama: [
    'A quiet character study, or something sweeping and epic?',
    'Family, or crime and power?',
    'Slow and aching, or sharp and tense?',
  ],
  dramas: [
    'A quiet character study, or something sweeping and epic?',
    'Family, or crime and power?',
    'Slow and aching, or sharp and tense?',
  ],
};

export interface FollowUpTrigger {
  category?: TasteCategory;
  subject?: string;
  /** The user gave a thin answer, so the follow-up should push for specifics. */
  shallow: boolean;
}

/**
 * Build the follow-up for a trigger. Subject probes win over axis probes (they
 * are more concrete), and everything falls back to the generic title probes.
 * `reason` records whether we are pushing on a shallow answer or following
 * genuine curiosity — that steers the model's phrasing.
 */
export function buildFollowUp(trigger: FollowUpTrigger, openedTurn: number): FollowUp {
  const subjectKey = trigger.subject ? normalizeSubject(trigger.subject) : '';
  const bySubject = subjectKey ? SUBJECT_PROBES[subjectKey] : undefined;
  const byCategory = trigger.category ? CATEGORY_PROBES[trigger.category] : undefined;
  const probes = bySubject ?? byCategory ?? GENERIC_TITLE_PROBES;

  const topic = trigger.subject ?? trigger.category ?? 'that';
  const reason = trigger.shallow
    ? 'The answer was too thin — dig for the specifics.'
    : 'A rich subject worth going deeper on.';

  return { topic, probes: [...probes], reason, openedTurn };
}
