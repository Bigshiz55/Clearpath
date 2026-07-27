/**
 * THE MOVIE CHECK — testing what we heard, with an actual title.
 *
 * Halfway through, the interviewer stops asking and puts a real film on the
 * table: "I'm showing you this because you said you like dark investigations
 * and psychological tension, but dislike anything that feels pointlessly slow."
 *
 * That single card does something no amount of questioning can. It tells the
 * user whether we were listening, and it tells us whether our reading of them
 * survives contact with a concrete example.
 *
 * This module is the pure half: given the profile, it decides WHAT to look for
 * and WHY, in one sentence. Resolving that to an actual title needs TMDB and
 * lives in the route. If no title comes back, the step is skipped — a card with
 * nothing behind it would be worse than no card.
 */
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import { attribute, attributePhrase } from './lexicon';
import type { VoiceProfile } from './types';

/** What to ask TMDB for. */
export interface ProbeSpec {
  /** Genre slugs to include. */
  genres: string[];
  /** Genre slugs to exclude — their avoidances are honoured, not tested. */
  excludeGenres: string[];
  /** Axis targets, so the resolver can prefer titles that sit near them. */
  dims: Array<{ key: string; target: number }>;
  /** The sentence shown under the poster. Always says why THIS title. */
  rationale: string;
  /** Attribute keys the answer will teach us about. */
  teaches: string[];
  /** True when there is enough to make a meaningful pick. */
  ready: boolean;
}

const MIN_EVIDENCE = 0.5;

function topAttributes(profile: VoiceProfile, sign: -1 | 1, n: number): string[] {
  return Object.entries(profile.attributes)
    .filter(([, b]) => b.evidence >= MIN_EVIDENCE && Math.sign(b.lean) === sign && !b.overruled)
    .sort((a, b) => Math.abs(b[1].lean) * b[1].confidence - Math.abs(a[1].lean) * a[1].confidence)
    .slice(0, n)
    .map(([k]) => k);
}

function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Build the probe. The rationale names the user's own leanings — never
 * "based on your profile", which tells them nothing and sounds like a machine.
 */
export function buildProbe(profile: VoiceProfile): ProbeSpec {
  const likes = topAttributes(profile, 1, 2);
  const avoids = topAttributes(profile, -1, 1);

  const genres = likes.flatMap((k) => attribute(k)?.genres ?? []);
  const excludeGenres = avoids.flatMap((k) => attribute(k)?.genres ?? []);

  const dims = DIMENSION_KEYS.flatMap((k) => {
    const d = profile.dims[k];
    if (!d || d.evidence < MIN_EVIDENCE) return [];
    return [{ key: k, target: Math.round(d.pref) }];
  });

  const likePhrases = likes.map((k) => attributePhrase(k));
  const avoidPhrases = avoids.map((k) => attributePhrase(k));

  let rationale: string;
  if (likePhrases.length && avoidPhrases.length) {
    rationale = `I picked this because you said you go for ${list(likePhrases)}, but steer clear of ${list(avoidPhrases)}.`;
  } else if (likePhrases.length) {
    rationale = `I picked this because you said you go for ${list(likePhrases)}.`;
  } else if (avoidPhrases.length) {
    rationale = `I picked this because you said you steer clear of ${list(avoidPhrases)} — I want to see if I drew the line in the right place.`;
  } else {
    rationale = '';
  }

  return {
    genres: Array.from(new Set(genres)),
    excludeGenres: Array.from(new Set(excludeGenres)),
    dims,
    rationale,
    teaches: [...likes, ...avoids],
    // Without at least one real leaning the card would be a random poster, and
    // a random poster is worse than no card.
    ready: likes.length + avoids.length > 0,
  };
}

/** How the user can answer the card. `unseen` teaches nothing, by design. */
export const CARD_REACTIONS = [
  { value: 'loved', label: 'I loved it' },
  { value: 'liked', label: 'I liked it' },
  { value: 'looks_right', label: 'Looks like me' },
  { value: 'not_for_me', label: 'Not for me' },
  { value: 'hated', label: 'I hated it' },
  { value: 'unseen', label: 'Haven’t seen it' },
] as const;

export type CardReaction = (typeof CARD_REACTIONS)[number]['value'];

/** The one short follow-up worth asking after a card, or null. */
export function cardFollowUp(reaction: CardReaction): string | null {
  if (reaction === 'looks_right') return 'What makes it look like your kind of thing?';
  if (reaction === 'not_for_me') return 'What puts you off it?';
  return null;
}
