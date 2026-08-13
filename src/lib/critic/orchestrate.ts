/**
 * THE CRITIC PIPELINE, ASSEMBLED — GC1.
 *
 * Every stage already existed and every stage was unreachable from production.
 * This is the single place that runs them in order and carries the result to
 * the boundary immediately before final ranking:
 *
 *   parseCriticRequest   language  -> structured request      (request.ts)
 *   resolveAnchor        strings   -> real identities         (GC2)
 *   hydrateAnchors       identity  -> canonical fingerprint   (GC3)
 *   buildPlan            facts     -> per-axis instructions   (GC4)
 *   planToHints          plan      -> legitimate searches     (GC5)
 *
 * ── WHY IT LIVES HERE AND NOT IN THE ROUTE ────────────────────────────────
 * `/api/ask` ORCHESTRATES; it does not reason. Reconstructing any of this
 * inline would give the route a second, drifting copy of semantics that already
 * have a tested home — and it is exactly how the conversational path and the
 * discovery path came to disagree about what a reference title means. One
 * function, called by both.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
 * It does not rank. `rankWithPreference` has no production caller (proved in
 * `productionWiring.test.ts`), so wiring the plan into final ordering is GC6's
 * job and is NOT quietly done here. This function's output stops at the
 * candidate pool, and `attribution.finalRankingConsumesPlan` records that fact
 * as data rather than leaving it to be assumed.
 *
 * I/O ONLY THROUGH INJECTED LOADERS. No TMDB import, no Supabase import, no
 * model call — the route supplies `searchCandidates` and `loadDimensions`, which
 * is what keeps this testable against the real orchestration without a network.
 */

import type { DnaState } from '@/lib/preference/types';
import { resolveAnchor, anchorsToObjective, type AnchorCandidate, type AnchorResolution } from './anchor';
import { hydrateAnchors, type DimensionLoader } from './hydrate';
import { buildPlan, type CriticPlan } from './plan';
import { planToHints, type CriticRetrievalHints, type HardConstraints } from './retrieval';
import type { CriticRequest } from './request';
import type { CriticObjective, ResolvedAnchor } from './objective';

/** Structured evidence a developer can inspect. NOT chain-of-thought. */
export interface CriticAttribution {
  relation: string;
  cue: string;
  /** What the user named, in order, exactly as typed. */
  requestedAnchors: string[];
  /** GC2 outcome per anchor — `resolved` / `ambiguous` / `not_found`. */
  resolution: { spokenAs: string; status: string; titleId?: string }[];
  /** GC3 outcome — whether a canonical fingerprint was actually attached. */
  hydrated: { titleId: string; hydrated: boolean }[];
  /** GC4 — grounded per-axis instructions with their provenance. */
  planInstructions: { axis: string; kind: string; target: number; evidence: string[] }[];
  /** GC5 — the searches issued, by label. */
  strands: string[];
  /** Axes the critic reasoned about that retrieval structurally cannot express. */
  rankingOnlyAxes: string[];
  /** Modifiers recognised as directional but not groundable in an axis. */
  unresolvedModifiers: string[];
  objectiveAuthority: number;
  /** Candidate ids that reached the final-ranking boundary. */
  candidateIds: string[];
  /**
   * GC6 STATUS, CARRIED AS DATA — and it is a REPORT, never a claim.
   *
   * `buildCriticState` stops at the candidate pool by design, so it always
   * leaves this at the honest default. The ranking call site sets it to
   * whatever `rankCriticCandidates` actually did: true only when a plan with
   * positive authority genuinely ordered the response, false when the critic
   * had nothing to say and the existing Finder order was returned untouched.
   *
   * A boolean is much harder to overlook than a paragraph in a ledger, and the
   * whole risk of this workstream is claiming a wiring that does not exist.
   */
  finalRankingConsumesPlan: boolean;
}

export interface CriticState {
  request: CriticRequest;
  resolutions: AnchorResolution[];
  objective: CriticObjective;
  plan: CriticPlan;
  hints: CriticRetrievalHints;
  attribution: CriticAttribution;
}

export interface OrchestrateInput {
  request: CriticRequest;
  dna: DnaState;
  hard: HardConstraints;
  /** Real TMDB search, injected. Returns candidates for GC2 to JUDGE. */
  searchCandidates: (name: string) => Promise<AnchorCandidate[]>;
  /** Cache-only fingerprint read, injected. GC3 never classifies. */
  loadDimensions: DimensionLoader;
  /**
   * Derive the SOFT keyword seed FROM THE RESOLVED ANCHORS.
   *
   * Preferred over `anchorKeywordIds`, and not merely for speed. The route used
   * to compute those ids by searching and resolving each name a SECOND time —
   * two independent resolutions of the same title, free to disagree, and paying
   * for an extra identity search per anchor. Deriving them here means the
   * keywords belong to the title GC2 actually chose.
   *
   * Called with the resolved anchors, CONCURRENTLY with hydration. A failure is
   * absorbed: the seed is soft, so losing it costs recall breadth, never the
   * comparison.
   */
  loadAnchorKeywords?: (anchors: readonly ResolvedAnchor[]) => Promise<number[]>;
  /** Pre-computed seed. Ignored when `loadAnchorKeywords` is supplied. */
  anchorKeywordIds?: number[];
  anchorGenreIds?: number[];
  /** Stated media type, which is identity for GC2, not a preference. */
  mediaType?: 'movie' | 'tv';
}

