/**
 * Court "Genre Draft" engine — shared types. PURE data (no I/O). These describe the
 * candidate titles, participants (with their Watch DNA), the generated decks, and
 * the group-scoring output. The proprietary weighting lives in `groupScore.ts` and
 * is never imported by client code.
 */
import type { TitleDimensions, DimensionProfile } from '@/lib/scoring/dimensions';

export type CourtMediaType = 'movie' | 'tv';

/** A candidate title, already enriched with everything the engine needs. */
export interface CourtCandidate {
  /** Stable dedup key, e.g. "movie-603". */
  key: string;
  id: number;
  mediaType: CourtMediaType;
  title: string;
  year: number | null;
  /** Minutes (movie) or typical episode length (tv); null when unknown. */
  runtime: number | null;
  /** Collection/franchise id so we can avoid stacking a deck with one franchise. */
  franchise?: string | null;
  genreIds: number[];
  /** The title's interpretable fingerprint (0..100 per axis); may be absent. */
  dimensions?: TitleDimensions | null;
  /** True when available on the room's allowed services in the region. */
  available: boolean;
  providers?: string[];
}

/** A juror and their taste signals. */
export interface CourtParticipant {
  id: string;
  name: string;
  /** Their learned Watch DNA profile (axis prefs/weights); absent for cold-start. */
  profile?: DimensionProfile | null;
  /** Candidate keys this juror already loves (personalization + novelty). */
  love?: string[];
  /** Candidate keys the juror has already watched. */
  watched?: string[];
  mood?: string;
}

export interface DeckFilters {
  mediaType: 'movie' | 'tv' | 'any';
  genreId?: number | null;
  maxRuntime?: number | null;
  /** Drop titles a juror has already watched. */
  avoidWatched?: boolean;
  /** Require availability on the room's services (default true). */
  requireAvailable?: boolean;
  /** Max titles from one franchise in a single deck (default 1). */
  maxPerFranchise?: number;
}

export type DeckSlotKind = 'shared' | 'personalized' | 'wildcard' | 'divisive';

export interface DeckSlot {
  candidate: CourtCandidate;
  kind: DeckSlotKind;
}

export interface Deck {
  participantId: string;
  slots: DeckSlot[];
}

/** A juror's ranked top-3 (rank 1 = strongest). */
export interface RankedPick {
  key: string;
  rank: 1 | 2 | 3;
}

export type VetoKind = 'preference' | 'content';
export interface Veto {
  key: string;
  kind: VetoKind;
}

export interface CourtSelections {
  picks: Record<string, RankedPick[]>; // participantId -> ranked top 3
  vetoes?: Record<string, Veto[]>; // participantId -> up to 2 vetoes
}

/** Per-candidate breakdown — separate values, as specified. */
export interface CandidateScore {
  key: string;
  candidate: CourtCandidate;
  avgSatisfaction: number; // 0..100
  lowestSatisfaction: number; // 0..100 (fairness to least-satisfied juror)
  agreementScore: number; // 0..100 (how aligned the jury is)
  vetoPenalty: number; // >= 0, subtracted
  discoveryBonus: number; // 0..~15
  availabilityConfidence: number; // 0..1
  finalScore: number; // 0..100 (or -Infinity when eliminated)
  eliminated: boolean;
  /** Per-juror predicted satisfaction 0..100, keyed by participant id. */
  perParticipant: Record<string, number>;
}

export interface CourtVerdict {
  ranked: CandidateScore[];
  winner: CandidateScore | null;
  runnerUp: CandidateScore | null;
  wildcard: CandidateScore | null;
}
