import 'server-only';
import { serverEnv } from '@/lib/env';
import type { SubjectRequirement, CandidateEvidence } from '@/lib/nlu/semanticEligibility';
import { parseAdjudication, type AdjudicationResult } from '@/lib/nlu/subjectAdjudicatorParse';

/**
 * BOUNDED SEMANTIC SUBJECT ADJUDICATOR.
 *
 * The deterministic evaluator (`evaluateSubjectCentrality`) settles the confident
 * cases for near-zero cost: a title hit or a strong multi-signal overview is
 * CENTRAL; a setting-only mention ("a murder at a boxing match") is INCIDENTAL;
 * no evidence is UNSUPPORTED. What it CANNOT settle from metadata counts alone is
 * the ambiguous band — a single authoritative keyword tag plus a light mention.
 * There, `Moneyball` (about baseball) and `Pulp Fiction` (a boxer among an
 * ensemble) look identical to any counting rule. Distinguishing them is a
 * semantic judgement, not a repetition count, so ONLY that band is escalated to
 * a model.
 *
 * This adjudicator's contract is narrow and safe:
 *   • It classifies centrality from SUPPLIED FACTS only (title, overview,
 *     genres, keyword tags) — it never recommends and never invents plot.
 *   • Strict JSON schema, temperature 0, bounded tokens, hard timeout.
 *   • Cached in-process by (canonical subject + title/year + evaluator version)
 *     so "is Moneyball about baseball" is paid for at most once per process.
 *   • Safe when unavailable: no key, non-200, timeout, or unparseable output all
 *     return null, and the caller REJECTS an ambiguous hard subject on
 *     uncertainty rather than approve a bad recommendation.
 *
 * No subject-specific logic lives here: the concept is passed in as text and the
 * same prompt serves boxing, baseball, cryptography or pigeon racing alike.
 */

/** Bumps when the prompt or contract changes, so cached verdicts don't stick. */
export const ADJUDICATOR_VERSION = 'v1';

export interface SubjectAdjudication extends AdjudicationResult {
  /** How the verdict was produced — for diagnostics. */
  source: 'model' | 'cache';
}

/** An injectable adjudicator, so the pipeline and tests can supply a stub. */
export type SubjectAdjudicator = (
  req: SubjectRequirement,
  ev: CandidateEvidence,
) => Promise<AdjudicationResult | null>;

const SYSTEM_PROMPT = [
  'You judge how CENTRAL a requested subject/concept is to ONE movie or TV title, using only the facts provided.',
  'You never recommend, never rank, never invent plot, cast, or facts not present in the input.',
  'Classify the subject into exactly one centrality class:',
  '- CENTRAL: the subject fundamentally defines the story — its primary activity, profession, competition, world, or dramatic focus.',
  '- MATERIAL: the subject is a sustained, important component but not the whole story.',
  '- INCIDENTAL: the subject only appears (a setting for one scene, a single character\'s job/hobby, a passing mention, a metaphor) and the work is not meaningfully about it.',
  '- UNSUPPORTED: no real evidence connects the title to the subject.',
  '- UNKNOWN: the provided facts are insufficient to decide.',
  'A keyword tag alone is weak evidence: many titles are tagged for a subject that is only incidental to them.',
  'Judge from the meaning of the overview and how the subject functions in the story, not from how many times a word appears.',
  'Respond with ONLY a JSON object, no prose, no code fence: {"centrality":"CENTRAL|MATERIAL|INCIDENTAL|UNSUPPORTED|UNKNOWN","confidence":<0..1>,"reason":"<one short factual sentence citing the given evidence>"}.',
].join(' ');

const cache = new Map<string, AdjudicationResult>();

function cacheKey(req: SubjectRequirement, ev: CandidateEvidence): string {
  const title = (ev.title ?? '').toLowerCase().trim();
  return `${ADJUDICATOR_VERSION}|${req.canonical.toLowerCase()}|${title}`;
}

/** Reset the in-process cache (tests). */
export function _clearAdjudicationCache(): void {
  cache.clear();
}

/**
 * The production adjudicator: a real, bounded model call for ONE ambiguous
 * candidate. Returns null (⇒ caller rejects on uncertainty for a hard subject)
 * whenever the model is unavailable or the response is not schema-valid.
 */
export async function adjudicateSubjectCentrality(
  req: SubjectRequirement,
  ev: CandidateEvidence,
): Promise<SubjectAdjudication | null> {
  const key = cacheKey(req, ev);
  const cached = cache.get(key);
  if (cached) return { ...cached, source: 'cache' };

  const apiKey = serverEnv.openaiKey();
  if (!apiKey) return null;

  const payload = {
    requested_subject: req.label || req.canonical,
    subject_vocabulary: req.lexemes.slice(0, 12),
    title: ev.title,
    overview: ev.overview || '(no overview available)',
    genres: ev.genres.slice(0, 6),
    keyword_tags: ev.keywords.slice(0, 20),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 120,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = parseAdjudication(data.choices?.[0]?.message?.content ?? '');
    if (!parsed) return null;
    cache.set(key, parsed);
    return { ...parsed, source: 'model' };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
