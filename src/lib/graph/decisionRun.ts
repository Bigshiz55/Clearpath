import type { FinderDiagnostics } from '@/lib/finder';
import {
  DecisionEdge,
  DecisionRun,
  EntryPoint,
  Persistence,
  nodeRef,
} from './types';

/**
 * DECISION-RUN BUILDERS — execution state, connected. Pure.
 *
 * These read the values the routes ALREADY computed — the canonical query,
 * the finder's per-stage diagnostics with per-candidate verdicts, the
 * routing decision, the taste writes actually performed — and connect them
 * into one `DecisionRun`. Nothing here re-derives meaning, asks a model, or
 * reconstructs a story after the fact: if a route didn't compute it, the
 * run doesn't claim it. That is the entire point — the same evidence that
 * made the decision is the evidence that explains and audits it.
 */

/** What the ask route knows at response time, reduced to what the run needs. */
export interface AskRunInput {
  runId: string;
  text: string;
  /** The route's own kind: recommendation | lookup | statement | clarify … */
  kind: string;
  /** The EXECUTED query (post-canonical-resolution), when one ran. */
  query?: {
    mediaType?: string;
    genreIds?: number[];
    excludeGenreIds?: number[];
    subjectLexemes?: string[];
    maxRuntime?: number | null;
  } | null;
  requestedCount?: number | null;
  diagnostics?: FinderDiagnostics | null;
  /** The items actually shown, in order. `where`/`whereObservedAt` are the
   *  provider claim the CARD makes and when that fact was observed — both or
   *  neither: a claim with no as-of is INV-4's violation, so the builder
   *  refuses to emit one. */
  returned?: Array<{
    id: number;
    mediaType: 'movie' | 'tv';
    title?: string;
    matchScore?: number | null;
    where?: string | null;
    whereObservedAt?: string | null;
  }>;
  createdAt: string;
}

const persistenceForKind = (kind: string): Persistence =>
  kind === 'statement' ? 'session' : 'request_only';

export function buildAskRun(input: AskRunInput): DecisionRun {
  const edges: DecisionEdge[] = [];
  const req = nodeRef.request();
  const seen = (detail?: Record<string, unknown>) => detail;

  edges.push({ subject: nodeRef.run(), predicate: 'classified_as', object: input.kind });

  const q = input.query ?? undefined;
  if (q?.mediaType && q.mediaType !== 'any') {
    edges.push({ subject: req, predicate: 'requires_media', object: q.mediaType });
  }
  for (const s of q?.subjectLexemes ?? []) {
    edges.push({ subject: req, predicate: 'requires_subject', object: s });
  }
  for (const g of q?.genreIds ?? []) {
    edges.push({ subject: req, predicate: 'requires_genre', object: String(g) });
  }
  for (const g of q?.excludeGenreIds ?? []) {
    edges.push({ subject: req, predicate: 'excludes_genre', object: String(g) });
  }
  if (q?.maxRuntime != null) {
    edges.push({ subject: req, predicate: 'max_runtime', object: String(q.maxRuntime) });
  }
  if (input.requestedCount != null) {
    edges.push({ subject: req, predicate: 'requires_count', object: String(input.requestedCount) });
  }

  /* Per-candidate eligibility verdicts, from the finder's own diagnostics —
     including the REJECTIONS, which are the graph's answer to "why not
     GoodFellas": ineligibility is recorded, never merely a low rank. */
  const subjects = q?.subjectLexemes ?? [];
  for (const ev of input.diagnostics?.evaluations ?? []) {
    const cand = nodeRef.candidate(ev.mediaType === 'tv' ? 'tv' : 'movie', ev.id);
    const detail = seen({
      title: ev.title,
      centrality: ev.centrality,
      evidence: ev.evidence,
      status: ev.status,
    });
    const provenance = {
      source: (ev as { decidedBy?: string }).decidedBy === 'adjudicator' ? ('classifier' as const) : ('deterministic_rule' as const),
      observedAt: input.createdAt,
      confidence: ev.confidence,
      runId: input.runId,
    };
    if (ev.eligible) {
      for (const s of subjects.length ? subjects : ['(subject)']) {
        edges.push({ subject: cand, predicate: 'satisfies', object: s, detail, provenance });
      }
    } else {
      edges.push({
        subject: cand,
        predicate: 'rejected',
        object: ev.rejectionReason ?? 'ineligible',
        detail,
        provenance,
      });
    }
  }

  for (const item of input.returned ?? []) {
    const cand = nodeRef.candidate(item.mediaType, item.id);
    edges.push({ subject: nodeRef.results(), predicate: 'returned', object: cand, detail: seen({ title: item.title }) });
    if (item.matchScore != null) {
      edges.push({ subject: cand, predicate: 'scored', object: String(item.matchScore) });
    }
    /* AVAILABILITY, AS A SOURCED CLAIM (INV-4). The card says "on Netflix";
       the run records the same claim WITH its as-of. No observation time →
       no edge: a naked claim would be the exact violation the invariant
       exists to catch, so the builder cannot produce one. */
    if (item.where && item.whereObservedAt) {
      edges.push({
        subject: cand,
        predicate: 'available_on',
        object: item.where,
        provenance: { source: 'external:tmdb', observedAt: item.whereObservedAt, runId: input.runId },
      });
    }
  }

  return {
    id: input.runId,
    entryPoint: 'ask',
    rawText: input.text,
    intent: { kind: input.kind, persistence: persistenceForKind(input.kind) },
    edges,
    createdAt: input.createdAt,
  };
}

