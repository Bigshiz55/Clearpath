/**
 * Signal taxonomy — turns a user action (and any follow-up reasons) into typed
 * signals routed to the right DNA channel. This is where the core correction
 * lives: "Haven't seen — looks interesting" is ATTRACTION, never EXPERIENCE, and
 * "just not in the mood" decays while "I hate animation" is permanent.
 *
 * Pure lookups. Experience carries the most weight (highest-confidence signal),
 * Attraction less, Discovery least — encoded in `strength`.
 */
import type {
  AttractionGrade,
  DiscoveryGrade,
  DnaSignal,
  ExperienceGrade,
  PreferenceEvent,
  PrimaryAction,
  ReasonCode,
} from './types';

/** Post-watch grades → signal. Experience is the strongest channel. */
const EXPERIENCE: Record<ExperienceGrade, DnaSignal> = {
  loved: { channel: 'experience', polarity: 1, strength: 1.6, decay: 'permanent' },
  liked: { channel: 'experience', polarity: 1, strength: 1.1, decay: 'permanent' },
  okay: { channel: 'experience', polarity: 1, strength: 0.35, decay: 'permanent' },
  disliked: { channel: 'experience', polarity: -1, strength: 1.1, decay: 'permanent' },
  hated: { channel: 'experience', polarity: -1, strength: 1.6, decay: 'permanent' },
  dnf: { channel: 'experience', polarity: -1, strength: 1.3, decay: 'permanent' },
};

/** Pre-watch reactions → signal. Attraction measures pull, not enjoyment. */
const ATTRACTION: Record<AttractionGrade, DnaSignal> = {
  must_watch: { channel: 'attraction', polarity: 1, strength: 1.1, decay: 'permanent' },
  interested: { channel: 'attraction', polarity: 1, strength: 0.8, decay: 'permanent' },
  maybe_interested: { channel: 'attraction', polarity: 1, strength: 0.3, decay: 'permanent' },
  not_interested: { channel: 'attraction', polarity: -1, strength: 0.8, decay: 'permanent' },
  absolutely_not: { channel: 'attraction', polarity: -1, strength: 1.2, decay: 'permanent' },
};

/** Curiosity reactions → signal. Discovery also nudges novelty appetite. */
const DISCOVERY: Record<DiscoveryGrade, DnaSignal> = {
  never_heard_interested: { channel: 'discovery', polarity: 1, strength: 0.5, decay: 'permanent', novelty: 0.6 },
  know_but_skipped: { channel: 'discovery', polarity: -1, strength: 0.4, decay: 'mood', novelty: -0.1 },
  want_more_like_this: { channel: 'discovery', polarity: 1, strength: 0.9, decay: 'permanent', novelty: 0.4 },
  dont_show_like_this: { channel: 'discovery', polarity: -1, strength: 1.0, decay: 'permanent', novelty: -0.5 },
};

/** The four primary buttons → default grade in their channel. `skip` = null. */
const PRIMARY_DEFAULT: Record<Exclude<PrimaryAction, 'skip'>, DnaSignal> = {
  seen_liked: EXPERIENCE.liked,
  seen_disliked: EXPERIENCE.disliked,
  unseen_interested: ATTRACTION.interested,
  unseen_not_interested: ATTRACTION.not_interested,
};

export function experienceSignal(grade: ExperienceGrade): DnaSignal {
  return EXPERIENCE[grade];
}
export function attractionSignal(grade: AttractionGrade): DnaSignal {
  return ATTRACTION[grade];
}
export function discoverySignal(grade: DiscoveryGrade): DnaSignal {
  return DISCOVERY[grade];
}

/**
 * Follow-up reason → an ADDITIONAL targeted signal (or null for no-taste-effect).
 * Mood reasons decay; permanent reasons strengthen specific traits. The reason is
 * always a rejection (attached to a negative action), so it pushes AWAY from the
 * implicated trait: e.g. "too slow" ⇒ prefers fast pacing (dim target high).
 */
export function reasonSignal(reason: ReasonCode): DnaSignal | null {
  switch (reason) {
    // Dimension-targeted permanent preferences (reject slow ⇒ want the far pole).
    case 'too_slow':
      return { channel: 'attraction', polarity: 1, strength: 0.9, decay: 'permanent', dims: [{ key: 'pacing', target: 100 }] };
    case 'too_violent':
      return { channel: 'attraction', polarity: 1, strength: 1.0, decay: 'permanent', dims: [{ key: 'violence', target: 0 }] };
    case 'too_scary':
      return { channel: 'attraction', polarity: 1, strength: 0.9, decay: 'permanent', dims: [{ key: 'suspense', target: 20 }, { key: 'darkness', target: 30 }] };
    case 'looks_confusing':
      return { channel: 'attraction', polarity: 1, strength: 0.8, decay: 'permanent', dims: [{ key: 'complexity', target: 25 }] };
    case 'too_childish':
      return { channel: 'attraction', polarity: 1, strength: 0.7, decay: 'permanent', dims: [{ key: 'complexity', target: 70 }] };
    case 'romance':
      return { channel: 'attraction', polarity: 1, strength: 0.9, decay: 'permanent', dims: [{ key: 'romance', target: 0 }] };
    // Genre-targeted permanent rejections.
    case 'animation':
      return { channel: 'attraction', polarity: -1, strength: 1.0, decay: 'permanent', genres: ['animation'] };
    case 'supernatural':
      return { channel: 'attraction', polarity: -1, strength: 1.0, decay: 'permanent', genres: ['supernatural'] };
    case 'sci_fi':
      return { channel: 'attraction', polarity: -1, strength: 1.0, decay: 'permanent', genres: ['science_fiction'] };
    case 'genre':
      // Generic "wrong genre" — reject the title's own genres (filled from event).
      return { channel: 'attraction', polarity: -1, strength: 0.8, decay: 'permanent', useTitleGenres: true };
    // Person rejection — the flagged person(s) come from the event.
    case 'actor':
      return { channel: 'attraction', polarity: -1, strength: 0.9, decay: 'permanent', useTitlePeople: true };
    // Presentation-only: informs click/attraction surface, NOT taste dims.
    case 'poster':
    case 'description':
      return { channel: 'attraction', polarity: -1, strength: 0.5, decay: 'mood', presentationOnly: true };
    // Curiosity / mood — no permanent taste penalty.
    case 'already_know_story':
      return { channel: 'discovery', polarity: -1, strength: 0.4, decay: 'permanent', novelty: 0.2 };
    case 'not_in_the_mood':
      return { channel: 'attraction', polarity: -1, strength: 0.3, decay: 'mood' };
    case 'other':
      return null;
    default:
      return null;
  }
}

/**
 * Resolve an event's primary signal. A richer grade (experience/attraction/
 * discovery) overrides the button default. `skip` yields null (zero DNA).
 */
export function primarySignal(event: PreferenceEvent): DnaSignal | null {
  if (event.experienceGrade) return experienceSignal(event.experienceGrade);
  if (event.attractionGrade) return attractionSignal(event.attractionGrade);
  if (event.discoveryGrade) return discoverySignal(event.discoveryGrade);
  if (event.action === 'skip') return null;
  return PRIMARY_DEFAULT[event.action];
}
