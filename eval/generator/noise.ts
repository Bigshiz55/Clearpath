/**
 * Phase 3 — realistic voice/transcription noise. Every transform preserves the
 * INTENDED meaning (ground truth comes from the generator's structure, never
 * the sentence), so a noisy variant tests robustness, not a different request.
 */
import type { Rng } from './rng';

const FILLERS = ['um', 'uh', 'like', 'you know', 'I mean', 'so'];
const HOMOPHONES: [RegExp, string][] = [
  [/\bnetflix\b/i, 'net flicks'],
  [/\blifetime\b/i, 'life time'],
  [/\bhallmark\b/i, 'hall mark'],
  [/\bpsychological\b/i, 'psychological'], // kept; hard to mishear meaningfully
  [/\bthriller\b/i, 'triller'],
  [/\bseries\b/i, 'serious'],
  [/\bprime\b/i, 'pride'],
];

export type NoiseKind =
  | 'clean'
  | 'filler'
  | 'repeat'
  | 'self_correct'
  | 'no_punct'
  | 'runon'
  | 'homophone'
  | 'plural_slip';

export function applyNoise(text: string, kind: NoiseKind, rng: Rng): string {
  switch (kind) {
    case 'clean':
      return text;
    case 'filler': {
      const words = text.split(' ');
      const at = rng.int(Math.max(1, words.length));
      words.splice(at, 0, rng.pick(FILLERS));
      return words.join(' ');
    }
    case 'repeat': {
      const words = text.split(' ');
      const at = rng.int(Math.max(1, words.length));
      words.splice(at, 0, words[at] ?? words[0] ?? '');
      return words.join(' ');
    }
    case 'self_correct': {
      // "five—actually make it three—Lifetime movies"
      return text.replace(/\bfive\b/i, 'five, actually make it three,').replace(/\bNetflix\b/i, 'Netflix, no wait, Prime,');
    }
    case 'no_punct':
      return text.replace(/[,.?!]/g, '');
    case 'runon':
      return text.replace(/\.\s+/g, ' and ').replace(/,\s+/g, ' ');
    case 'homophone': {
      let out = text;
      for (const [re, rep] of HOMOPHONES) if (re.test(out) && rng.bool(0.6)) out = out.replace(re, rep);
      return out;
    }
    case 'plural_slip':
      return text.replace(/\bmovies\b/i, 'movie').replace(/\bshows\b/i, 'show');
    default:
      return text;
  }
}

export const NOISE_KINDS: NoiseKind[] = [
  'clean',
  'filler',
  'repeat',
  'self_correct',
  'no_punct',
  'runon',
  'homophone',
  'plural_slip',
];
