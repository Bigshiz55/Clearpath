/**
 * Phase 4 — frozen user profiles, subscriptions, and viewing history.
 *
 * A profile bundles everything the pipeline reconstructs at request time:
 * the deterministic `PersonalContext` (label + preference rules), the user's
 * subscriptions (`my_services`), a learned dimension profile (for ranking),
 * and viewing history / likes / dislikes / rejections (so "nothing I've
 * watched / rejected" constraints and previously-* leakage can be graded).
 */
import type { PersonalContext } from '@/lib/scoring/personal';
import type { PreferenceRule } from '@/lib/types';
import { SCOTT_RULES } from '@/lib/scoring/preferences';

export interface HistoryEntry {
  id: string; // `${mediaType}-${tmdbId}`
  rating: number | null; // 1..10
  status: 'watched' | 'dropped' | 'rejected';
}

export interface EvalProfile {
  key: string;
  displayName: string;
  region: string;
  timezone: string;
  /** TMDB provider ids the user subscribes to. */
  subscriptions: number[];
  personal: PersonalContext;
  /** Learned 15-axis dimension profile (pref 0..100 per axis). Optional. */
  dimensionProfile?: Record<string, number>;
  history: HistoryEntry[];
  /** Named household co-watchers this profile can be combined with. */
  household: string[];
}

// A lighter rule set for a co-watcher who leans warm/comedic and is
// supernatural-averse but fine with sci-fi (so household compat differs from Scott).
const HEATHER_RULES: PreferenceRule[] = [
  { trait: 'supernatural', weight: -16, requiresDefining: true, label: 'No supernatural' },
  { trait: 'domestic_thriller', weight: 8, requiresDefining: false, label: 'Domestic thrillers' },
];

export const PROFILES: Record<string, EvalProfile> = {
  scott: {
    key: 'scott',
    displayName: 'Scott',
    region: 'US',
    timezone: 'America/New_York',
    subscriptions: [8, 9, 337], // Netflix, Prime, Disney+
    personal: { label: 'Scott Match', rules: SCOTT_RULES, likedFranchiseIds: [], collectionId: null },
    dimensionProfile: { realism: 82, darkness: 62, pacing: 58, suspense: 72, complexity: 66, warmth: 40 },
    history: [
      { id: 'movie-3003', rating: 9, status: 'watched' }, // loved The Quiet Patient
      { id: 'movie-3006', rating: 3, status: 'rejected' }, // rejected the noir
      { id: 'movie-2005', rating: null, status: 'watched' }, // already saw a Lifetime one
    ],
    household: ['heather'],
  },
  heather: {
    key: 'heather',
    displayName: 'Heather',
    region: 'US',
    timezone: 'America/New_York',
    subscriptions: [8, 337],
    personal: { label: 'Heather Match', rules: HEATHER_RULES, likedFranchiseIds: [], collectionId: null },
    dimensionProfile: { warmth: 78, humor: 66, darkness: 35, realism: 60 },
    history: [{ id: 'movie-3005', rating: 8, status: 'watched' }],
    household: ['scott'],
  },
  // A cold-start user with no history and no subscriptions — tests weak-DNA and
  // "no valid results / honest empty" behaviour.
  newbie: {
    key: 'newbie',
    displayName: 'Alex',
    region: 'US',
    timezone: 'America/Chicago',
    subscriptions: [],
    personal: { label: 'Your match', rules: [], likedFranchiseIds: [], collectionId: null },
    history: [],
    household: [],
  },
};

export function profile(key: string): EvalProfile {
  const p = PROFILES[key];
  if (!p) throw new Error(`Unknown eval profile: ${key}`);
  return p;
}

/** Household preference context: intersect two members' rules (compat scoring). */
export function householdContext(a: EvalProfile, b: EvalProfile): PersonalContext {
  return {
    label: `${a.displayName} & ${b.displayName}`,
    // A co-watch context keeps BOTH members' hard-averse (requiresDefining)
    // penalties and the union of positive boosts — a title either can't stand
    // is demoted for the pair.
    rules: [...a.personal.rules, ...b.personal.rules],
    likedFranchiseIds: [],
    collectionId: null,
  };
}
