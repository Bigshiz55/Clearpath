/**
 * TEACHING THE W, ONCE.
 *
 * The W is the app's most distinctive control and its least self-evident: a
 * letter on a poster, with no way to guess that it builds a shortlist the
 * gavel will decide between. First-time users tap it, see a bar appear, and
 * have no idea what they have started.
 *
 * The fix is a coach mark, and the whole design problem is knowing when to
 * STOP showing it. Rules:
 *
 *   • Never more than one on screen — a grid of thirty posters must not sprout
 *     thirty tooltips.
 *   • The "what is this" hint only before the user has ever selected anything.
 *   • After the first selection, one progress line that says what unlocks the
 *     gavel — because that is now the only thing they do not know.
 *   • Once they have reached the minimum, or dismissed it, it never returns.
 *
 * Pure: the state comes in, the decision comes out. Persistence lives in the
 * component (localStorage), so this stays testable and has no side effects.
 */
import { MIN_FOR_VERDICT } from '@/lib/verdict/docket';

export type CoachStep = 'none' | 'explain' | 'progress';

export interface CoachInput {
  /** How many titles are on the docket right now. */
  selected: number;
  /** Has this user ever put anything on a docket? (persisted) */
  everSelected: boolean;
  /** Has this user dismissed the coach, or already reached the minimum? */
  dismissed: boolean;
  /** Is this the FIRST W rendered on the page? Only that one may coach. */
  isFirstOnPage: boolean;
  /**
   * Has the "what happens next" line already been shown once, ever?
   * (persisted). Distinct from `dismissed`: this one retires itself the
   * moment it is first rendered, so it appears exactly once per user no
   * matter whether they tap "Got it", reach the minimum, or just navigate
   * away without touching it.
   */
  progressShown: boolean;
}

export interface CoachView {
  step: CoachStep;
  text: string;
}

/**
 * What (if anything) this particular W should say.
 *
 * The two messages are the ones the user asked for, and they are deliberately
 * different jobs: the first explains the CONTROL, the second explains the
 * GOAL. Showing both at once is noise; showing the first one twice is nagging.
 */
export function coachFor(i: CoachInput): CoachView {
  if (i.dismissed || !i.isFirstOnPage) return { step: 'none', text: '' };

  // Already understood: they have a docket going and know it exists.
  if (i.selected >= MIN_FOR_VERDICT) return { step: 'none', text: '' };

  if (i.selected === 0) {
    // Never used it → explain the control. Used it before but the docket is
    // empty right now → they know what it is; say nothing.
    return i.everSelected
      ? { step: 'none', text: '' }
      : { step: 'explain', text: 'Tap Docket to add this title to tonight’s decision.' };
  }

  // The "what happens next" line only ever shows once, ever — the moment it
  // has been rendered it retires itself regardless of dismissal or outcome.
  if (i.progressShown) return { step: 'none', text: '' };

  return {
    step: 'progress',
    text: `${i.selected} on your docket — choose at least ${MIN_FOR_VERDICT} to unlock the gavel.`,
  };
}

/**
 * Should the coach be permanently retired?
 *
 * Once a user has assembled a full docket they have demonstrably understood
 * the feature, and re-teaching it is the thing that makes onboarding feel
 * like nagging.
 */
export function shouldRetire(selected: number): boolean {
  return selected >= MIN_FOR_VERDICT;
}

export { MIN_FOR_VERDICT };
