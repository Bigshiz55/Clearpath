/**
 * "WHY IT FITS YOU" — one sentence for, one sentence against, both earned.
 *
 * A card can show a number and a call, but a number does not tell you what the
 * app thinks it knows about you. These are the two lines that do — and the
 * whole design problem is that they must never be flattering nonsense.
 *
 * THE ONLY SOURCE IS THE USER'S OWN RATED HISTORY. `agree` and `clash` come out
 * of `scoring/dimensions.matchHighlights`, which compares this title's cached
 * content fingerprint against the axes the user has demonstrably rated highly,
 * and only returns an axis when there is decisive preference AND real evidence
 * behind it. Nothing here invents a trait, reads a synopsis, or asks a model.
 *
 * When there is not enough to say, IT SAYS THAT. A generic sentence dressed up
 * as personalisation is worse than an honest one: it teaches people that the
 * personalisation is decoration. So the fallback names the reason — no profile
 * yet, or no fingerprint for this title — and points at the thing that fixes
 * it.
 *
 * Pure. No I/O, no clock, no model.
 */

/** An axis where the title and the profile line up: "Tension" / "edge-of-seat". */
export interface FitAxis {
  label: string;
  note: string;
}

export interface FitInput {
  /** Axes this title shares with what the user rates highly. */
  agree?: readonly FitAxis[];
  /** Axes where it runs against them. */
  clash?: readonly FitAxis[];
  /** How many rated titles stand behind the profile. */
  samples?: number;
  /** 0..100 fingerprint match, when we have one. */
  match?: number | null;
}

export interface FitReasons {
  /** True only when both lines are built from the user's own history. */
  personalized: boolean;
  /** One short sentence. Never null — the fallback is honest, not absent. */
  positive: string;
  /** One short sentence, or null when we have nothing truthful to caution about. */
  caution: string | null;
  /** Heading for the positive line, so the UI does not overclaim either. */
  positiveLabel: string;
  cautionLabel: string;
}

/** Below this the profile is noise, and `matchHighlights` should not be trusted. */
export const MIN_SAMPLES_FOR_FIT = 3;

/** "edge-of-seat tension", "demands-focus attention" — the axis, read naturally. */
function phrase(a: FitAxis): string {
  return `${a.note.trim()} ${a.label.trim().toLowerCase()}`;
}

/** "a, b and c" — an Oxford-free list that reads as a sentence. */
function list(parts: readonly string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const FALLBACK: FitReasons = {
  personalized: false,
  positive: 'Based on this title’s own themes and how it was received — not on your taste yet.',
  caution: 'Personalised reasoning improves as your Viewer DNA grows. Rate a few titles.',
  positiveLabel: 'What we can say',
  cautionLabel: 'Why it is not personal yet',
};

/**
 * Build the two lines.
 *
 * Returns the honest fallback whenever the profile is too thin to speak, or
 * when the fingerprint produced no decisive axis in either direction — which is
 * a real state, not an error: some titles simply do not sit on any axis this
 * user has an opinion about.
 */
export function buildFitReasons(input: FitInput): FitReasons {
  const agree = (input.agree ?? []).filter((a) => a && a.label && a.note);
  const clash = (input.clash ?? []).filter((c) => c && c.label && c.note);
  const samples = input.samples ?? 0;

  if (samples < MIN_SAMPLES_FOR_FIT) return FALLBACK;
  if (agree.length === 0 && clash.length === 0) return FALLBACK;

  // Two axes is the budget. Three makes a sentence that wraps to four lines on
  // a phone, and the third is always the weakest of the three anyway.
  const good = agree.slice(0, 2).map(phrase);
  const bad = clash.slice(0, 1);

  const positive =
    good.length > 0
      ? `You keep rating ${list(good)} highly, and this has it.`
      : // Everything decisive about this title runs against the profile. Saying
        // "it fits you" here would be a lie, so the positive line becomes an
        // honest statement of the one thing we can still stand behind.
        'Nothing here matches the taste you have shown so far — worth a look only if you are after something different.';

  const caution =
    bad.length > 0
      ? `Its ${bad[0]!.label.toLowerCase()} runs the other way — ${bad[0]!.note}.`
      : good.length > 0
        ? null
        : FALLBACK.caution;

  return {
    personalized: true,
    positive,
    caution,
    positiveLabel: 'Why it fits you',
    cautionLabel: 'Possible drawback',
  };
}

/**
 * The guard the UI uses before rendering: a line that is too long for two
 * rows on a phone gets cut here rather than clipped in CSS, so the words that
 * survive are chosen deliberately.
 */
export const MAX_FIT_CHARS = 150;

export function fitsInTwoLines(sentence: string): boolean {
  return sentence.length <= MAX_FIT_CHARS;
}
