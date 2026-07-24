/**
 * CURATED CRITICAL REGRESSION SUITE — the 20 permanent, hand-authored search
 * cases the product must never regress on, including the two flagship examples
 * (Spanish film / A Christmas Story · Silence of the Lambs / Hallmark) and a
 * multi-turn refinement. Each carries a machine-readable expected intent + the
 * hard constraints its wording implies, so the grader can prove, per case,
 * whether the REAL parser understood the request — not merely that it returned
 * something. Deterministic; no I/O.
 */

export type FailCategory =
  | 'INTENT_PARSE_FAILURE'
  | 'HARD_CONSTRAINT_IGNORED'
  | 'WRONG_MEDIA_TYPE'
  | 'WRONG_COUNTRY'
  | 'WRONG_LANGUAGE'
  | 'AUDIO_NOT_VERIFIED'
  | 'WRONG_PLATFORM'
  | 'WRONG_RUNTIME'
  | 'EXCLUSION_VIOLATION'
  | 'REFERENCE_SIMILARITY_WEAK'
  | 'HOUSEHOLD_PERSONALIZATION_FAILURE'
  | 'INVALID_RESULT_COUNT'
  | 'FOLLOW_UP_NEEDED'
  | 'IMPOSSIBLE_REQUEST_UNHANDLED';

export interface CriticalExpect {
  contentType?: 'movie' | 'tv';
  originCountries?: string[]; // ISO-3166 codes that must be captured
  englishAudioRequired?: boolean;
  englishDubRequired?: boolean;
  networks?: string[]; // detectNetwork keys, e.g. 'hallmark'
  platformIds?: number[]; // TMDB provider ids, e.g. 8 = Netflix
  runtimeMaxMinutes?: number;
  exclude?: string[]; // excludedAttributes that must be present
  reference?: string; // a reference/"similar to" title that must be captured
  count?: number; // requested result count
  household?: string; // 'family' | co-watcher name
  /** Silence→Hallmark: the safe-catalog trait translation must be understood. */
  traitTranslation?: boolean;
  /** The request is contradictory/impossible → must clarify, never fabricate. */
  impossible?: boolean;
}

export interface CriticalCase {
  id: string;
  prompt: string;
  /** Cumulative multi-turn refinements applied after `prompt` (each appended). */
  turns?: string[];
  expect: CriticalExpect;
  hardConstraints: string[];
  notes?: string;
}

