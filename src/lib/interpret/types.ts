/**
 * THE CANONICAL RECOMMENDATION INTENT.
 *
 * One structure, produced from raw user language BEFORE anything decides which
 * provider or serving mode will execute it. The same sentence must mean the
 * same thing under `legacy`, `shadow` and `anthropic` — so interpretation sits
 * ABOVE that choice rather than inside any one branch of it.
 *
 * WHY A RICH MODEL RATHER THAN A BAG OF SEARCH TERMS. The defect this exists to
 * fix is meaning with nowhere to go: when the only output slot is "search
 * terms", every noun in a sentence becomes one, and "beef burrito" is suddenly
 * a search keyword competing with "boxing". Every distinct thing a person can
 * mean needs its own field, or interpretation is lossy by construction. If a
 * meaning is understood and has no home here, that is an architecture defect
 * and this file is where it gets fixed.
 *
 * WHAT THIS LAYER MAY NOT DO. It never resolves an entity. It emits the SPAN a
 * person or title was named by — "Sylvester Stallone", "Rocky" — and never a
 * TMDB id, a credit, a genre id, a provider id, a runtime or a release date.
 * Those are facts about the world, and only deterministic code that actually
 * queried the world may assert them. Interpretation understands; WatchVerd1ct
 * verifies.
 *
 * PURE. No I/O, no clock, no randomness.
 */

/** What kind of thing is being asked for. */
export type MediaIntent = 'movie' | 'tv' | 'either';

/** How a named title relates to the request. */
export type ReferenceRelation =
  /** "I liked Rocky" — evidence about taste, not a request for Rocky. */
  | 'liked'
  /** "I hated Sinister" — negative evidence. */
  | 'disliked'
  /** "I've seen Creed" — familiarity only; no taste claim either way. */
  | 'seen'
  /** "Something like Heat" — asks for neighbours of it. */
  | 'similar'
  /** "Better than Rocky" — a bar to clear, not a neighbourhood. */
  | 'betterThan'
  /** "Not another Rocky movie" — explicitly ruled out. */
  | 'excluded'
  /** "Show me Rocky" — the title IS the answer. Not a recommendation request. */
  | 'requested';

export interface TitleReference {
  /** Exactly as the user named it. Resolution happens downstream. */
  span: string;
  relation: ReferenceRelation;
}

/** How a named person relates to the request. */
export type PersonRelation = 'required' | 'excluded';

/** The credit role, when the sentence actually says. Never guessed. */
export type CreditRole = 'actor' | 'director' | 'creator' | 'any';

export interface PersonReference {
  span: string;
  relation: PersonRelation;
  role: CreditRole;
}

/** Whose preference a constraint belongs to. */
export type Holder =
  /** The person typing. */
  | 'user'
  /** Someone else watching with them — a constraint, not the user's taste. */
  | 'companion';

export interface ToneConstraint {
  /** A word the user actually used: "funny", "dark", "weird". */
  term: string;
  /** `false` means they asked to avoid it. */
  wanted: boolean;
  holder: Holder;
}

export interface SubjectConstraint {
  span: string;
  wanted: boolean;
}

export interface GenreConstraint {
  span: string;
  wanted: boolean;
  holder: Holder;
}

/** A clause the interpreter recognised and deliberately did not execute on. */
export interface BackgroundClause {
  text: string;
  /**
   * Why it was set aside. Recorded rather than dropped silently so the
   * behaviour is inspectable and testable — "we ignored this, on purpose".
   */
  reason: 'no-request-signal';
}

export interface DateConstraint {
  /** Inclusive release-year bounds, when the sentence states or implies them. */
  minYear?: number;
  maxYear?: number;
  /** "newer" / "older" with no anchor — resolved later against a reference. */
  relative?: 'newer' | 'older';
}

export interface RuntimeConstraint {
  maxMinutes?: number;
  minMinutes?: number;
}

/**
 * THE WHOLE MEANING OF ONE REQUEST.
 *
 * Fields are independent on purpose: a sentence can carry a liked reference, a
 * required subject, an excluded genre and a companion's veto at once, and
 * collapsing any pair of those loses a distinction the user actually drew.
 */
export interface CanonicalIntent {
  /** Is this a recommendation request at all, or a lookup / a statement? */
  kind: 'recommendation' | 'lookup' | 'statement';
  media: MediaIntent;
  /** How many results were asked for. `null` = unspecified, never a default. */
  requestedCount: number | null;
  subjects: SubjectConstraint[];
  genres: GenreConstraint[];
  tones: ToneConstraint[];
  people: PersonReference[];
  titles: TitleReference[];
  /** Provider/network names exactly as said: "Netflix", "Max". */
  providers: string[];
  date: DateConstraint;
  runtime: RuntimeConstraint;
  /** "I've already seen Creed" — exclude things the user has watched. */
  excludeSeen: boolean;
  /** Clauses recognised as conversational background and not executed on. */
  background: BackgroundClause[];
  /** The clause the request itself was read from. Empty for a pure statement. */
  requestClause: string;
}

export const EMPTY_INTENT: CanonicalIntent = {
  kind: 'statement',
  media: 'either',
  requestedCount: null,
  subjects: [],
  genres: [],
  tones: [],
  people: [],
  titles: [],
  providers: [],
  date: {},
  runtime: {},
  excludeSeen: false,
  background: [],
  requestClause: '',
};

/**
 * The fields that decide WHAT IS RETRIEVED AND SHOWN.
 *
 * The metamorphic property is stated against exactly this projection: adding
 * irrelevant conversation may change `background` (it should — the clause was
 * seen and set aside) but must not change one field here. Defining the
 * executable surface explicitly is what makes "materially equivalent" a
 * testable claim rather than a matter of opinion.
 */
export interface ExecutableIntent {
  kind: CanonicalIntent['kind'];
  media: MediaIntent;
  requestedCount: number | null;
  subjects: SubjectConstraint[];
  genres: GenreConstraint[];
  tones: ToneConstraint[];
  people: PersonReference[];
  titles: TitleReference[];
  providers: string[];
  date: DateConstraint;
  runtime: RuntimeConstraint;
  excludeSeen: boolean;
}

export function executable(intent: CanonicalIntent): ExecutableIntent {
  const { background: _background, requestClause: _requestClause, ...rest } = intent;
  return rest;
}
