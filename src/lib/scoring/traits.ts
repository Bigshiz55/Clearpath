import type { MediaType, PreferenceTrait, TitleMetadata } from '@/lib/types';

/**
 * Trait detection.
 *
 * A "trait" is a stylistic/genre characteristic the scoring engine reasons
 * about (supernatural, noir, grounded crime, …). For each trait we compute a
 * signal that distinguishes a *defining* characteristic of the title from a
 * merely *present* secondary tag. Preference rules that carry major penalties
 * only fire when the trait is defining — a single secondary keyword must never
 * trigger a major penalty (spec §5).
 */

export interface TraitSignal {
  trait: PreferenceTrait;
  present: boolean;
  defining: boolean;
  matchedGenres: string[];
  matchedKeywords: string[];
  strength: number;
}

export interface DetectionContext {
  /** Collection/franchise id the title belongs to (TMDB), if any. */
  collectionId?: number | null;
  /** Franchise/collection ids the user has previously enjoyed. */
  likedFranchiseIds?: number[];
}

const norm = (s: string) => s.toLowerCase().trim();

function genreSet(meta: TitleMetadata): string[] {
  return meta.genres.map(norm);
}

function primaryGenre(meta: TitleMetadata): string | null {
  return meta.genres.length > 0 ? norm(meta.genres[0]!) : null;
}

function keywordHits(meta: TitleMetadata, patterns: string[]): string[] {
  const kws = meta.keywords.map(norm);
  const hits: string[] = [];
  for (const kw of kws) {
    for (const p of patterns) {
      if (kw === p || kw.includes(p)) {
        hits.push(kw);
        break;
      }
    }
  }
  return hits;
}

interface TraitConfig {
  genres: string[];
  keywords: string[];
}

// Genre names as TMDB returns them (movie + tv variants), lowercased.
const TRAIT_CONFIG: Record<PreferenceTrait, TraitConfig> = {
  supernatural: {
    genres: [],
    keywords: [
      'supernatural',
      'ghost',
      'haunt',
      'demon',
      'possession',
      'exorcism',
      'undead',
      'vampire',
      'werewolf',
      'witch',
      'occult',
      'afterlife',
      'poltergeist',
      'zombie',
      'the devil',
      'curse',
    ],
  },
  paranormal: {
    genres: [],
    keywords: [
      'paranormal',
      'psychic',
      'poltergeist',
      'ghost',
      'haunt',
      'clairvoyant',
      'medium',
      'seance',
    ],
  },
  noir: {
    genres: [],
    keywords: ['film noir', 'neo-noir', 'neo noir', 'noir'],
  },
  slow_burn: {
    genres: [],
    keywords: [
      'slow burn',
      'slow-burn',
      'slow paced',
      'slow-paced',
      'meditative',
      'contemplative',
      'deliberate pacing',
      'slow cinema',
    ],
  },
  science_fiction: {
    genres: ['science fiction', 'sci-fi & fantasy'],
    keywords: [
      'space',
      'alien',
      'dystopia',
      'time travel',
      'robot',
      'cyberpunk',
      'artificial intelligence',
      'spaceship',
      'post-apocalyptic',
      'outer space',
      'extraterrestrial',
    ],
  },
  fantasy: {
    genres: ['fantasy', 'sci-fi & fantasy'],
    keywords: [
      'magic',
      'wizard',
      'dragon',
      'mythical',
      'sword and sorcery',
      'fairy tale',
      'elves',
      'sorcery',
      'enchanted',
      'superpower',
    ],
  },
  grounded_crime: {
    genres: ['crime'],
    keywords: [
      'police',
      'detective',
      'investigation',
      'heist',
      'organized crime',
      'gangster',
      'homicide',
      'crime drama',
    ],
  },
  psychological_thriller: {
    genres: [],
    keywords: [
      'psychological thriller',
      'psychological',
      'mind games',
      'unreliable narrator',
      'twist ending',
    ],
  },
  serial_killer: {
    genres: [],
    keywords: ['serial killer', 'serial-killer', 'serial murder'],
  },
  detective_mystery: {
    genres: ['mystery'],
    keywords: [
      'detective',
      'private investigator',
      'sherlock',
      'holmes',
      'deduction',
      'whodunit',
      'sleuth',
      'investigation',
      'amateur sleuth',
    ],
  },
  domestic_thriller: {
    genres: [],
    keywords: [
      'stalker',
      'obsession',
      'kidnap',
      'home invasion',
      'neighbor',
      'dangerous secret',
      'deadly',
      'babysitter',
      'affair',
      'held captive',
      'woman in peril',
      'stepmother',
      'nanny',
      'missing person',
      'domestic',
    ],
  },
  franchise_favorite: {
    genres: [],
    keywords: [],
  },
};

