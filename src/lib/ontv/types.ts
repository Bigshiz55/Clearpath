/**
 * On TV — clean data contracts. PURE types. Schedule data (Airing/Channel) is kept
 * SEPARATE from title metadata (Program) so an airing never duplicates a full title
 * record. `PersonalizedAiring` is the join the UI consumes.
 *
 * Extensibility: `EventType` is a general content/event model. Sports is a KNOWN
 * type that is EXCLUDED in this phase (see sports.ts) — adding it later means
 * flipping the exclusion + adding sports-specific enrichment, NOT rebuilding.
 */

/** General event/content taxonomy. `sports` exists so it can be filtered cleanly
 *  now and enabled later without a schema change. */
export type EventType =
  | 'movie' | 'episode' | 'special' | 'documentary' | 'news' | 'kids'
  | 'awards' | 'live_event' | 'sports' | 'other';

export interface Channel {
  id: string;              // stable channel id (callSign or provider id)
  name: string;
  callSign: string;
  logo: string | null;
  network: string | null;  // e.g. "CBS"
  channelNumber: string | null;
  region: string | null;
  providerIds: string[];
  isFavorite: boolean;
  isHidden: boolean;
}

export interface Program {
  id: string;              // universal content id (e.g. "movie:603" or "show:1396")
  title: string;
  episodeTitle: string | null;
  mediaType: 'movie' | 'tv';
  eventType: EventType;
  seasonNumber: number | null;
  episodeNumber: number | null;
  genres: string[];
  synopsis: string | null;
  artwork: string | null;  // poster/backdrop url
  ratings: { imdb?: number | null; rt?: number | null; audience?: number | null } | null;
  cast: string[];
  runtime: number | null;  // minutes
  contentWarnings: string[];
  contentRating: string | null; // e.g. "TV-14", "PG-13"
}

export interface Airing {
  id: string;              // stable airing id (channel+content+startAt) — alerts key off this
  contentId: string;       // → Program.id (no full record duplicated here)
  channelId: string;       // → Channel.id
  startAt: string;         // ISO UTC
  endAt: string;           // ISO UTC
  isLive: boolean;
  isNew: boolean;
  isRepeat: boolean;
  restartAvailable: boolean;
  onDemandAvailable: boolean;
  streamingLaterAvailable: boolean;
  sourceUpdatedAt: string; // ISO UTC — freshness
}

export type VerdictBand = 'stream' | 'maybe' | 'skip' | 'unknown';

export interface JoiningLateAssessment {
  /** yes = worth joining · maybe = better from the start · no = too much missed. */
  verdict: 'yes' | 'maybe' | 'no' | 'not_started';
  reasonKey: string;       // canonical, localizable
  reason: string;          // human-readable (English default)
  minutesElapsed: number;
  percentElapsed: number;
  restartAvailable: boolean;
  onDemandLater: boolean;
}

export interface MatchExplanation {
  /** True when the score leans on general quality rather than established taste. */
  generalQuality: boolean;
  reasons: string[];
}

export interface PersonalizedAiring {
  airing: Airing;
  program: Program;
  channel: Channel;
  matchScore: number;      // 0..100
  verdict: VerdictBand;
  match: MatchExplanation;
  joiningLate: JoiningLateAssessment | null; // null when not currently airing
  /** derived, computed at render time against `now` (see time.ts). */
  status: AiringStatus;
}

export interface AiringStatus {
  state: 'on_now' | 'starting_soon' | 'upcoming' | 'ended';
  minutesUntilStart: number; // negative once started
  minutesRemaining: number | null; // null when not airing
  percentElapsed: number | null;
}

/** Structured constraints a natural-language TV query resolves to. Hard filters
 *  here are applied BEFORE personalized ranking (see rank.ts). */
export interface ScheduleQuery {
  intent: 'live_schedule_search';
  mediaTypes: ('movie' | 'tv')[];   // empty = any
  eventTypesExclude: EventType[];    // always includes 'sports' this phase
  dateScope: 'now' | 'today' | 'tonight' | 'late_night' | 'tomorrow' | 'weekend';
  startTimeMin: string | null;       // "20:00" local
  startTimeMax: string | null;
  withinMinutes: number | null;      // "starts in N minutes"
  networks: string[];                // requested channels/networks
  availabilityScope: 'all' | 'user_channels' | 'user_services' | 'free';
  minMatch: number | null;           // "rate over 80"
  maxRuntime: number | null;         // "under two hours"
  newOnly: boolean;
  noNews: boolean;
  noReality: boolean;
  noReruns: boolean;
  familyFriendly: boolean;
  noHorror: boolean;
  englishAudioOnly: boolean;
  household: string[];               // profile ids for group matching (empty = solo)
  sort: 'personalized_match' | 'start_time' | 'quality';
}
