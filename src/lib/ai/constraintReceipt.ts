import type { FinderQuery } from '@/lib/finder';

/**
 * THE CONSTRAINT RECEIPT — a safe, structured summary of what the system
 * understood, derived from the FINAL FinderQuery (the thing that actually gates
 * results), so the user can SEE that "foreign + English dub + 10 shows" survived
 * — not a vague "Shows · English audio". It exposes only validated, factual
 * constraints; never model prose or chain-of-thought.
 *
 * Both routes build this from the same FinderQuery, so the receipt cannot drift
 * from what actually filtered.
 */

export interface ConstraintReceipt {
  mediaType: 'any' | 'movie' | 'tv';
  requestedCount: number | null;
  originalLanguage: 'any' | 'english' | 'non_english';
  audio: 'any' | 'english_audio' | 'english_dub';
  originCountries: string[];
  originalLanguages: string[];
  excludedOriginalLanguages: string[];
  subject: string | null;
  /** Short human lines for a chip row, in reading order. */
  lines: string[];
}

const MEDIA_LABEL: Record<ConstraintReceipt['mediaType'], string> = {
  any: 'Movies & shows',
  movie: 'Movies',
  tv: 'Shows',
};

export function buildConstraintReceipt(q: FinderQuery): ConstraintReceipt {
  const originalLanguage: ConstraintReceipt['originalLanguage'] = q.nonEnglishOriginal
    ? 'non_english'
    : q.englishOriginalOnly
      ? 'english'
      : 'any';
  const audio: ConstraintReceipt['audio'] = q.englishDubOnly
    ? 'english_dub'
    : q.englishAudioOnly
      ? 'english_audio'
      : 'any';

  const lines: string[] = [MEDIA_LABEL[q.mediaType]];
  if (q.subjectLabel) lines.push(q.subjectLabel);
  if (originalLanguage === 'non_english') lines.push('Non-English original');
  if (originalLanguage === 'english') lines.push('English original');
  if (q.originCountries?.length) lines.push(q.originCountries.join(', '));
  if (q.originalLanguages?.length) lines.push(q.originalLanguages.join(', '));
  if (q.excludeOriginalLanguages?.length) lines.push(`not ${q.excludeOriginalLanguages.join(', ')}`);
  if (audio === 'english_dub') lines.push('English dub');
  if (audio === 'english_audio') lines.push('English audio');
  if (q.maxRuntime != null) lines.push(`under ${q.maxRuntime} min`);
  if (q.finalCount != null) lines.push(`${q.finalCount} requested`);

  return {
    mediaType: q.mediaType,
    requestedCount: q.finalCount ?? null,
    originalLanguage,
    audio,
    originCountries: q.originCountries ? [...q.originCountries] : [],
    originalLanguages: q.originalLanguages ? [...q.originalLanguages] : [],
    excludedOriginalLanguages: q.excludeOriginalLanguages ? [...q.excludeOriginalLanguages] : [],
    subject: q.subjectLabel ?? null,
    lines,
  };
}