function isSlowStructural(meta: TitleMetadata): boolean {
  const genres = genreSet(meta);
  const primary = primaryGenre(meta);
  const fast = ['action', 'adventure', 'thriller', 'action & adventure'];
  const hasFast = genres.some((g) => fast.includes(g));
  const runtime =
    meta.mediaType === 'movie'
      ? meta.runtimeMinutes ?? 0
      : meta.episodeRuntimeMinutes ?? 0;
  const longMovie = meta.mediaType === 'movie' && runtime >= 150;
  return primary === 'drama' && longMovie && !hasFast;
}

export function detectTrait(
  trait: PreferenceTrait,
  meta: TitleMetadata,
  ctx: DetectionContext = {},
): TraitSignal {
  if (trait === 'franchise_favorite') {
    const liked = ctx.likedFranchiseIds ?? [];
    const isMember =
      ctx.collectionId != null && liked.includes(ctx.collectionId);
    return {
      trait,
      present: isMember,
      defining: isMember,
      matchedGenres: [],
      matchedKeywords: isMember ? ['franchise you enjoyed'] : [],
      strength: isMember ? 3 : 0,
    };
  }

  const cfg = TRAIT_CONFIG[trait];
  const genres = genreSet(meta);
  const primary = primaryGenre(meta);
  const matchedGenres = cfg.genres.filter((g) => genres.includes(g));
  const genrePrimaryHit =
    primary != null && cfg.genres.includes(primary);
  const genrePresentHit = matchedGenres.length > 0;
  const matchedKeywords = keywordHits(meta, cfg.keywords);
  const kw = matchedKeywords.length;

  let present = genrePresentHit || kw >= 1;
  let defining =
    genrePrimaryHit || kw >= 2 || (genrePresentHit && kw >= 1);

  // Trait-specific overrides.
  if (trait === 'noir') {
    // No genre exists for noir; the TMDB "film noir"/"neo-noir" keyword is
    // itself a strong, defining signal (spec: always full penalty when noir
    // is a significant defining style).
    present = kw >= 1;
    defining = kw >= 1;
  } else if (trait === 'slow_burn') {
    const structural = isSlowStructural(meta);
    present = kw >= 1 || structural;
    defining = kw >= 1 || structural;
  } else if (trait === 'grounded_crime') {
    const hasDramaOrThriller = genres.some((g) =>
      ['drama', 'thriller'].includes(g),
    );
    const crimePresent = genres.includes('crime') || kw >= 1;
    present = crimePresent && hasDramaOrThriller;
    defining = present;
  } else if (trait === 'detective_mystery') {
    present = genrePresentHit || kw >= 1;
    defining = present;
  } else if (
    trait === 'psychological_thriller' ||
    trait === 'serial_killer' ||
    trait === 'domestic_thriller'
  ) {
    present = kw >= 1;
    defining = kw >= 1;
  }

  const strength =
    (genrePrimaryHit ? 2 : genrePresentHit ? 1 : 0) + kw;

  return {
    trait,
    present,
    defining,
    matchedGenres,
    matchedKeywords,
    strength,
  };
}

export function detectAllTraits(
  meta: TitleMetadata,
  ctx: DetectionContext = {},
): Record<PreferenceTrait, TraitSignal> {
  const traits = Object.keys(TRAIT_CONFIG) as PreferenceTrait[];
  const out = {} as Record<PreferenceTrait, TraitSignal>;
  for (const t of traits) {
    out[t] = detectTrait(t, meta, ctx);
  }
  return out;
}

export const ALL_TRAITS = Object.keys(TRAIT_CONFIG) as PreferenceTrait[];

export function humanTrait(trait: PreferenceTrait): string {
  const map: Record<PreferenceTrait, string> = {
    supernatural: 'Supernatural',
    paranormal: 'Paranormal',
    noir: 'Noir',
    slow_burn: 'Slow Burn',
    science_fiction: 'Science Fiction',
    fantasy: 'Fantasy',
    grounded_crime: 'Grounded Crime Drama',
    psychological_thriller: 'Psychological Thriller',
    serial_killer: 'Serial-Killer Investigation',
    detective_mystery: 'Detective Mystery',
    domestic_thriller: 'Domestic / Grounded Thriller',
    franchise_favorite: 'Favorite Franchise',
  };
  return map[trait];
}

export type { MediaType };
