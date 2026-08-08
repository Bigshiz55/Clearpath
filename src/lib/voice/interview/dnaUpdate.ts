/**
 * THE BRIDGE TO THE PREFERENCE ENGINE.
 *
 * The voice interview does not get its own scoring path. Named-title reactions
 * become ordinary graded `preference_events` — the exact same append-only rows
 * the Watch DNA quiz writes — so the server can hand them straight to
 * `recordEvents(...)` unchanged and there stays exactly one model of the user.
 *
 * Discipline, mirrored from `src/lib/taste/toPreference.ts`:
 *  • Only a title reaction with real conviction becomes an event. A love/hate on
 *    a genre or an axis ("I hate horror") is learned by the confidence + reveal
 *    layer, not written as a fake title row — that would pollute the log.
 *  • Neutral remarks produce nothing.
 *  • The event SHAPE is not invented here: it is the `EventDraft` the preference
 *    store already accepts (`Partial<PreferenceEvent> & { id; titleId; action }`).
 *
 * Pure — it builds the rows; the server writes them. No clock, no I/O.
 */
import type { EventDraft } from '@/lib/taste/toPreference';
import type { ExperienceGrade, PrimaryAction } from '@/lib/preference/types';
import type { TasteSignal, Sentiment } from './types';
import { normalizeSubject } from './categories';

/** The `source` stamped on every event this bridge writes. */
export const SOURCE = 'voice_interview';

/** The preference-event draft type the store's `recordEvents` accepts, unchanged. */
export type PreferenceEventDraft = EventDraft;

interface Graded {
  action: PrimaryAction;
  experienceGrade: ExperienceGrade;
}

/** Map a sentiment to the same action + experience grade the quiz uses. */
function gradeFor(sentiment: Sentiment): Graded | null {
  switch (sentiment) {
    case 'love':
      return { action: 'seen_liked', experienceGrade: 'loved' };
    case 'like':
      return { action: 'seen_liked', experienceGrade: 'liked' };
    case 'dislike':
      return { action: 'seen_disliked', experienceGrade: 'disliked' };
    case 'hate':
      return { action: 'seen_disliked', experienceGrade: 'hated' };
    default:
      return null; // neutral → no permanent event
  }
}

/** Stable, non-TMDB title key for a spoken title, e.g. "voice:the-shining". */
function voiceTitleId(subject: string): string {
  const slug = normalizeSubject(subject).replace(/\s+/g, '-');
  return `voice:${slug}`;
}

/**
 * Map the interview's title reactions to preference-event drafts. Only
 * `title`-kind signals with a graded sentiment produce a row; each title is
 * emitted once, keeping the strongest reaction the user gave it.
 */
export function signalsToPreferenceEvents(signals: TasteSignal[]): PreferenceEventDraft[] {
  // Keep the strongest reaction per title.
  const strongest = new Map<string, TasteSignal>();
  for (const s of signals) {
    if (s.kind !== 'title') continue;
    if (!s.subject) continue;
    if (!gradeFor(s.sentiment)) continue;
    const titleId = voiceTitleId(s.subject);
    const prev = strongest.get(titleId);
    if (!prev || s.strength > prev.strength) strongest.set(titleId, s);
  }

  const out: PreferenceEventDraft[] = [];
  for (const [titleId, s] of strongest) {
    const graded = gradeFor(s.sentiment);
    if (!graded) continue; // unreachable — filtered above — but keeps types honest
    out.push({
      id: `voice:${s.id}`,
      titleId,
      action: graded.action,
      experienceGrade: graded.experienceGrade,
      source: SOURCE,
      familiarity: 1,
    });
  }
  return out;
}
