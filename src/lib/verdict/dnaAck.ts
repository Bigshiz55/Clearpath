/**
 * WHAT A RULING ACTUALLY TAUGHT — in the user's words, and never more than is true.
 *
 * Tapping For/Against used to fire a content-free "VERD1CT DNA · Updating ↓"
 * flourish: motion, no meaning. The fix is an honest one-line acknowledgement of
 * what was really recorded.
 *
 * The honesty rule is the whole point:
 *   - FOR marks the title watched and rated up, so more-like-this is true.
 *   - AGAINST with no stated reason knows only "not this title" → we say exactly
 *     that ("fewer like this"), never a fabricated axis claim.
 *   - AGAINST with a stated reason DOES move a specific taste axis (via
 *     `axisSignalsFor`), so we may name it ("less slow pacing") — but only then.
 *
 * Pure + client-safe (data only), so the card, the title page, and any future
 * Pass flow all speak the same acknowledgement.
 */
import { axisSignalsFor, type AxisSignal } from '@/lib/feedback/dnaSignals';
import type { FeedbackType } from '@/lib/actions/passFeedback';

/**
 * The human phrase for the direction a disliked-axis nudge moves the taste.
 * `target` is the 0..100 position the reason pulls the user's preference toward;
 * we describe what they'll see MORE or less of. Returns null for axes whose
 * direction is genuinely ambiguous to state in one plain phrase.
 */
function axisPhrase(axis: string, target: number): string | null {
  switch (axis) {
    case 'pacing':
      return target >= 55 ? 'less slow pacing' : 'a gentler pace';
    case 'darkness':
      return target <= 45 ? 'a lighter tone' : 'darker, heavier picks';
    case 'humor':
      return target >= 55 ? 'more comedy' : 'less goofiness';
    case 'violence':
      return target <= 45 ? 'less violence' : null;
    case 'realism':
      return target >= 55 ? 'more grounded stories' : 'more escapism';
    case 'complexity':
      return target <= 45 ? 'less confusing plots' : 'smarter, denser stories';
    case 'suspense':
      return target <= 45 ? 'less tension' : 'more suspense';
    case 'character':
      return target >= 55 ? 'stronger characters' : null;
    default:
      return null;
  }
}

export interface RuleAck {
  /** The one-line confirmation shown to the user. */
  line: string;
  /** True when the line names a specific learned axis (a stated reason drove it). */
  specific: boolean;
}

/**
 * The honest confirmation for a card ruling. With reason-derived axis signals it
 * names what was learned; with none it states only the title-level truth.
 */
export function ruleAck(ruling: 'for' | 'against', signals: AxisSignal[] = []): RuleAck {
  if (ruling === 'for') return { line: 'Got it — more like this', specific: false };

  const phrases: string[] = [];
  const seen = new Set<string>();
  for (const s of signals) {
    const p = axisPhrase(s.axis, s.target);
    if (p && !seen.has(p)) {
      seen.add(p);
      phrases.push(p);
    }
  }
  if (phrases.length === 0) return { line: 'Noted — fewer like this', specific: false };
  const list =
    phrases.length === 1
      ? phrases[0]
      : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
  return { line: `Got it — ${list}`, specific: true };
}

/**
 * The axis signals a single reason code carries under a pass — client-safe, so
 * the acknowledgement can be built the instant a reason is chosen, without a
 * round trip. Empty for reasons that map to no taste axis (still honest to
 * record, just nothing specific to claim).
 */
export function signalsForReason(code: string, feedbackType: FeedbackType = 'not_for_me'): AxisSignal[] {
  return axisSignalsFor([code], feedbackType);
}
