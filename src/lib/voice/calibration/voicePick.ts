/**
 * CHOOSING A VOICE THAT DOES NOT SOUND CREEPY.
 *
 * The previous build picked the first English `speechSynthesis` voice it could
 * find. On macOS and iOS that set still contains the 1990s novelty voices —
 * Zarvox, Trinoids, Whisper, Bahh — and several of the old "compact" voices,
 * which are exactly the flat, uncanny reading that made the first version
 * unpleasant to sit through.
 *
 * So this scores rather than finds. Three things move the number:
 *
 *   1. NOVELTY IS DISQUALIFYING. A named denylist, not a heuristic, because
 *      these voices are a fixed set and guessing at them would miss.
 *   2. QUALITY TIER FIRST. Anything the platform labels Neural / Premium /
 *      Enhanced (or Google's, or Siri's) is a modern model and sounds like a
 *      person; the unlabelled sibling of the same name usually does not.
 *   3. ACCENT LAST. en-GB and en-AU are a mild preference, not a requirement —
 *      a natural American voice beats a robotic British one, which is the
 *      opposite of what the old picker did.
 *
 * PURE and platform-agnostic: it takes a list of `{ name, lang, localService }`
 * and returns the best, so it can be tested against real voice inventories
 * without a browser.
 */

export interface VoiceLike {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
}

/**
 * Apple's novelty and legacy-compact voices. Any of these is worse than no
 * voice at all for this product.
 */
const NOVELTY = new RegExp(
  [
    'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'deranged',
    'good news', 'jester', 'junior', 'organ', 'superstar', 'trinoids', 'whisper',
    'wobble', 'zarvox', 'hysterical', 'princess', 'ralph', 'fred', 'agnes', 'kathy',
    'victoria', 'bruce', 'grandma', 'grandpa', 'rocko', 'shelley', 'sandy', 'flo',
    'eddy', 'reed', 'novelty',
  ].join('|'),
  'i',
);

/** Platform labels that mean "modern model", in descending quality. */
const TIERS: { re: RegExp; score: number }[] = [
  { re: /\bneural\b|\bsiri\b/i, score: 50 },
  { re: /\bpremium\b/i, score: 40 },
  { re: /\benhanced\b/i, score: 35 },
  { re: /^google\s/i, score: 30 },
  { re: /\bnatural\b|\bonline\b|\(natural\)/i, score: 28 },
];

/**
 * Voices that reliably read as warm and adult rather than announcer-like.
 * A nudge, not a rule — an unlisted Neural voice still outranks a listed plain
 * one, which is what keeps this from going stale as platforms ship new voices.
 */
const WARM_NAMES = /\b(serena|sonia|libby|arthur|matilda|natasha|isla|freya|ava|allison|nicky|evan|jamie|zoe|olivia)\b/i;

/** A slightly brisk read: this is rapid-fire, and normal pace feels sluggish. */
export const SPEECH_RATE = 1.12;
export const SPEECH_PITCH = 1;

export function scoreVoice(v: VoiceLike): number {
  if (!/^en\b|^en[-_]/i.test(v.lang)) return -1;
  if (NOVELTY.test(v.name)) return -1;

  let score = 10;
  for (const tier of TIERS) {
    if (tier.re.test(v.name)) {
      score += tier.score;
      break;
    }
  }
  if (WARM_NAMES.test(v.name)) score += 6;
  if (/en[-_](GB|AU|IE|NZ)/i.test(v.lang)) score += 4;
  // A remote voice is a cloud model; those are the good ones on Chrome. But it
  // needs the network mid-run, so it is only a tiebreak, never a tier.
  if (v.localService === false) score += 2;
  return score;
}

/** The best available English voice, or null when the platform offers none. */
export function pickCalibrationVoice<T extends VoiceLike>(voices: readonly T[]): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const v of voices) {
    const score = scoreVoice(v);
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}
