import { compileTitle, type CompiledTitle } from './batch';
import { COMPILER_VERSION, type Adjudication } from './compile';
import type { SubjectRequirement, CandidateEvidence } from '@/lib/nlu/semanticEligibility';
import type { MediaType } from '@/lib/types';

/**
 * BACKGROUND WARM PLANNING for the Knowledge Layer (pure, testable).
 *
 * The request-path compiles a fact ON DEMAND when the ambiguous band needs it.
 * That warms the store opportunistically but leaves cold any title never hit by
 * an ambiguous search. This module plans a BOUNDED, IDEMPOTENT background warm:
 * given candidate titles and the versions already stored, it selects only the
 * titles that are missing or stale (a bumped COMPILER_VERSION), capped per run.
 *
 * It derives each title's subjects from the title's OWN evidence (its keyword
 * tags) — subject-agnostic, no per-noun table — so a title gets compiled facts
 * for exactly the subjects an eligibility query would look up. Deterministic and
 * I/O-free; the DB read/write lives in warmStore.ts.
 */

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Tags that are not real "subjects" (too generic / production noise) never
// become compiled subject facts — recall noise, not aboutness.
const NON_SUBJECT = new Set([
  'based on novel or book', 'based on true story', 'aftercreditsstinger', 'duringcreditsstinger',
  'woman director', 'independent film', 'sequel', 'remake', 'anime', 'live action',
]);

/**
 * Derive the subjects to compile for a title from its own keyword tags. Bounded
 * to `max` distinct, meaningful tags. Each becomes a strict subject requirement
 * whose lexeme is the tag itself (plus the head word), so the compiler reuses the
 * same evaluator the finder trusts.
 */
export function deriveSubjectsFromEvidence(ev: CandidateEvidence, max = 8): SubjectRequirement[] {
  const seen = new Set<string>();
  const out: SubjectRequirement[] = [];
  for (const raw of ev.keywords) {
    const label = (raw ?? '').trim();
    const canonical = slug(label);
    if (!canonical || canonical.length < 3) continue;
    if (NON_SUBJECT.has(label.toLowerCase())) continue;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const head = label.split(/\s+/).pop() ?? label;
    const lexemes = Array.from(new Set([label, head].map((s) => s.toLowerCase()).filter(Boolean)));
    out.push({ canonical, label, lexemes, strict: true });
    if (out.length >= max) break;
  }
  return out;
}

export interface WarmCandidate {
  tmdbId: number;
  mediaType: MediaType;
  evidence: CandidateEvidence;
}

export interface WarmPlan {
  toCompile: WarmCandidate[];
  skipped: WarmCandidate[];
}

const keyOf = (c: { mediaType: MediaType; tmdbId: number }) => `${c.mediaType}-${c.tmdbId}`;

/**
 * Select which candidates need (re)compiling: missing a header, or stored under a
 * stale compiler version. Idempotent — a title already at COMPILER_VERSION is
 * skipped, so re-running the warm job does no redundant work. Bounded by
 * `maxPerRun`.
 */
export function planWarm(
  candidates: WarmCandidate[],
  existingVersions: Map<string, string>,
  maxPerRun: number,
): WarmPlan {
  const toCompile: WarmCandidate[] = [];
  const skipped: WarmCandidate[] = [];
  for (const c of candidates) {
    const current = existingVersions.get(keyOf(c));
    const upToDate = current === COMPILER_VERSION;
    if (!upToDate && toCompile.length < maxPerRun) toCompile.push(c);
    else skipped.push(c);
  }
  return { toCompile, skipped };
}

/** Compile one candidate's facts + header from its own evidence-derived subjects. */
export async function warmTitle(
  c: WarmCandidate,
  adjudicate?: (req: SubjectRequirement, ev: CandidateEvidence) => Promise<Adjudication | null>,
): Promise<CompiledTitle> {
  const subjects = deriveSubjectsFromEvidence(c.evidence);
  return compileTitle(c.evidence, subjects, adjudicate);
}