/** What the build-case route decided and did, reduced to what the run needs. */
export interface BuildCaseRunInput {
  runId: string;
  text: string;
  /** request | taste | airing | platform | where_to_watch */
  classifiedAs: string;
  routedTo?: string | null;
  /** Subject terms the ROUTE must honor (canonical-interpreter owned) — the
   *  airing branch's "boxing". Recording them is what lets INV-1 see a
   *  routed obligation instead of a run with no requirements at all. */
  subjectTerms?: string[];
  /** The durable-clause text `tasteEvidenceText` selected ('' when none) —
   *  the ONLY language allowed to justify a write inside a routed request. */
  durableEvidence: string;
  /** Axis keys actually upserted to dimension_signals. */
  tasteAxesWritten: string[];
  /** Titles actually seeded as ratings (user-named only, by contract). */
  titlesSeeded: string[];
  createdAt: string;
}

export function buildCaseRun(input: BuildCaseRunInput): DecisionRun {
  const edges: DecisionEdge[] = [];
  edges.push({ subject: nodeRef.run(), predicate: 'classified_as', object: input.classifiedAs });
  if (input.routedTo) {
    edges.push({ subject: nodeRef.run(), predicate: 'routed_to', object: input.routedTo });
  }
  for (const term of input.subjectTerms ?? []) {
    edges.push({ subject: nodeRef.request(), predicate: 'requires_subject', object: term });
  }
  /* Every write edge carries the durable-clause text that justified it, so
     INV-2 can enforce the real law: writes never derive from request-only
     language. In a pure request `durableEvidence` is '' and any write edge
     is a violation; in a mixed utterance ("I love slow burns… give me a
     thriller.") the writes are lawful because the selected durable text is
     attached as their evidence. */
  const writeDetail = { durableEvidence: input.durableEvidence };
  for (const axis of input.tasteAxesWritten) {
    edges.push({
      subject: nodeRef.user(),
      predicate: 'wrote_taste',
      object: nodeRef.tasteAxis(axis),
      detail: writeDetail,
      provenance: { source: 'classifier', observedAt: input.createdAt, runId: input.runId },
    });
  }
  for (const t of input.titlesSeeded) {
    edges.push({
      subject: nodeRef.user(),
      predicate: 'seeded_title',
      object: t,
      detail: writeDetail,
      provenance: { source: 'user_statement', observedAt: input.createdAt, runId: input.runId },
    });
  }
  const persistence: Persistence =
    input.classifiedAs === 'taste' ? 'durable' : 'request_only';
  return {
    id: input.runId,
    entryPoint: 'build-case',
    rawText: input.text,
    intent: { kind: input.classifiedAs, persistence },
    edges,
    createdAt: input.createdAt,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// PHASE 8 — the group and ephemeral decision surfaces become graph objects.
// Same discipline as the ask/build-case builders: these read values the
// surfaces ALREADY computed and connect them; nothing is re-derived.
// ───────────────────────────────────────────────────────────────────────────

/** What /api/court/start knows when it builds the shortlist. */
export interface CourtRunInput {
  runId: string;
  roomCode: string;
  memberCount: number;
  /** The COMBINED tonight constraints (union of avoids, strictest runtime,
   *  unanimous media) — the room's hard gates. */
  tonight: { avoid: string[]; runtimeCapMinutes: number | null; mediaType: string | null };
  /** Gate rejections the ranking used to discard silently — with reasons. */
  rejected: Array<{ key: string; title?: string; reason: string }>;
  finalists: Array<{ key: string; title?: string; fit?: number | null }>;
  createdAt: string;
}

export function buildCourtRun(input: CourtRunInput): DecisionRun {
  const edges: DecisionEdge[] = [];
  const req = nodeRef.request();
  edges.push({ subject: nodeRef.run(), predicate: 'classified_as', object: 'court_shortlist' });
  for (const g of input.tonight.avoid) {
    edges.push({ subject: req, predicate: 'excludes_genre', object: g });
  }
  if (input.tonight.runtimeCapMinutes != null) {
    edges.push({ subject: req, predicate: 'max_runtime', object: String(input.tonight.runtimeCapMinutes) });
  }
  if (input.tonight.mediaType && input.tonight.mediaType !== 'any') {
    edges.push({ subject: req, predicate: 'requires_media', object: input.tonight.mediaType });
  }
  for (const r of input.rejected) {
    edges.push({
      subject: `candidate:${r.key}`,
      predicate: 'rejected',
      object: r.reason,
      detail: { title: r.title },
      provenance: { source: 'deterministic_rule', observedAt: input.createdAt, runId: input.runId },
    });
  }
  for (const f of input.finalists) {
    const cand = `candidate:${f.key}`;
    edges.push({ subject: nodeRef.results(), predicate: 'returned', object: cand, detail: { title: f.title } });
    if (f.fit != null) edges.push({ subject: cand, predicate: 'scored', object: String(f.fit) });
  }
  return {
    id: input.runId,
    entryPoint: 'court',
    rawText: `court ${input.roomCode} · ${input.memberCount} member(s)`,
    /* SESSION: the room's decision lives as long as the room does — it is
       never anybody's durable taste (INV-9). */
    intent: { kind: 'court_shortlist', persistence: 'session' },
    edges,
    createdAt: input.createdAt,
  };
}

/** What the docket's deliverVerdict computed, reduced to what the run needs. */
export interface DocketVerdictRunInput {
  runId: string;
  winner: { key: string; title?: string; score?: number | null } | null;
  backup: { key: string; title?: string; score?: number | null } | null;
  alsoRan: Array<{ key: string; title?: string; score?: number | null }>;
  ruledOut: Array<{ key: string; title?: string; reason: string }>;
  createdAt: string;
}

export function buildDocketVerdictRun(input: DocketVerdictRunInput): DecisionRun {
  const edges: DecisionEdge[] = [];
  edges.push({ subject: nodeRef.run(), predicate: 'classified_as', object: 'docket_verdict' });
  const ranked = [input.winner, input.backup, ...input.alsoRan].filter(
    (r): r is NonNullable<typeof r> => r != null,
  );
  for (const r of ranked) {
    const cand = `candidate:${r.key}`;
    edges.push({ subject: nodeRef.results(), predicate: 'returned', object: cand, detail: { title: r.title } });
    if (r.score != null) edges.push({ subject: cand, predicate: 'scored', object: String(r.score) });
  }
  for (const r of input.ruledOut) {
    edges.push({
      subject: `candidate:${r.key}`,
      predicate: 'rejected',
      object: r.reason,
      detail: { title: r.title },
      provenance: { source: 'deterministic_rule', observedAt: input.createdAt, runId: input.runId },
    });
  }
  return {
    id: input.runId,
    entryPoint: 'verdict',
    rawText: `docket verdict · ${ranked.length} ranked · ${input.ruledOut.length} ruled out`,
    /* REQUEST_ONLY: the docket is explicitly ephemeral — building one and
       abandoning it teaches the recommender nothing, by contract. */
    intent: { kind: 'docket_verdict', persistence: 'request_only' },
    edges,
    createdAt: input.createdAt,
  };
}

/** What the Subscription Check computed for each service. */
export interface SubscriptionRunInput {
  runId: string;
  services: Array<{ name: string; verdict: string; estPrice: number | null; watched: number }>;
  windowDays: number;
  createdAt: string;
}

export function buildSubscriptionRun(input: SubscriptionRunInput): DecisionRun {
  const edges: DecisionEdge[] = [];
  edges.push({ subject: nodeRef.run(), predicate: 'classified_as', object: 'subscription_check' });
  for (const svc of input.services) {
    edges.push({
      subject: `service:${svc.name}`,
      predicate: 'scored',
      object: svc.verdict,
      /* The basis travels WITH the claim: an estimated price (hardcoded
         table — an estimate, and labeled as one), the watch count, and the
         window it was counted over. */
      detail: { estPrice: svc.estPrice, watched: svc.watched, windowDays: input.windowDays },
      provenance: { source: 'calculated', observedAt: input.createdAt, runId: input.runId },
    });
  }
  return {
    id: input.runId,
    entryPoint: 'subscriptions',
    rawText: `subscription check · ${input.services.length} service(s) · ${input.windowDays}d window`,
    /* REQUEST_ONLY: a value snapshot over a window — recomputed every visit,
       never a durable belief about the user. */
    intent: { kind: 'subscription_check', persistence: 'request_only' },
    edges,
    createdAt: input.createdAt,
  };
}
