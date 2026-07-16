// Client-safe shapes for the "put a named title on trial" flow — shared by the
// /api/ask route, the server logic (askJudge.ts), and the UI.
import type { MediaType } from '@/lib/types';
import type { TileRatings } from '@/lib/ratings';

export interface JudgeFactor {
  label: string; // e.g. "Nordic noir"
  points: number; // signed contribution to the personal score
  defining: boolean; // a hard love/avoid that dominates
  reason: string; // human explanation
}

export interface TitleVerdict {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterUrl: string | null;
  posterPath: string | null;
  scoredFor: string; // e.g. "Big Shiz match"
  primaryCall: string; // WATCH IT / MAYBE / SKIP IT
  tier: string;
  matchScore: number; // personal
  generalScore: number; // Standard Score
  oneLiner: string;
  reasonsFor: string[];
  reasonsAgainst: string[];
  keyFactors: JudgeFactor[]; // the rules that actually fired — the "parameters"
  english: 'native' | 'available' | 'subtitles' | 'unknown';
  where: string | null;
  ratings: TileRatings;
  deciderUrl: string;
}

export interface AltItem {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
  matchScore: number;
  primaryCall: string;
  reason: string;
  where: string | null;
  deciderUrl: string;
  ratings?: TileRatings;
}
