/**
 * Preference-engine types — the three separate DNA channels and the events that
 * feed them. This layer lives OUTSIDE `src/lib/scoring/` (which stays the
 * authoritative deterministic engine): it is a pure, unit-tested personalization
 * model that separates what a user has watched from what merely attracts them
 * from what they're curious about — the split the old single blended rating
 * could never express.
 *
 * Pure data + math only. No I/O, no Supabase, no TMDB. Everything here is a
 * deterministic function of an append-only event log + a supplied `now`, so the
 * whole model is reproducible, testable, and trivially Undoable (drop an event,
 * re-derive).
 */
import type { TitleDimensions } from '@/lib/scoring/dimensions';

/** The three learning engines. They never mix. */
export type DnaChannel = 'experience' | 'attraction' | 'discovery';

/** Post-watch grades (EXPERIENCE DNA) — the highest-confidence signal. */
export type ExperienceGrade = 'loved' | 'liked' | 'okay' | 'disliked' | 'hated' | 'dnf';

/** Pre-watch reactions (ATTRACTION DNA) — what draws someone in, not enjoyment. */
export type AttractionGrade =
  | 'must_watch'
  | 'interested'
  | 'maybe_interested'
  | 'not_interested'
  | 'absolutely_not';

/** Curiosity / exploration reactions (DISCOVERY DNA). */
export type DiscoveryGrade =
  | 'never_heard_interested'
  | 'know_but_skipped'
  | 'want_more_like_this'
  | 'dont_show_like_this';

/** The four fast-onboarding primary actions (+ skip = zero DNA). */
export type PrimaryAction =
  | 'seen_liked'
  | 'seen_disliked'
  | 'unseen_interested'
  | 'unseen_not_interested'
  | 'skip';

/**
 * A follow-up reason ("what turned you off?"). Mood reasons decay over time;
 * permanent reasons strengthen DNA. Presentation reasons (poster/description)
 * inform CLICK/Attraction, never taste.
 */
export type ReasonCode =
  | 'genre'
  | 'too_slow'
  | 'looks_confusing'
  | 'too_violent'
  | 'too_scary'
  | 'too_childish'
  | 'animation'
  | 'supernatural'
  | 'sci_fi'
  | 'romance'
  | 'actor'
  | 'poster'
  | 'description'
  | 'already_know_story'
  | 'not_in_the_mood'
  | 'other';

/** How an observation ages: permanent evidence never fades; mood evidence decays. */
export type Decay = 'permanent' | 'mood';

/** One accumulated belief about a single trait (a dimension axis, a genre, a person). */
export interface TraitBelief {
  /** Evidence-weighted mean target position, 0..100 (50 = no lean / unknown). */
  pref: number;
  /** Total evidence weight accumulated (>= 0). Confidence saturates on this. */
  evidence: number;
}

/** A trait belief with its derived confidence, for read-out / explanation / UI. */
export interface TraitConfidence extends TraitBelief {
  /** 0..1 confidence in the DIRECTIONAL claim ("likes X"). Low until repeated. */
  confidence: number;
  /** 0..1: how far the lean is from neutral. */
  decisiveness: number;
  /** +1 the user leans to the axis "high" pole, -1 to "low", 0 no lean. */
  polarity: -1 | 0 | 1;
  /** Coarse bucket for UI copy. */
  tier: 'learning' | 'weak' | 'moderate' | 'strong';
}

/** A single channel's learned state. */
export interface ChannelProfile {
  /** Per content-dimension beliefs (keys = DIMENSION_KEYS). */
  dims: Record<string, TraitBelief>;
  /** Per-genre affinity beliefs (key = genre slug). */
  genres: Record<string, TraitBelief>;
  /** Per-person affinity beliefs (key = person id/slug). */
  people: Record<string, TraitBelief>;
  /** How much the user wants unfamiliar/novel picks (discovery appetite). */
  novelty: TraitBelief;
  /** Number of non-skip events that contributed to this channel. */
  samples: number;
}

/** The whole preference model: three independent channels. */
export interface DnaState {
  experience: ChannelProfile;
  attraction: ChannelProfile;
  discovery: ChannelProfile;
}

/** The typed signal an action/reason resolves to before it touches a channel. */
export interface DnaSignal {
  channel: DnaChannel;
  /** +1 toward the title's traits, -1 toward their opposite. */
  polarity: 1 | -1;
  /** Base evidence weight per observation (Experience > Attraction > Discovery). */
  strength: number;
  decay: Decay;
  /** Novelty appetite nudge for DISCOVERY signals (-1..1), 0 for others. */
  novelty?: number;
  /** Genre slugs this signal specifically implicates (beyond the title's own). */
  genres?: string[];
  /** Person ids this signal specifically implicates. */
  people?: string[];
  /** Reason wants to reject the TITLE's own genres (generic "wrong genre"). */
  useTitleGenres?: boolean;
  /** Reason wants to reject the TITLE's own people (generic "that actor"). */
  useTitlePeople?: boolean;
  /** Restrict a follow-up to specific dimension axes (e.g. "too slow" → pacing). */
  dims?: Array<{ key: string; target: number }>;
  /** Presentation-only (poster/description): learn click/attraction, not taste. */
  presentationOnly?: boolean;
}

/** An append-only preference event. The log IS the source of truth. */
export interface PreferenceEvent {
  id: string;
  /** Epoch ms the event was recorded (used for mood decay). */
  at: number;
  /** Stable title key, e.g. "movie:603". */
  titleId: string;
  /** The title's content fingerprint (0..100 per axis), if known. */
  dims?: TitleDimensions;
  /** Genre slugs of the title. */
  genres?: string[];
  /** Person ids associated with the title (lead cast, director). */
  people?: string[];
  /** The primary action taken. */
  action: PrimaryAction;
  /** Optional richer grade (overrides the action's default strength/polarity). */
  experienceGrade?: ExperienceGrade;
  attractionGrade?: AttractionGrade;
  discoveryGrade?: DiscoveryGrade;
  /** Optional follow-up reasons attached to a negative action. */
  reasons?: ReasonCode[];
  /** ms the card was shown before the user acted (quality signal; too-fast = suspect). */
  dwellMs?: number;
  /** Which surface produced the event (onboarding, round, home, etc.). */
  source?: string;
  /** The Case Round this event belongs to, if any. */
  roundId?: string;
  /** Title familiarity 0..1 (recognizable titles are safer to judge). */
  familiarity?: number;
}
