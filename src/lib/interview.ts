// The post-watch interview: up to 3 adaptive questions chosen from what we're
// actually uncertain about for THIS title. Pure — no I/O — so it's easy to test
// and safe to run on the server and pass to the client.
import type { MediaType, PreferenceTrait } from '@/lib/types';

export type Disposition = 'finished' | 'abandoned';

export interface InterviewOption {
  value: string;
  label: string;
}
export interface InterviewQuestion {
  key: string;
  prompt: string;
  options: InterviewOption[];
}

export interface InterviewContext {
  mediaType: MediaType;
  genres: string[];
  runtimeMinutes: number | null;
  numberOfSeasons: number | null;
}

const YES_SOMEWHAT_NO: InterviewOption[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'somewhat', label: 'A little' },
  { value: 'no', label: 'No' },
];

/** A defining-ish element we can ask about, mapped to a preference trait. */
function elementFromGenres(genres: string[]): { label: string; trait: PreferenceTrait } | null {
  const g = genres.map((x) => x.toLowerCase());
  if (g.includes('science fiction')) return { label: 'sci-fi', trait: 'science_fiction' };
  if (g.includes('fantasy')) return { label: 'fantasy', trait: 'fantasy' };
  if (g.includes('horror') || g.includes('supernatural')) return { label: 'supernatural', trait: 'supernatural' };
  return null;
}

function isLong(ctx: InterviewContext): boolean {
  if (ctx.mediaType === 'tv') return (ctx.numberOfSeasons ?? 0) >= 3;
  return (ctx.runtimeMinutes ?? 0) >= 140;
}

/**
 * Build up to three questions, prioritized by what would actually sharpen the
 * Taste Brain for this title and disposition. Order = most informative first.
 */
export function buildInterview(ctx: InterviewContext, disposition: Disposition): InterviewQuestion[] {
  const out: InterviewQuestion[] = [];
  const el = elementFromGenres(ctx.genres);

  if (disposition === 'abandoned') {
    out.push({
      key: 'why_stopped',
      prompt: 'What made you stop?',
      options: [
        { value: 'too_slow', label: 'Too slow' },
        { value: 'not_interested', label: 'Didn’t grab me' },
        { value: 'too_intense', label: 'Too intense' },
        { value: 'other', label: 'Something else' },
      ],
    });
  } else {
    out.push({
      key: 'ending',
      prompt: 'Was the ending satisfying?',
      options: YES_SOMEWHAT_NO,
    });
  }

  if (isLong(ctx) && !out.some((q) => q.key === 'why_stopped')) {
    out.push({
      key: 'pacing',
      prompt: 'Did the pacing drag?',
      options: YES_SOMEWHAT_NO,
    });
  }

  if (el) {
    out.push({
      key: `element:${el.trait}`,
      prompt: `Was the ${el.label} element bigger than you expected?`,
      options: [
        { value: 'more', label: 'Yes, more' },
        { value: 'expected', label: 'About right' },
        { value: 'less', label: 'Less' },
      ],
    });
  }

  if (out.length < 3 && disposition === 'finished' && ctx.mediaType === 'tv') {
    out.push({
      key: 'another_season',
      prompt: 'Watch another season?',
      options: [
        { value: 'yes', label: 'Definitely' },
        { value: 'maybe', label: 'Maybe' },
        { value: 'no', label: 'No' },
      ],
    });
  }

  if (out.length < 3) {
    out.push({
      key: 'draw',
      prompt: 'What carried it for you?',
      options: [
        { value: 'story', label: 'The story' },
        { value: 'performances', label: 'The performances' },
        { value: 'visuals', label: 'The look' },
        { value: 'vibe', label: 'The vibe' },
      ],
    });
  }

  return out.slice(0, 3);
}

/**
 * Derive honest Taste Brain nudges from interview answers. Only ever proposes
 * "avoid" preferences the user's own answers clearly support — the deterministic
 * engine is untouched; this adjusts the user's tunable preference layer, exactly
 * like editing Settings. Returns the traits to ensure-avoid.
 */
export function nudgesFromAnswers(
  answers: Record<string, string>,
  disposition: Disposition,
): PreferenceTrait[] {
  const traits = new Set<PreferenceTrait>();
  const negative = disposition === 'abandoned' || answers.ending === 'no';

  if (answers.why_stopped === 'too_slow' || answers.pacing === 'yes') traits.add('slow_burn');

  for (const [key, val] of Object.entries(answers)) {
    if (key.startsWith('element:') && val === 'more' && negative) {
      const trait = key.slice('element:'.length) as PreferenceTrait;
      traits.add(trait);
    }
  }
  return Array.from(traits);
}
