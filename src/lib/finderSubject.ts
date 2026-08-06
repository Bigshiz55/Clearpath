import 'server-only';
import type { FinderQuery } from '@/lib/finder';
import { searchKeywords } from '@/lib/tmdb/client';
import {
  detectRequiredSubject,
  detectGeneralSubject,
  isSingularSubjectRequest,
  type SubjectSpec,
} from '@/lib/nlu/requiredSubject';
import type { SubjectRequirement } from '@/lib/nlu/semanticEligibility';

/**
 * Turn a named subject into a HARD constraint on a FinderQuery — the shared step
 * that makes "a boxing movie" mean boxing in BOTH the Forensic Search
 * (/api/finder) and Ask the Judge (/api/ask). Kept in one place precisely so the
 * two routes cannot drift into different meanings for the same sentence.
 *
 * What it does, deterministically:
 *  • detect the required subject (and any excluded subjects) from the raw text
 *    — never from the LLM, which had been degrading "boxing" into two genres;
 *  • resolve the subject's bounded expansion to TMDB keyword ids;
 *  • set them as a required-subject hard filter that the finder will neither
 *    relax nor pad away;
 *  • drop AI-inferred genres that were only a proxy for the subject (so the chip
 *    reads "Boxing", not "2 genres") UNLESS the user named a genre explicitly;
 *  • add excluded-subject keyword ids for "not wrestling / not MMA".
 *
 * It also converts a "last N years" recency into an EXACT calendar boundary and
 * returns the human interpretation lines the response must disclose.
 */
export interface SubjectApplication {
  query: FinderQuery;
  /** Disclosures the response shows, e.g. the made→released reading. */
  interpretation: string[];
  /** The required subject, if any (for the constraint receipt). */
  subject: SubjectSpec | null;
  /** The subject requirement for the semantic-eligibility evaluator — carries
   *  the subject's lexemes and whether the request is strict (CENTRAL only). */
  requirement: SubjectRequirement | null;
  /** The number of final results the phrasing asked for — 1 for a singular
   *  subject request ("a boxing movie"), else null (browse). */
  requestedCount: number | null;
}

export async function applyRequiredSubject(query: FinderQuery, text: string): Promise<SubjectApplication> {
  const interpretation: string[] = [];
  const det = detectRequiredSubject(text);
  let q: FinderQuery = { ...query };
  // A singular indefinite subject request ("a boxing movie") asks for ONE
  // title. This is a FINAL-selection count, applied after eligibility + ranking
  // — never a discovery cap — so the candidate pool stays broad.
  const singular = isSingularSubjectRequest(text);

  // Exact release-date boundary for "made/released within the last N years".
  // We keep sinceMonths (it drives the "Last N yr" chip and the year-level
  // post-filter) AND add an exact date so the boundary is a real day, not
  // months×30. "made" is disclosed as "released" unless production-date
  // evidence exists (it does not here).
  if (q.sinceMonths != null && q.minReleaseDate == null) {
    const years = Math.max(1, Math.round(q.sinceMonths / 12));
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - years);
    q.minReleaseDate = d.toISOString().slice(0, 10);
    if (/\bmade\b/i.test(text)) {
      interpretation.push(`I treated “made” as released within the last ${years} years.`);
    }
  }

  // Excluded subjects ("a boxing movie, not wrestling").
  if (det.excluded.length > 0) {
    const terms = det.excluded.flatMap((s) => s.expansion);
    const ids = await searchKeywords(terms).catch(() => []);
    if (ids.length) {
      q.excludeKeywordIds = Array.from(new Set([...(q.excludeKeywordIds ?? []), ...ids]));
      interpretation.push(`Excluding ${det.excluded.map((s) => s.label).join(', ')}.`);
    }
  }

  if (!det.required) {
    // No CURATED subject. Try the general strict-subject shape ("a courtroom
    // movie where the trial is central") — the same eligibility guarantee, for
    // any subject, driven only by the user's own words. Conservative: it fires
    // only on the explicit singular-subject shape, so a genre browse is
    // untouched.
    const general = detectGeneralSubject(text);
    if (general) {
      const gids = await searchKeywords(general.lexemes.slice(0, 6)).catch(() => []);
      q.subjectLabel = general.label;
      q.subjectCanonical = general.canonical;
      q.subjectLexemes = general.lexemes;
      q.subjectStrict = true;
      q.subjectKeywordIds = gids; // may be [] — then the finder reports honestly
      if (singular) q.finalCount = 1;
      // Drop AI-guessed genres that were only a proxy for the subject.
      if (!det.explicitGenre && q.genreIds.length > 0) q.genreIds = [];
      if (gids.length === 0) {
        interpretation.push(`“${general.label}” isn’t a well-tagged catalog subject — showing only titles where it is genuinely central, if any.`);
      }
      const requirement: SubjectRequirement = {
        canonical: general.canonical,
        label: general.label,
        lexemes: general.lexemes,
        strict: true,
      };
      return { query: q, interpretation, subject: null, requirement, requestedCount: singular ? 1 : null };
    }
    // No subject at all → the requested-count=1 rule does not apply (a plain
    // "a good movie" is a browse); leave the count to the normal parsers.
    return { query: q, interpretation, subject: null, requirement: null, requestedCount: null };
  }

  // A curated subject is present — a singular request ("a boxing movie") asks
  // for exactly one final result.
  if (singular) q.finalCount = 1;

  // Resolve the required subject to keyword ids — the ONLY approved broadening.
  const ids = await searchKeywords(det.required.expansion).catch(() => []);
  const requirement: SubjectRequirement = {
    canonical: det.required.canonical,
    label: det.required.label,
    lexemes: det.required.lexemes,
    strict: true,
  };
  q.subjectLexemes = det.required.lexemes;
  q.subjectStrict = true;
  if (ids.length === 0) {
    // No catalog keyword resolved — do NOT silently fall back to genres, which
    // is the original bug. Leave the request honest: the finder will report the
    // subject couldn't be verified rather than pad with lookalikes.
    q.subjectLabel = det.required.label;
    q.subjectCanonical = det.required.canonical;
    q.subjectKeywordIds = [];
    interpretation.push(`“${det.required.label}” isn’t a well-tagged catalog subject — showing only verified matches, if any.`);
    return { query: q, interpretation, subject: det.required, requirement, requestedCount: singular ? 1 : null };
  }

  q.subjectKeywordIds = ids;
  q.subjectLabel = det.required.label;
  q.subjectCanonical = det.required.canonical;

  // The AI's genres were a proxy for the subject; drop them so the subject is
  // the constraint and the chip is honest — unless the user named a genre word
  // ("a boxing DRAMA"), in which case keep genres as a real second constraint.
  if (!det.explicitGenre && q.genreIds.length > 0) {
    q.genreIds = [];
  }

  return { query: q, interpretation, subject: det.required, requirement, requestedCount: singular ? 1 : null };
}
