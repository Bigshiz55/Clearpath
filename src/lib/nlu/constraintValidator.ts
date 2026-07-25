/**
 * HARD-CONSTRAINT VALIDATOR (pure). The step that was missing: every candidate
 * is validated against every hard constraint and REMOVED if it fails, BEFORE any
 * personalization ranking. A high Match score can never override media type or
 * source. Enforces the non-negotiable order: validate → dedupe → rank valid →
 * fill → honest shortfall. No unsafe fallback (never substitutes unrelated
 * content to avoid an empty result). No I/O; unit-tested.
 */
import { mediaTypeSatisfies } from '@/lib/nlu/mediaOntology';
import type { QueryPlan } from '@/lib/nlu/queryPlan';

export interface Candidate {
  id: string; // `${mediaType}-${tmdbId}`
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  matchScore?: number;
  /** Verified availability evidence: linear-network keys the title airs on. */
  availableNetworks?: string[];
  /** Verified availability evidence: TMDB streaming provider ids. */
  availableProviderIds?: number[];
}

export interface ConstraintFailure {
  constraint: 'mediaType' | 'source' | 'uniqueness';
  expected: string;
  actual: string;
}

export interface Validation {
  candidateId: string;
  valid: boolean;
  failures: ConstraintFailure[];
}

/** Validate ONE candidate against a plan's hard constraints. */
export function validateCandidate(c: Candidate, plan: QueryPlan): Validation {
  const failures: ConstraintFailure[] = [];

  // Media type — a "movies" request can never be satisfied by a TV series.
  if (plan.mediaTypes.length > 0) {
    const ok = plan.mediaTypes.some((mt) => mediaTypeSatisfies(mt, c.mediaType));
    if (!ok) failures.push({ constraint: 'mediaType', expected: plan.mediaTypes.join('|'), actual: c.mediaType });
  }

  // Source — the title needs verified availability evidence for a required
  // source. Absence of evidence is a FAILURE (never assume availability).
  const required = plan.sources.filter((s) => s.required);
  if (required.length > 0) {
    const nets = (c.availableNetworks ?? []).map((n) => n.toLowerCase());
    const provs = c.availableProviderIds ?? [];
    const anySatisfied = required.some((s) =>
      (s.networkKey && nets.includes(s.networkKey.toLowerCase())) ||
      (s.providerId != null && provs.includes(s.providerId)),
    );
    if (!anySatisfied) {
      failures.push({ constraint: 'source', expected: required.map((s) => s.canonicalName).join('|'), actual: nets.concat(provs.map(String)).join(',') || 'no evidence' });
    }
  }

  return { candidateId: c.id, valid: failures.length === 0, failures };
}

export interface EnforceResult {
  results: Candidate[]; // valid, deduped, ranked, capped to count
  rejected: { candidate: Candidate; failures: ConstraintFailure[] }[];
  requested: number | null;
  fulfilled: number;
  shortfall: number; // requested - fulfilled (0 when met/unspecified)
  message: string | null; // honest shortfall statement
}

/**
 * The full pipeline in the mandated order. Filters BEFORE ranking, dedupes,
 * ranks the survivors by Match score, fills to the requested count, and reports
 * any shortfall honestly. Never adds an invalid candidate to reach the count.
 */
export function enforcePlan(candidates: Candidate[], plan: QueryPlan): EnforceResult {
  const rejected: EnforceResult['rejected'] = [];
  const valid: Candidate[] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    if (plan.uniqueResults && seen.has(c.id)) continue; // dedupe
    const v = validateCandidate(c, plan);
    if (!v.valid) { rejected.push({ candidate: c, failures: v.failures }); continue; }
    seen.add(c.id);
    valid.push(c);
  }

  // Personalization ranking happens ONLY on the validated set.
  valid.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

  const requested = plan.count.requested;
  const capped = requested != null ? valid.slice(0, requested) : valid;
  const fulfilled = capped.length;
  const shortfall = requested != null ? Math.max(0, requested - fulfilled) : 0;

  let message: string | null = null;
  if (shortfall > 0) {
    const src = plan.sources[0]?.canonicalName;
    const media = plan.mediaTypes[0] ?? 'title';
    message = src
      ? `I found only ${fulfilled} verified ${src} ${media}${fulfilled === 1 ? '' : 's'} matching your request.`
      : `I found only ${fulfilled} of ${requested} matching your request.`;
  }

  return { results: capped, rejected, requested, fulfilled, shortfall, message };
}