/**
 * The value of `finalRankingConsumesPlan` before ranking has happened.
 *
 * Named rather than written inline because the literal alone reads like a claim
 * about the system ("the critic does not affect ordering"), when what it
 * actually states is a fact about this point in the pipeline: ranking has not
 * run yet. The GC6 call site replaces it with what `rankCriticCandidates`
 * really did.
 */
const NOT_YET_RANKED = false;

export async function buildCriticState(input: OrchestrateInput): Promise<CriticState> {
  const { request, dna, hard, searchCandidates, loadDimensions, mediaType } = input;

  /* ── GC2 · IDENTITY ────────────────────────────────────────────────────
     Search supplies CANDIDATES; `resolveAnchor` supplies the verdict. The
     forbidden `searchTitles(name)[0]` is absent by construction: this code
     cannot see search order, only the list. */
  /* CONCURRENT, AND THE ORDER IS PRESERVED. `Promise.all` keeps positional
     correspondence with `referenceTitles`, which the authority arithmetic below
     depends on — while a serial loop made a two-anchor comparison pay two
     round-trips before anything else could begin. */
  const resolutions: AnchorResolution[] = await Promise.all(
    request.referenceTitles.map(async (spokenAs) => {
      const candidates = await searchCandidates(spokenAs).catch(() => [] as AnchorCandidate[]);
      return resolveAnchor({ spokenAs, mediaType }, candidates);
    }),
  );

  const placed = resolutions
    .filter((r): r is Extract<AnchorResolution, { status: 'resolved' }> => r.status === 'resolved')
    .map((r) => r.anchor);

  /* ── GC3 · HYDRATION, and the keyword seed, TOGETHER ───────────────────
     Both depend only on the resolved identities and on nothing from each other,
     so they are one hop rather than two. Hydration stays cache-only: a miss
     leaves the anchor unhydrated, which costs it authority rather than
     inventing a fingerprint. */
  const [hydratedResolutions, seedKeywords] = await Promise.all([
    hydrateAnchors(resolutions, loadDimensions),
    input.loadAnchorKeywords
      ? input.loadAnchorKeywords(placed).catch(() => [] as number[])
      : Promise.resolve(input.anchorKeywordIds ?? []),
  ]);

  /* ── OBJECTIVE ─────────────────────────────────────────────────────────
     `requested` is what the user NAMED, so an anchor we failed to place still
     lowers authority. Reporting a half-understood request as fully understood
     is the exact failure GC2 exists to prevent. */
  const objective = anchorsToObjective(request.relation, hydratedResolutions, {
    requested: request.referenceTitles.length,
  });

  /* ── GC4 · THE PLAN ────────────────────────────────────────────────────
     The route does not reason about axes; `buildPlan` does. */
  const plan = buildPlan({
    relation: request.relation,
    anchors: objective.anchors,
    dna,
    modifiers: request.modifiers,
    authority: objective.authority,
  });

  /* ── GC5 · RETRIEVAL HINTS ─────────────────────────────────────────────
     `hard` passes straight through untouched — nothing inferred above may
     enter it, which is what keeps a critic guess from becoming a filter. */
  const hints = planToHints({
    relation: request.relation,
    anchors: objective.anchors,
    plan,
    hard,
    anchorKeywordIds: seedKeywords,
    anchorGenreIds: input.anchorGenreIds ?? [],
  });

  const attribution: CriticAttribution = {
    relation: request.relation,
    cue: request.cue,
    requestedAnchors: [...request.referenceTitles],
    resolution: hydratedResolutions.map((r) =>
      r.status === 'resolved'
        ? { spokenAs: r.anchor.spokenAs, status: r.status, titleId: r.anchor.titleId }
        : { spokenAs: r.spokenAs, status: r.status },
    ),
    hydrated: objective.anchors.map((a) => ({ titleId: a.titleId, hydrated: a.dims != null })),
    planInstructions: plan.instructions.map((i) => ({
      axis: i.axis,
      kind: i.kind,
      target: Math.round(i.target),
      evidence: [...i.evidence],
    })),
    strands: hints.strands.map((s) => s.label),
    rankingOnlyAxes: hints.rankingOnly.map((i) => i.axis),
    unresolvedModifiers: [...request.unresolvedModifiers],
    objectiveAuthority: objective.authority,
    candidateIds: [],
    finalRankingConsumesPlan: NOT_YET_RANKED,
  };

  return { request, resolutions: hydratedResolutions, objective, plan, hints, attribution };
}
