/**
 * IMPORT SIGNAL MODEL — what an imported observation is actually evidence of.
 *
 * The whole feature turns on one distinction the naive version gets wrong:
 * WATCHED IS NOT LIKED. Netflix history says a title was played, not enjoyed.
 * A poster visible in a screenshot says nothing at all. Treating either as a
 * preference would flood Viewer DNA with noise and drown the handful of things
 * the user actually told us.
 *
 * So every import context maps to an explicit weight here, in one table, rather
 * than being decided ad hoc in whichever component happened to render it. Two
 * hard rules the tests pin:
 *   * a merely-visible poster has ZERO weight
 *   * nothing imported can create a permanent exclusion without the user
 *     confirming it
 *
 * Weights land in the existing DNA taxonomy (experience / attraction /
 * discovery), so imports feed the same engine as manual ratings rather than a
 * parallel one.
 */

export type ImportContext =
  // Explicit statements by the user, on the source service
  | 'double_thumbs_up'      // Netflix "Love this"
  | 'thumbs_up'
  | 'thumbs_down'
  | 'star_rating'           // legacy Netflix / IMDb / Letterboxd numeric
  // Behavioural
  | 'viewing_history'       // it was played
  | 'repeated_viewing'      // played more than once
  | 'completed_series'      // substantial episode coverage
  | 'continue_watching'     // started, not finished
  | 'downloaded'
  // Intent
  | 'my_list'               // saved, not watched
  // Platform-generated — NOT the user speaking
  | 'because_you_watched'
  | 'trending'
  | 'popular'
  | 'visible_poster'
  | 'recommendation_row';

export type DnaChannel = 'experience' | 'attraction' | 'discovery';
export type Decay = 'permanent' | 'mood' | 'none';

export interface ImportSignal {
  channel: DnaChannel | null;
  /** +1 positive, -1 negative, 0 no preference information. */
  polarity: -1 | 0 | 1;
  /** Relative weight. 0 means it must never move Viewer DNA. */
  weight: number;
  decay: Decay;
  /** True when the USER stated it; false when we inferred it from behaviour. */
  explicit: boolean;
  /** Must the user confirm before this can apply? */
  requiresConfirmation: boolean;
  /** Shown on the review row so the user can see our reasoning. */
  rationale: string;
}

/**
 * The hierarchy, strongest first. Ordering here is the product's opinion about
 * evidence quality, and it is deliberately visible in one place.
 */
export const SIGNAL_WEIGHTS: Record<ImportContext, ImportSignal> = {
  double_thumbs_up: {
    channel: 'experience', polarity: 1, weight: 1.6, decay: 'permanent', explicit: true,
    requiresConfirmation: false,
    rationale: 'You marked this as a favourite on the service.',
  },
  thumbs_up: {
    channel: 'experience', polarity: 1, weight: 1.1, decay: 'permanent', explicit: true,
    requiresConfirmation: false,
    rationale: 'You gave this a thumbs up on the service.',
  },
  thumbs_down: {
    channel: 'experience', polarity: -1, weight: 1.1, decay: 'permanent', explicit: true,
    // A negative that will suppress recommendations gets a confirmation step.
    requiresConfirmation: true,
    rationale: 'You gave this a thumbs down on the service.',
  },
  star_rating: {
    channel: 'experience', polarity: 1, weight: 1.0, decay: 'permanent', explicit: true,
    requiresConfirmation: false,
    rationale: 'You rated this on the service.',
  },

  repeated_viewing: {
    channel: 'experience', polarity: 1, weight: 0.7, decay: 'permanent', explicit: false,
    requiresConfirmation: false,
    rationale: 'You watched this more than once, which usually means you enjoyed it.',
  },
  completed_series: {
    channel: 'experience', polarity: 1, weight: 0.6, decay: 'permanent', explicit: false,
    requiresConfirmation: false,
    rationale: 'You watched most or all of this series.',
  },
  viewing_history: {
    // Played. That is experience of the title, but it is NOT an opinion — the
    // weight is low and positive only in the weakest sense.
    channel: 'experience', polarity: 1, weight: 0.2, decay: 'permanent', explicit: false,
    requiresConfirmation: false,
    rationale: 'You watched this. We have not assumed you liked it.',
  },

  my_list: {
    channel: 'attraction', polarity: 1, weight: 0.5, decay: 'permanent', explicit: true,
    requiresConfirmation: false,
    rationale: 'You saved this to your list, so something about it appealed to you.',
  },
  downloaded: {
    channel: 'attraction', polarity: 1, weight: 0.3, decay: 'mood', explicit: true,
    requiresConfirmation: false,
    rationale: 'You downloaded this, which suggests intent to watch.',
  },
  continue_watching: {
    // Started and not finished. Could mean "interrupted" or "abandoned"; we
    // refuse to guess which, so it carries interest but no verdict.
    channel: 'attraction', polarity: 1, weight: 0.15, decay: 'mood', explicit: false,
    requiresConfirmation: false,
    rationale: 'You started this. We cannot tell yet whether you are enjoying it.',
  },

  // Platform-generated. The service chose these, not the user.
  because_you_watched: {
    channel: null, polarity: 0, weight: 0, decay: 'none', explicit: false,
    requiresConfirmation: false,
    rationale: 'The service suggested this to you — it is not something you chose.',
  },
  trending: {
    channel: null, polarity: 0, weight: 0, decay: 'none', explicit: false,
    requiresConfirmation: false,
    rationale: 'This was in a Trending row and says nothing about your taste.',
  },
  popular: {
    channel: null, polarity: 0, weight: 0, decay: 'none', explicit: false,
    requiresConfirmation: false,
    rationale: 'This was in a Popular row and says nothing about your taste.',
  },
  recommendation_row: {
    channel: null, polarity: 0, weight: 0, decay: 'none', explicit: false,
    requiresConfirmation: false,
    rationale: 'This came from a recommendation row, not from anything you did.',
  },
  visible_poster: {
    channel: null, polarity: 0, weight: 0, decay: 'none', explicit: false,
    requiresConfirmation: false,
    rationale: 'This was simply on screen. Being visible is not a preference.',
  },
};

