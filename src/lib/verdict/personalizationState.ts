/**
 * HONEST PERSONALIZATION STATES — the label must match the evidence.
 *
 * The title page used to brand the headline "Your VERD1CT 🧬" whenever the
 * account had rated anything at all (`available && sampleSize > 0`), even when
 * the taste layer had NOT moved the number — so an objective Standard Score wore
 * a personal badge. That is the fake personalization this removes.
 *
 * The authoritative signal is the deterministic resolver's own verdict:
 * `canonical.personalized` (did taste actually change this title's number?) and
 * `canonical.label` ('Your Verdict' | 'Standard Score'). We display exactly that,
 * and never claim more:
 *
 *   - objective  → taste did not move it. "Standard Score", no 🧬, and an honest
 *                  invitation to make it personal.
 *   - learning   → taste moved it but the model is still light on evidence.
 *   - tuned      → taste moved it with real confidence — "squarely your taste".
 *
 * Pure + client-safe.
 */

export type PersonalizationState = 'objective' | 'learning' | 'tuned';

export interface PersonalizationView {
  state: PersonalizationState;
  /** The header label — from the resolver when present, else derived. */
  header: 'Your Verdict' | 'Standard Score';
  /** The honest one-line sub-caption. */
  sub: string;
  /** Whether the 🧬 personal marker is earned (taste genuinely participated). */
  showDna: boolean;
}

export interface PersonalizationInput {
  /** The resolver's verdict: did personalization move THIS title's number? */
  personalized: boolean | null | undefined;
  /** The resolver's own label, when available. */
  canonicalLabel?: 'Your Verdict' | 'Standard Score' | null;
  /** Rated titles feeding the model. */
  sampleSize: number;
  /** Taste-vs-objective blend confidence, 0..1. */
  confidence: number;
}

/**
 * The sample count / confidence at which we call the profile genuinely "tuned"
 * rather than still "learning". Mirrors DNA_PERSONAL_MIN in the confidence layer.
 */
const TUNED_MIN_SAMPLES = 10;
const TUNED_MIN_CONFIDENCE = 0.6;

export function personalizationView(input: PersonalizationInput): PersonalizationView {
  const personal = input.personalized === true;

  if (!personal) {
    return {
      state: 'objective',
      header: input.canonicalLabel ?? 'Standard Score',
      // Never "Your Verdict": the number is objective. Invite, don't claim.
      sub: 'A strong pick by the numbers — rate a few and I’ll make this yours',
      showDna: false,
    };
  }

  const tuned = input.confidence >= TUNED_MIN_CONFIDENCE || input.sampleSize >= TUNED_MIN_SAMPLES;
  if (tuned) {
    return {
      state: 'tuned',
      header: input.canonicalLabel ?? 'Your Verdict',
      sub: 'Squarely your taste',
      showDna: true,
    };
  }
  return {
    state: 'learning',
    header: input.canonicalLabel ?? 'Your Verdict',
    sub: `Getting to know you · ${input.sampleSize} rated`,
    showDna: true,
  };
}
