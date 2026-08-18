import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType } from '@/lib/types';
import { loadPreferenceCached } from '@/lib/preference/store';
import { hasPreferenceSignal, preferenceNudge } from '@/lib/preference/rank';
import { explainTitle } from '@/lib/preference/explain';
import { genreSlug } from '@/lib/preference/genreCalibration';
import { getCachedDimensions, getUserDimensionProfile } from '@/lib/titleDimensions';
import { dimensionMatch } from '@/lib/scoring/dimensions';
import { personalSignal, type PersonalSignal } from './personalSignal';

/**
 * THE PERSONALIZATION BRIDGE — the I/O half.
 *
 * ── THE GAP THIS CLOSES ───────────────────────────────────────────────────
 * `/app/watch` and `/browse?sort=foryou` have ranked by Taste DNA for a long
 * time. Ask never did: `finder.ts` sorted on `matchScore`, the deterministic
 * QUALITY verdict, and `rankByDna`, `preferenceNudge` and the dimension profile
 * appeared nowhere in its imports. WatchVerd1ct knew the person and did not use
 * what it knew on the one surface where they were asking a question.
 *
 * ── WHY NOT SIMPLY CALL rankByDna ─────────────────────────────────────────
 * Because half of it is paid. `rankByDna` blends an EMBEDDING channel
 * (`getTitleVector` → `embed()`, billed per title on a cache miss) with a
 * cache-only channel (dimension fingerprints + explicit preference). Ask is a
 * bulk path, and CLAUDE.md forbids per-title LLM calls there.
 *
 * So this reuses the FREE channel and only that one — the same functions, the
 * same bounds, the same evidence — and skips the embedding. `rankByDna`'s own
 * comment already names the split: "ZERO AI when there's no embedding
 * Taste-DNA: the preference path needs only cached dims + metadata, never an
 * embedding."
 *
 * ── COST: O(1) QUERIES, NOT O(CANDIDATES) ─────────────────────────────────
 * Three reads per REQUEST, regardless of pool size — the preference log (one
 * indexed query, memoized), the user's dimension profile (memoized), and one
 * batched fingerprint lookup for the whole pool. Everything after that is pure
 * arithmetic on data the finder already fetched. No N+1, no per-title network
 * call, no embedding, and — see `backfill: false` below — no classification.
 */

/** What a candidate must expose for the free channel to read it. */
export interface PersonalizableItem {
  id: number;
  mediaType: MediaType;
  /** Objective/quality score the candidate already earned. */
  matchScore: number;
  /** TMDB genre names, captured during scoring — no refetch. */
  genreNames?: string[];
}

export type Personalized<T> = T & { personal: PersonalSignal };

/** The shape returned when nothing about this user could participate. */
function inert<T extends PersonalizableItem>(items: readonly T[]): Personalized<T>[] {
  return items.map((i) => ({
    ...i,
    personal: personalSignal({
      objective: i.matchScore,
      dimMatch: null,
      prefNudge: 0,
      reasons: [],
      concerns: [],
      explainConfidence: 0,
    }),
  }));
}

/**
 * Attach a personal signal to every candidate handed over.
 *
 * This returns exactly the items it was given — it maps, it never filters — so
 * it cannot add a title to the answer or save one from being dropped. That is
 * the whole of its relationship to eligibility, and it is deliberate: the
 * person/media gate (`qualifyCandidates`) runs downstream of the ranking and
 * judges each candidate on its own facts, so a second copy of the eligibility
 * rule here would be the duplication the last phase removed.
 */
export async function personalizeCandidates<T extends PersonalizableItem>(
  supabase: SupabaseClient,
  userId: string | null,
  items: readonly T[],
  opts: { now?: number } = {},
): Promise<Personalized<T>[]> {
  if (!userId || items.length === 0) return inert(items);

  try {
    const now = opts.now ?? Date.now();
    const pref = await loadPreferenceCached(supabase, userId, now);
    const hasPref = pref != null && hasPreferenceSignal(pref.dna);

    const [profile, dimsMap] = await Promise.all([
      /* `backfill: false` IS THE POINT, not a tuning knob. The default profile
         build classifies up to BACKFILL_CAP missing fingerprints with a paid
         gpt-4o-mini call, inside the request. That is fine on /app/dna, which
         builds a profile deliberately; it is exactly the LLM-in-a-listing-path
         CLAUDE.md forbids. Ask reads the fingerprints that are already cached
         and accepts a thinner profile rather than an unpriced request. */
      getUserDimensionProfile(supabase, userId, 0, { backfill: false }).catch(() => null),
      getCachedDimensions(items.map((i) => ({ tmdb_id: i.id, media_type: i.mediaType }))).catch(
        () => new Map(),
      ),
    ]);
    const useDims = (profile?.samples ?? 0) > 0;

    // Nothing on file that could touch these titles → honest no-op, and the
    // quality order stands exactly as it did.
    if (!hasPref && !useDims) return inert(items);

    return items.map((i) => {
      const dims = dimsMap.get(`${i.mediaType}-${i.id}`);
      const genres = (i.genreNames ?? []).map(genreSlug);
      const dimMatch = useDims && dims && profile ? dimensionMatch(dims, profile) : null;
      const prefNudge =
        hasPref && dims ? preferenceNudge({ dims, genres }, pref.dna, { corrections: pref.corrections }).nudge : 0;
      /* THE EVIDENCE COMES FROM THE USER'S OWN HISTORY, not from prose.
         `explainTitle` names the axes and genres this person actually rates,
         which is what makes "you tend to avoid slow burns" a citation rather
         than a flourish. */
      const explained = hasPref
        ? explainTitle({ dims, genres }, pref.dna)
        : { reasons: [], concerns: [], confidence: 0 };

      return {
        ...i,
        personal: personalSignal({
          objective: i.matchScore,
          dimMatch,
          prefNudge,
          reasons: explained.reasons,
          concerns: explained.concerns,
          explainConfidence: explained.confidence,
        }),
      };
    });
  } catch {
    /* Personalization is an improvement, never a dependency. Any failure
       returns the quality order untouched rather than an error page. */
    return inert(items);
  }
}
