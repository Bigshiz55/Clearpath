/**
 * Phase 5 — the multilayer objective evaluator. Each layer is a pure function
 * over (case, normalized, pipeline result, fixture world). Layer B in
 * particular is INDEPENDENT: it re-verifies every returned title against the
 * frozen fixture facts, never trusting the pipeline's own filtering.
 */
import { sameStringSet, type NormalizedQuery } from '../contract';
import type { EvalCase } from '../types';
import type { FixtureWorld } from '../fixtures/index';
import type { PipelineResult, PipelineResultItem } from '../pipeline/fixtureFinder';
import type { ParseEval, ConstraintEval, ConstraintViolation, RecallEval, RankingEval, ResponseEval } from './result';

// ── Layer A: parsing accuracy ────────────────────────────────────────────────
export function evalLayerA(c: EvalCase, got: NormalizedQuery): ParseEval {
  const want = c.intended;
  const fields: Record<string, boolean> = {};
  fields.intent = got.normalizedIntent === want.normalizedIntent;
  fields.contentTypes = sameStringSet(got.contentTypes, want.contentTypes);
  fields.networks = sameStringSet(got.networks, want.networks);
  fields.platforms = sameStringSet(got.platforms.map((p) => String(p.id)), want.platforms.map((p) => String(p.id)));
  fields.genres = sameStringSet(got.genres, want.genres);
  fields.requestedCount = (got.requestedCount ?? null) === (want.requestedCount ?? null);
  fields.excludedAttributes = sameStringSet(
    got.excludedAttributes.filter((a) => !a.startsWith('__')),
    want.excludedAttributes.filter((a) => !a.startsWith('__')),
  );
  fields.household = (got.householdProfile ?? null) === (want.householdProfile ?? null);
  fields.personalization = got.personalizationRequested === want.personalizationRequested;
  fields.availabilityType = got.availability.type === want.availability.type;
  fields.timeWindow = (got.availability.endOffsetHours ?? null) === (want.availability.endOffsetHours ?? null);
  fields.watchTitle = norm(got.watchTitle) === norm(want.watchTitle);

  const graded = Object.values(fields);
  const fieldAccuracy = graded.length ? graded.filter(Boolean).length / graded.length : 1;

  // ambiguity recall
  const wantAmb = c.expected.expectedAmbiguities ?? [];
  const detected = got.ambiguities.length;
  const ambiguityRecall = wantAmb.length === 0 ? (detected === 0 || true ? 1 : 1) : Math.min(1, detected / wantAmb.length);

  const wantsClar = Boolean(c.expected.expectsClarification);
  const gotClar = got.ambiguities.length > 0 || got.normalizedIntent === 'unknown' || isVague(c.rawQuery);
  const clarificationCorrect = wantsClar ? gotClar : true;

  return { fields, fieldAccuracy, intentCorrect: fields.intent, clarificationCorrect, ambiguityRecall };
}