export const CRITICAL_SUITE: readonly CriticalCase[] = [
  {
    id: 'crit-01-spanish-english-audio-christmas-story',
    prompt: 'Show me a Spanish film with English audio similar to A Christmas Story.',
    expect: { contentType: 'movie', originCountries: ['ES'], englishAudioRequired: true, reference: 'A Christmas Story' },
    hardConstraints: ['movie', 'spanish_origin', 'verified_english_audio'],
    notes: 'Flagship. Must keep Spanish origin AND English audio AND the reference.',
  },
  {
    id: 'crit-02-silence-lambs-on-hallmark',
    prompt: 'I want a movie like The Silence of the Lambs, but it is on the Hallmark Channel.',
    expect: { contentType: 'movie', networks: ['hallmark'], reference: 'The Silence of the Lambs', traitTranslation: true },
    hardConstraints: ['movie', 'hallmark_availability'],
    notes: 'Flagship. Translate investigation/psychological traits into the safe Hallmark catalog — not literal serial-killer gore.',
  },
  {
    id: 'crit-03-foreign-crime-english-audio-couple',
    prompt: 'Find me a foreign crime film with English audio for my wife and me.',
    expect: { contentType: 'movie', englishAudioRequired: true, household: 'family' },
    hardConstraints: ['movie', 'foreign_origin', 'verified_english_audio', 'couple_fit'],
  },
  {
    id: 'crit-04-rocky-like-prime-no-animation',
    prompt: 'Something like Rocky, but not animated, available on Prime.',
    expect: { reference: 'Rocky', platformIds: [9], exclude: ['animation'] },
    hardConstraints: ['prime_availability', 'no_animation'],
  },
  {
    id: 'crit-05-three-netflix-three-prime',
    prompt: 'Three Netflix thrillers and three Prime Video mysteries for my wife and me.',
    expect: { platformIds: [8], household: 'family' },
    hardConstraints: ['three_per_platform', 'netflix', 'prime'],
    notes: 'Multi-platform split request; couple personalization.',
  },
  {
    id: 'crit-06-korean-thriller-under-2h-english-dub',
    prompt: 'A Korean thriller under two hours with an English dub.',
    expect: { contentType: 'movie', originCountries: ['KR'], englishAudioRequired: true, englishDubRequired: true, runtimeMaxMinutes: 120 },
    hardConstraints: ['movie', 'korean_origin', 'english_dub', 'runtime_le_120'],
  },
  {
    id: 'crit-07-british-detective-no-supernatural',
    prompt: 'A recent British detective series without supernatural elements.',
    expect: { contentType: 'tv', originCountries: ['GB'], exclude: ['supernatural'] },
    hardConstraints: ['tv', 'british_origin', 'no_supernatural', 'recent'],
  },
  {
    id: 'crit-08-family-movie-not-animated',
    prompt: 'A family movie that is not animated.',
    expect: { contentType: 'movie', exclude: ['animation'] },
    hardConstraints: ['movie', 'no_animation', 'family_friendly'],
  },
  {
    id: 'crit-09-psych-thriller-no-slow-burn',
    prompt: 'A recent psychological thriller with no slow burn.',
    expect: { contentType: 'movie', exclude: ['slow_burn'] },
    hardConstraints: ['no_slow_burn', 'recent'],
  },
  {
    id: 'crit-10-hallmark-mystery-stronger-suspense',
    prompt: 'A Hallmark mystery with the psychological tension of Gone Girl.',
    expect: { networks: ['hallmark'], reference: 'Gone Girl', traitTranslation: true },
    hardConstraints: ['hallmark_availability'],
  },
  {
    id: 'crit-11-foreign-christmas-english-dub',
    prompt: 'A French Christmas comedy with English audio, appropriate for teenagers.',
    expect: { contentType: 'movie', originCountries: ['FR'], englishAudioRequired: true },
    hardConstraints: ['movie', 'french_origin', 'verified_english_audio', 'teen_appropriate'],
  },
  {
    id: 'crit-12-netflix-included-not-rental',
    prompt: 'A Netflix thriller included with my subscription, not a rental.',
    expect: { platformIds: [8] },
    hardConstraints: ['netflix', 'subscription_included_not_rental'],
  },
  {
    id: 'crit-13-movie-not-a-show',
    prompt: 'Show me a good crime movie, not a TV series.',
    expect: { contentType: 'movie' },
    hardConstraints: ['movie_not_tv'],
  },
  {
    id: 'crit-14-under-100-minutes',
    prompt: 'A tense crime movie under 100 minutes.',
    expect: { contentType: 'movie', runtimeMaxMinutes: 100 },
    hardConstraints: ['movie', 'runtime_le_100'],
  },
  {
    id: 'crit-15-no-violence-against-children',
    prompt: 'A fast-paced crime movie from Spain, English dubbed, under 110 minutes, no violence against children.',
    expect: { contentType: 'movie', originCountries: ['ES'], englishAudioRequired: true, englishDubRequired: true, runtimeMaxMinutes: 110, exclude: ['violence_against_children'] },
    hardConstraints: ['movie', 'spanish_origin', 'english_dub', 'runtime_le_110', 'no_violence_against_children'],
  },
  {
    id: 'crit-16-gone-girl-but-lighter',
    prompt: 'Something like Gone Girl but lighter.',
    expect: { reference: 'Gone Girl' },
    hardConstraints: ['reference_similarity'],
  },
  {
    id: 'crit-17-home-alone-for-adults',
    prompt: 'A movie similar to Home Alone but for adults.',
    expect: { reference: 'Home Alone' },
    hardConstraints: ['reference_similarity'],
  },
  {
    id: 'crit-18-crime-for-teenagers',
    prompt: 'A crime movie appropriate for teenagers.',
    expect: { contentType: 'movie' },
    hardConstraints: ['movie', 'teen_appropriate'],
  },
  {
    id: 'crit-19-spanish-thriller-tonight',
    prompt: 'A Spanish thriller I can watch tonight.',
    expect: { originCountries: ['ES'] },
    hardConstraints: ['spanish_origin', 'available_now'],
  },
  {
    id: 'crit-20-multiturn-hallmark-newer-included-no-supernatural',
    prompt: 'Find me something like Silence of the Lambs on Hallmark.',
    turns: ['not that, something newer', 'needs to be included, not a rental', 'and my wife hates supernatural stuff'],
    expect: { networks: ['hallmark'], reference: 'Silence of the Lambs', exclude: ['supernatural'], household: 'family', traitTranslation: true },
    hardConstraints: ['hallmark_availability', 'no_supernatural', 'included_not_rental'],
    notes: 'Multi-turn: refinements must accumulate (newer + included + no supernatural + wife) without dropping earlier constraints.',
  },
] as const;

/** The impossible/contradictory cases the engine must refuse to fabricate for. */
export const IMPOSSIBLE_SUITE: readonly CriticalCase[] = [
  { id: 'imp-01-hallmark-as-violent-as-silence', prompt: 'A Hallmark movie exactly as violent as The Silence of the Lambs.', expect: { impossible: true, networks: ['hallmark'] }, hardConstraints: ['contradiction'] },
  { id: 'imp-02-2026-from-1985', prompt: 'A 2026 movie from 1985.', expect: { impossible: true }, hardConstraints: ['contradiction'] },
  { id: 'imp-03-english-audio-but-original-only', prompt: 'English audio required, but original-language audio only.', expect: { impossible: true }, hardConstraints: ['contradiction'] },
] as const;