/** Contexts that carry no taste information at all. */
export const ZERO_WEIGHT_CONTEXTS: ImportContext[] = (
  Object.keys(SIGNAL_WEIGHTS) as ImportContext[]
).filter((k) => SIGNAL_WEIGHTS[k].weight === 0);

export function signalFor(context: ImportContext): ImportSignal {
  return SIGNAL_WEIGHTS[context];
}

/** Should this observation be offered on the review screen at all? */
export function isTasteBearing(context: ImportContext): boolean {
  return SIGNAL_WEIGHTS[context].weight > 0;
}

// ---------------------------------------------------------------------------
// User decisions on the review screen
// ---------------------------------------------------------------------------

export type UserVerdict =
  | 'loved' | 'liked' | 'okay' | 'disliked' | 'not_for_me'
  | 'watched' | 'finished' | 'did_not_finish'
  | 'saved' | 'interested' | 'not_now' | 'never_recommend'
  | 'other_profile' | 'remove';

/**
 * A user decision always supersedes what we detected — that is the point of the
 * review screen. `never_recommend` is the ONLY route to a permanent exclusion,
 * and it can only come from this function, never from a detected context.
 */
export function signalForVerdict(v: UserVerdict): ImportSignal | null {
  const base = { explicit: true, requiresConfirmation: false };
  switch (v) {
    case 'loved':
      return { ...base, channel: 'experience', polarity: 1, weight: 1.6, decay: 'permanent',
        rationale: 'You told us you loved this.' };
    case 'liked':
      return { ...base, channel: 'experience', polarity: 1, weight: 1.1, decay: 'permanent',
        rationale: 'You told us you liked this.' };
    case 'okay':
      return { ...base, channel: 'experience', polarity: 1, weight: 0.35, decay: 'permanent',
        rationale: 'You told us this was okay.' };
    case 'disliked':
      return { ...base, channel: 'experience', polarity: -1, weight: 1.1, decay: 'permanent',
        rationale: 'You told us you disliked this.' };
    case 'not_for_me':
      return { ...base, channel: 'attraction', polarity: -1, weight: 0.8, decay: 'permanent',
        rationale: 'You told us this is not for you.' };
    case 'did_not_finish':
      return { ...base, channel: 'experience', polarity: -1, weight: 1.3, decay: 'permanent',
        rationale: 'You started this and chose not to finish it.' };
    case 'finished':
      return { ...base, channel: 'experience', polarity: 1, weight: 0.5, decay: 'permanent',
        rationale: 'You finished this.' };
    case 'watched':
      // Confirming you watched something is still not saying you liked it.
      return { ...base, channel: 'experience', polarity: 1, weight: 0.2, decay: 'permanent',
        rationale: 'You confirmed you watched this. We have not assumed an opinion.' };
    case 'saved':
    case 'interested':
      return { ...base, channel: 'attraction', polarity: 1, weight: 0.8, decay: 'permanent',
        rationale: 'You are interested in this.' };
    case 'not_now':
      // Temporary by design — a mood, not a permanent judgement.
      return { ...base, channel: 'attraction', polarity: -1, weight: 0.4, decay: 'mood',
        rationale: 'Not right now. This will fade rather than count against the title forever.' };
    case 'never_recommend':
      return { ...base, channel: 'attraction', polarity: -1, weight: 1.6, decay: 'permanent',
        rationale: 'You asked us never to recommend this again.' };
    case 'other_profile':
    case 'remove':
      return null; // contributes nothing to THIS profile's DNA
  }
}

/** Only an explicit user verdict may create a permanent exclusion. */
export function createsPermanentExclusion(v: UserVerdict): boolean {
  return v === 'never_recommend';
}

// ---------------------------------------------------------------------------
// Preventing a flood of weak signals from drowning real ratings
// ---------------------------------------------------------------------------

/**
 * Total influence one import job may exert, relative to the user's existing
 * explicit ratings.
 *
 * Without this, importing 4,000 history rows at weight 0.2 would contribute 800
 * units against a handful of hand-made ratings and effectively replace the
 * user's stated taste with their channel-surfing. The cap keeps a large import
 * informative without letting it take over.
 */
export const IMPORT_INFLUENCE_CAP = 0.6;

export interface WeightedItem { weight: number; explicit: boolean }

/**
 * Scale a batch of imported weights so the inferred (non-explicit) portion
 * cannot exceed `cap` of the batch's total influence. Explicit signals — things
 * the user actually stated — are never scaled down.
 */
export function applyInfluenceCap<T extends WeightedItem>(
  items: T[],
  cap = IMPORT_INFLUENCE_CAP,
): { items: (T & { scaledWeight: number })[]; scale: number } {
  const explicitTotal = items.filter((i) => i.explicit).reduce((n, i) => n + i.weight, 0);
  const inferredTotal = items.filter((i) => !i.explicit).reduce((n, i) => n + i.weight, 0);
  const total = explicitTotal + inferredTotal;

  // Allowed inferred mass, given how much explicit evidence exists.
  const allowedInferred = total === 0 ? 0 : Math.max(explicitTotal, 1) * (cap / (1 - cap));
  const scale = inferredTotal > allowedInferred && inferredTotal > 0
    ? allowedInferred / inferredTotal
    : 1;

  return {
    scale,
    items: items.map((i) => ({ ...i, scaledWeight: i.explicit ? i.weight : i.weight * scale })),
  };
}