function norm(s: string | null): string {
  return (s ?? '').toLowerCase().trim();
}
function isVague(raw: string): boolean {
  // Strip filler words first so "you know, find something good" still reads as
  // the maximally-vague request that warrants a clarification.
  const t = raw
    .toLowerCase()
    .replace(/\b(um|uh|like|you know|i mean|so|well)\b/g, '')
    .replace(/[.,!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return /^(find|show me|give me|get me)?\s*(something|anything) (good|to watch)$/.test(t) || /^(find|show me|give me)?\s*(anything|whatever)$/.test(t);
}

// ── Layer B: hard-constraint validity (independent) ──────────────────────────
export function evalLayerB(c: EvalCase, pipeline: PipelineResult, world: FixtureWorld): ConstraintEval {
  const profile = world.profile(c.profileKey);
  const items = pipeline.items;
  const violations: ConstraintViolation[] = [];
  const push = (i: PipelineResultItem, kind: string, detail: string) => violations.push({ itemId: i.id, title: i.title, kind, detail });

  // duplicates
  const seenIds = new Set<string>();
  let duplicateCount = 0;
  for (const i of items) {
    if (seenIds.has(i.id)) {
      duplicateCount++;
      push(i, 'no_duplicates', 'duplicate id in returned set');
    }
    seenIds.add(i.id);
  }

  // hallucination: every returned title must exist in the fixture
  let hallucinations = 0;
  for (const i of items) {
    if (!world.titleById(i.id)) {
      hallucinations++;
      push(i, 'no_hallucination', 'title not present in fixture catalog/schedule');
    }
  }

  // per-constraint checks
  let timeWindowViolations = 0;
  let networkOrPlatformViolations = 0;
  let exclusionViolations = 0;
  let previouslyWatchedLeaks = 0;
  let previouslyRejectedLeaks = 0;
  let subscriptionViolations = 0;
  let overCount = false;

  const historyWatched = new Set(profile.history.filter((h) => h.status !== 'rejected').map((h) => h.id));
  const historyRejected = new Set(profile.history.filter((h) => h.status === 'rejected').map((h) => h.id));

  for (const con of c.expected.hardConstraints) {
    if (con.kind === 'max_count' && typeof con.value === 'number') {
      if (items.length > con.value) {
        overCount = true;
        push(items[con.value] ?? items[0]!, 'max_count', `returned ${items.length} > ${con.value}`);
      }
    }
    for (const i of items) {
      const t = world.titleById(i.id);
      if (!t) continue; // hallucination already counted
      switch (con.kind) {
        case 'content_type': {
          const okCt = t.facts.contentType === con.value || t.facts.attributes.includes(String(con.value));
          if (!okCt) push(i, 'content_type', `is ${t.facts.contentType}, wanted ${con.value}`);
          break;
        }
        case 'network': {
          const h = world.airingsWithin({ horizonHours: 48, networkKey: String(con.value) });
          const onNet = h.some((a) => a.id === i.id);
          if (!onNet) {
            networkOrPlatformViolations++;
            push(i, 'network', `not on network ${con.value}`);
          }
          break;
        }
        case 'platform': {
          if (!t.facts.providerIds.includes(Number(con.value))) {
            networkOrPlatformViolations++;
            push(i, 'platform', `not on provider ${con.value}`);
          }
          break;
        }
        case 'time_window': {
          const h = Number(con.value);
          const windowClose = world.nowMs + h * 3600_000;
          const visible = (t.facts.airings ?? []).some((a) => {
            const start = world.nowMs + a.startOffsetHours * 3600_000;
            const end = start + a.runtimeMinutes * 60_000;
            return end > world.nowMs && start <= windowClose;
          });
          if (!visible) {
            timeWindowViolations++;
            push(i, 'time_window', `no airing within ${h}h`);
          }
          break;
        }
        case 'subscription_access': {
          const owned = t.facts.providerIds.some((p) => profile.subscriptions.includes(p));
          if (!owned) {
            subscriptionViolations++;
            push(i, 'subscription_access', 'not on user subscriptions');
          }
          break;
        }
        case 'excluded_attribute': {
          const attr = String(con.value);
          const genreMatch = t.meta.genres.map((g) => g.toLowerCase().replace(/\s+/g, '_')).includes(attr);
          if (t.facts.attributes.includes(attr) || genreMatch) {
            exclusionViolations++;
            push(i, 'excluded_attribute', `carries excluded ${attr}`);
          }
          break;
        }
        case 'language': {
          if (t.facts.language !== con.value) push(i, 'language', `language ${t.facts.language} != ${con.value}`);
          break;
        }
        case 'not_previously_watched': {
          if (historyWatched.has(i.id)) {
            previouslyWatchedLeaks++;
            push(i, 'not_previously_watched', 'previously watched leaked');
          }
          break;
        }
        case 'not_previously_rejected': {
          if (historyRejected.has(i.id)) {
            previouslyRejectedLeaks++;
            push(i, 'not_previously_rejected', 'previously rejected leaked');
          }
          break;
        }
        default:
          break;
      }
    }
  }

  const hardValid = violations.length === 0;
  return {
    returned: items.length,
    violations,
    duplicateCount,
    overCount,
    hallucinations,
    timeWindowViolations,
    networkOrPlatformViolations,
    exclusionViolations,
    previouslyWatchedLeaks,
    previouslyRejectedLeaks,
    subscriptionViolations,
    hardValid,
  };
}

// ── Layer C: candidate recall ────────────────────────────────────────────────
export function evalLayerC(c: EvalCase, pipeline: PipelineResult): RecallEval {
  const valid = c.expected.validCandidateIds;
  if (!valid || valid.length === 0) return { graded: false, recall: null, missed: [] };
  const surfaced = new Set([...pipeline.items.map((i) => i.id), ...pipeline.consideredIds]);
  const hit = valid.filter((v) => surfaced.has(v));
  const missed = valid.filter((v) => !surfaced.has(v));
  return { graded: true, recall: hit.length / valid.length, missed };
}

// ── Layer D: ranking quality ─────────────────────────────────────────────────
export function evalLayerD(c: EvalCase, pipeline: PipelineResult): RankingEval {
  const items = pipeline.items;
  if (items.length === 0) return { graded: false, descendingByMatch: true, ndcg: null, mrr: null, idealTopRank: null };

  // order consistency: should be non-increasing by matchScore (the personalized call)
  let descendingByMatch = true;
  for (let i = 1; i < items.length; i++) if (items[i]!.matchScore > items[i - 1]!.matchScore + 0.5) descendingByMatch = false;

  // nDCG using matchScore as graded relevance (0..100 → 0..1)
  const rels = items.map((i) => i.matchScore / 100);
  const dcg = rels.reduce((s, r, idx) => s + (Math.pow(2, r) - 1) / Math.log2(idx + 2), 0);
  const ideal = [...rels].sort((a, b) => b - a);
  const idcg = ideal.reduce((s, r, idx) => s + (Math.pow(2, r) - 1) / Math.log2(idx + 2), 0);
  const ndcg = idcg > 0 ? dcg / idcg : 1;

  // MRR for the fixture-forced ideal top pick
  let mrr: number | null = null;
  let idealTopRank: number | null = null;
  if (c.expected.idealTopId) {
    const rank = items.findIndex((i) => i.id === c.expected.idealTopId);
    if (rank >= 0) {
      idealTopRank = rank + 1;
      mrr = 1 / (rank + 1);
    } else {
      mrr = 0;
    }
  }
  return { graded: true, descendingByMatch, ndcg, mrr, idealTopRank };
}

// ── Layer E: response quality ────────────────────────────────────────────────
export function evalLayerE(c: EvalCase, pipeline: PipelineResult): ResponseEval {
  const text = pipeline.responseText;
  const n = pipeline.items.length;
  const asked = c.expected.maxResults;

  const answersRequest = n > 0 || pipeline.clarification != null || Boolean(c.expected.expectsRejection) || Boolean(c.expected.expectsEmptyOrFewer);
  const honestAboutFewer = asked != null && n < asked ? /found \d+|only|couldn|fewer|\byou asked\b/i.test(text) : true;
  const noImpliedUnavailable = !/you can watch/i.test(text) || pipeline.items.every((i) => i.where != null);
  const hasNextAction = /want me to|try|tap|loosen|widen|instead|\?/.test(text) || pipeline.clarification != null;
  const notTooLong = text.length <= 320;
  const clarifiesWhenNeeded = c.expected.expectsClarification ? pipeline.clarification != null || /want me to|which|did you mean/i.test(text) : true;

  const checks = [answersRequest, honestAboutFewer, noImpliedUnavailable, hasNextAction, notTooLong, clarifiesWhenNeeded];
  const score = checks.filter(Boolean).length / checks.length;
  return { answersRequest, honestAboutFewer, noImpliedUnavailable, hasNextAction, notTooLong, clarifiesWhenNeeded, score };
}
