/**
 * Pure grader for the curated critical suite. Given the REAL parser's output
 * (a NormalizedQuery from eval/normalize) and a case's expected intent, it checks
 * every hard constraint independently and returns per-constraint pass/fail with
 * the exact failure category — so a report shows precisely which pipeline stage
 * dropped which part of the request. No I/O.
 */
import type { NormalizedQuery } from '../contract';
import type { CriticalCase, FailCategory } from './suite';

export interface ConstraintResult {
  label: string;
  ok: boolean;
  category?: FailCategory;
  detail?: string;
}

export interface CaseResult {
  id: string;
  prompt: string;
  pass: boolean;
  checks: ConstraintResult[];
  failCategories: FailCategory[];
}

function check(label: string, ok: boolean, category: FailCategory, detail: string): ConstraintResult {
  // Always carry the category — even on a pass — so the campaign can count how
  // many cases actually EXERCISED a dimension (its denominator), not just how
  // many failed it. Omitting it on pass made per-dimension rates vacuous (0/0).
  return ok ? { label, ok: true, category } : { label, ok: false, category, detail };
}

/** Grade one case's expected intent against what the parser produced. */
export function gradeCase(c: CriticalCase, nq: NormalizedQuery): CaseResult {
  const e = c.expect;
  const checks: ConstraintResult[] = [];

  if (e.contentType) {
    const opposite = e.contentType === 'movie' ? 'tv' : 'movie';
    // A HARD media-type failure is picking the WRONG type. An uncommitted/empty
    // media type is NOT a violation — downstream defaults handle it — so we only
    // fail when the parser committed to the opposite type.
    const ok = nq.contentTypes.includes(e.contentType) ||
      (!nq.contentTypes.includes(opposite));
    checks.push(check(`content_type=${e.contentType}`, ok, 'WRONG_MEDIA_TYPE', `got [${nq.contentTypes.join(',')}]`));
  }
  if (e.originCountries) {
    const ok = e.originCountries.every((cc) => nq.originCountries.includes(cc));
    checks.push(check(`origin=${e.originCountries.join('/')}`, ok, 'WRONG_COUNTRY', `got [${nq.originCountries.join(',')}]`));
  }
  if (e.englishAudioRequired) {
    checks.push(check('english_audio', nq.englishAudioRequired, 'AUDIO_NOT_VERIFIED', `englishAudioRequired=${nq.englishAudioRequired}`));
  }
  if (e.englishDubRequired) {
    checks.push(check('english_dub', nq.englishDubRequired, 'AUDIO_NOT_VERIFIED', `englishDubRequired=${nq.englishDubRequired}`));
  }
  if (e.networks) {
    const ok = e.networks.every((n) => nq.networks.includes(n));
    checks.push(check(`network=${e.networks.join('/')}`, ok, 'WRONG_PLATFORM', `got [${nq.networks.join(',')}]`));
  }
  if (e.platformIds) {
    const got = nq.platforms.map((p) => p.id);
    const ok = e.platformIds.every((id) => got.includes(id));
    checks.push(check(`platform=${e.platformIds.join('/')}`, ok, 'WRONG_PLATFORM', `got [${got.join(',')}]`));
  }
  if (e.runtimeMaxMinutes != null) {
    const ok = nq.runtimeMaxMinutes != null && nq.runtimeMaxMinutes <= e.runtimeMaxMinutes;
    checks.push(check(`runtime<=${e.runtimeMaxMinutes}`, ok, 'WRONG_RUNTIME', `got ${nq.runtimeMaxMinutes}`));
  }
  if (e.exclude) {
    for (const ex of e.exclude) {
      checks.push(check(`exclude:${ex}`, nq.excludedAttributes.includes(ex), 'EXCLUSION_VIOLATION', `excludes=[${nq.excludedAttributes.join(',')}]`));
    }
  }
  if (e.reference) {
    // The parser captures a reference either as a watchTitle or via similar_to intent.
    const ref = (nq.watchTitle ?? '').toLowerCase();
    const want = e.reference.toLowerCase();
    const ok = ref.includes(want) || want.includes(ref) && ref.length > 3 || nq.normalizedIntent === 'similar_to';
    checks.push(check(`reference:${e.reference}`, Boolean(ok), 'REFERENCE_SIMILARITY_WEAK', `watchTitle=${nq.watchTitle} intent=${nq.normalizedIntent}`));
  }
  if (e.count != null) {
    checks.push(check(`count=${e.count}`, nq.requestedCount === e.count, 'INVALID_RESULT_COUNT', `got ${nq.requestedCount}`));
  }
  if (e.household) {
    const ok = nq.householdProfile === e.household || nq.personalizationRequested;
    checks.push(check(`household=${e.household}`, ok, 'HOUSEHOLD_PERSONALIZATION_FAILURE', `got ${nq.householdProfile} pers=${nq.personalizationRequested}`));
  }
  if (e.impossible) {
    // Correct behaviour: detect the contradiction (do not silently proceed).
    checks.push(check('detects_contradiction', nq.ambiguities.length > 0, 'IMPOSSIBLE_REQUEST_UNHANDLED', `ambiguities=[${nq.ambiguities.join(';')}]`));
  }

  const failing = checks.filter((c2) => !c2.ok);
  const failCategories = Array.from(new Set(failing.map((f) => f.category!).filter(Boolean)));
  return { id: c.id, prompt: c.prompt, pass: failing.length === 0, checks, failCategories };
}
