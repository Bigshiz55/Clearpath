/**
 * VOICE DNA → THE PREFERENCE ENGINE.
 *
 * The bridge is deliberately narrow. Voice DNA does not get its own scoring
 * path; it writes into the same append-only `preference_events` log every other
 * surface writes to, so there is exactly one model of the user.
 *
 * Two kinds of event come out of an interview:
 *
 *  1. AXIS CORRECTIONS — "I hate slow shows" is a deliberate statement about an
 *     axis, so it becomes a `corrections` event, which the engine already
 *     treats as overriding inferred taste. It rides on a `skip` action so it
 *     contributes corrections and nothing else.
 *  2. TITLE REACTIONS — named titles become ordinary graded events, at the
 *     grade the user's own words justify and no higher.
 *
 * Mood claims produce nothing. Unconfirmed titles produce nothing. Both would
 * be guesses written into a permanent log.
 *
 * Pure — building the rows is separate from writing them.
 */
import type { PreferenceEvent, PrimaryAction, ExperienceGrade, AttractionGrade } from '@/lib/preference/types';
import type { Claim, VoiceProfile } from './types';
import { toDimensionCorrections } from './profile';

export type EventDraft = Partial<PreferenceEvent> & {
  id: string;
  titleId: string;
  action: PrimaryAction;
};

/** The synthetic title the axis corrections hang off. Never a real title. */
export const CORRECTIONS_TITLE_ID = 'voice:profile';
export const SOURCE = 'voice_dna';

function gradesFor(claim: Claim): {
  action: PrimaryAction;
  experienceGrade?: ExperienceGrade;
  attractionGrade?: AttractionGrade;
} {
  switch (claim.reaction) {
    case 'loved':
      return { action: 'seen_liked', experienceGrade: 'loved' };
    case 'liked':
      return { action: 'seen_liked', experienceGrade: 'liked' };
    case 'mixed':
      return { action: 'seen_liked', experienceGrade: 'okay' };
    case 'disliked':
      return { action: 'seen_disliked', experienceGrade: 'disliked' };
    case 'hated':
      return { action: 'seen_disliked', experienceGrade: 'hated' };
    case 'abandoned':
      return { action: 'seen_disliked', experienceGrade: 'dnf' };
    case 'avoided':
      return { action: 'unseen_not_interested', attractionGrade: 'not_interested' };
    case 'curious':
      return { action: 'unseen_interested', attractionGrade: 'interested' };
    default:
      return claim.polarity === 1
        ? { action: 'seen_liked', experienceGrade: 'liked' }
        : { action: 'seen_disliked', experienceGrade: 'disliked' };
  }
}

export interface BridgeOptions {
  sessionId: string;
  now: number;
  /** Minimum axis evidence before a correction is written. */
  minEvidence?: number;
}

/**
 * The events this profile should write. Returns `[]` when the interview taught
 * us nothing actionable — writing an empty corrections event would claim
 * knowledge we do not have.
 */
export function toPreferenceEvents(
  profile: VoiceProfile,
  claims: Claim[],
  opts: BridgeOptions,
): EventDraft[] {
  const out: EventDraft[] = [];

  const corrections = toDimensionCorrections(profile, opts.minEvidence ?? 0.5);
  if (corrections.length > 0) {
    out.push({
      id: `voice:${opts.sessionId}:corrections`,
      titleId: CORRECTIONS_TITLE_ID,
      action: 'skip', // zero DNA on its own; the corrections are the payload
      corrections,
      at: opts.now,
      source: SOURCE,
    });
  }

  const seen = new Set<string>();
  for (const c of claims) {
    if (c.attribute !== null) continue;
    if (c.durability === 'temporary') continue;
    // A title we only guessed at never becomes a permanent event.
    if (!c.title?.titleId || c.title.needsConfirmation) continue;
    if (seen.has(c.title.titleId)) continue;
    seen.add(c.title.titleId);

    const { action, experienceGrade, attractionGrade } = gradesFor(c);
    const draft: EventDraft = {
      id: `voice:${opts.sessionId}:${c.id}`,
      titleId: c.title.titleId,
      action,
      at: c.at,
      source: SOURCE,
      familiarity: 1,
    };
    if (experienceGrade) draft.experienceGrade = experienceGrade;
    if (attractionGrade) draft.attractionGrade = attractionGrade;
    out.push(draft);
  }

  return out;
}

/** Titles named in the interview that we could not resolve, for the caller to report. */
export function unresolvedTitles(claims: Claim[]): string[] {
  return Array.from(
    new Set(
      claims
        .filter((c) => c.attribute === null && c.title && (!c.title.titleId || c.title.needsConfirmation))
        .map((c) => c.title!.text),
    ),
  );
}
