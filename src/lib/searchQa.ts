/**
 * SEARCH QA — pure assembly of the "what did the engine understand?" funnel for
 * one query. Runs the SAME offline parse the live pipeline uses (naiveParseQuery
 * → augmentInternational → detectors → searchConfidence) and returns a fully
 * structured view: normalized query, intent, reference, hard constraints, soft
 * preferences, the clarify decision and per-dimension confidence.
 *
 * It deliberately does NO I/O, so it is unit-testable and safe on the client.
 * The live-only sections (candidate funnel, per-title metadata evidence, real
 * availability) are represented as explicit `null` + an `unavailableReason`, so
 * the dashboard shows an honest "requires TMDB" rather than a fabricated number.
 */
import { naiveParseQuery } from '@/lib/finderParse';
import { augmentInternational } from '@/lib/askInternational';
import {
  detectNetwork,
  detectPlatform,
  detectOrigin,
} from '@/lib/nlu/detectors';
import { searchConfidence, type SearchSignals, type SearchConfidence } from '@/lib/nlu/confidence';
import type { FinderQuery } from '@/lib/finder';

export interface QaConstraint {
  kind: string;
  value: string;
  /** How this constraint would be verified: at parse time, or only live. */
  verifiedBy: 'parse' | 'live_tmdb';
}

export interface SearchQaView {
  rawQuery: string;
  normalizedQuery: FinderQuery;
  detectedLanguages: string[]; // ISO-639-1 original-language cues, if any
  parsedIntent: string;
  reference: { title: string | null; resolvedTitleId: number | null; resolvedBy: 'live_tmdb' };
  hardConstraints: QaConstraint[];
  softPreferences: { key: string; value: string }[];
  confidence: SearchConfidence;
  followUp: { needed: boolean; question: string | null };
  retrievalSources: { name: string; available: boolean; note?: string }[];
  candidateFunnel: {
    beforeFilter: number | null;
    afterFilter: number | null;
    unavailableReason: string | null;
  };
}

/** A "similar to / like X" reference cue — pure, mirrors the live similar path. */
const REF_CUE = /\b(?:something|anything|a\s+(?:movie|film|show|series)|movies?|films?|shows?|series)?\s*(?:like|similar to|reminds? me of|in the vein of|along the lines of)\s+([^.?!,]{2,60})/i;

export function extractReferenceLite(text: string): string | null {
  const m = REF_CUE.exec(text);
  if (!m || !m[1]) return null;
  const t = m[1].replace(/^\s*(?:the|a|an|to)\s+/i, '').trim();
  return t.length >= 2 ? t : null;
}

function resolveIntent(text: string, hasReference: boolean, q: FinderQuery): string {
  if (!text.trim()) return 'unknown';
  if (hasReference) return 'similar_to';
  if (q.providerIds?.length) return 'platform_browse';
  return 'personalized_content_discovery';
}

/** Build the complete offline QA view for a query. No I/O. */
export function buildSearchQa(rawQuery: string): SearchQaView {
  const text = rawQuery.slice(0, 300);
  const base = text.trim() ? naiveParseQuery(text) : ({ ...naiveParseQuery('') } as FinderQuery);
  const q = augmentInternational({ ...base }, text);

  const origin = detectOrigin(text);
  const network = detectNetwork(text);
  const platform = detectPlatform(text);
  const reference = extractReferenceLite(text);
  const parsedIntent = resolveIntent(text, Boolean(reference), q);

  // Hard constraints — the ones that INVALIDATE a wrong result.
  const hard: QaConstraint[] = [];
  if (q.mediaType && q.mediaType !== 'any') hard.push({ kind: 'media_type', value: q.mediaType, verifiedBy: 'parse' });
  for (const c of q.originCountries ?? []) hard.push({ kind: 'origin_country', value: c, verifiedBy: 'parse' });
  for (const l of q.originalLanguages ?? []) hard.push({ kind: 'original_language', value: l, verifiedBy: 'parse' });
  if (q.englishAudioOnly) hard.push({ kind: 'english_audio', value: 'required', verifiedBy: 'live_tmdb' });
  if (network) hard.push({ kind: 'network', value: network.key, verifiedBy: 'live_tmdb' });
  if (platform) hard.push({ kind: 'platform', value: platform.name, verifiedBy: 'live_tmdb' });
  for (const id of q.providerIds ?? []) hard.push({ kind: 'provider_id', value: String(id), verifiedBy: 'live_tmdb' });
  if (q.maxRuntime != null) hard.push({ kind: 'runtime_max', value: `${q.maxRuntime}m`, verifiedBy: 'live_tmdb' });

  // Soft preferences — affect ranking only.
  const soft: { key: string; value: string }[] = [];
  for (const g of q.genreIds ?? []) soft.push({ key: 'genre_id', value: String(g) });
  if (q.pace != null) soft.push({ key: 'pace', value: String(q.pace) });
  if (q.minImdb != null) soft.push({ key: 'min_imdb', value: String(q.minImdb) });
  if (q.sinceMonths != null) soft.push({ key: 'since_months', value: String(q.sinceMonths) });

  const signals: SearchSignals = {
    intent: parsedIntent === 'personalized_content_discovery' ? 'discovery' : parsedIntent,
    originCountries: q.originCountries ?? [],
    englishAudioRequired: Boolean(q.englishAudioOnly),
    audioVerifiable: false, // offline: no live availability to verify against
    networks: network ? [network.key] : [],
    platforms: [...(q.providerIds ?? []), ...(platform ? [platform.id] : [])],
    runtimeMax: q.maxRuntime ?? null,
    reference,
    ambiguities: [],
    requested: {
      origin: origin.countries.length > 0 || /\b(foreign|international|non-?english)\b/i.test(text),
      audio: Boolean(q.englishAudioOnly) || /\b(english audio|dub|subtitle)/i.test(text),
      platform: Boolean(network || platform || q.providerIds?.length),
      runtime: q.maxRuntime != null || /\b(under|less than|hours?|minutes?)\b/i.test(text),
      reference: Boolean(reference),
    },
  };
  const confidence = searchConfidence(signals);

  return {
    rawQuery: text,
    normalizedQuery: q,
    detectedLanguages: q.originalLanguages ?? [],
    parsedIntent,
    reference: { title: reference, resolvedTitleId: null, resolvedBy: 'live_tmdb' },
    hardConstraints: hard,
    softPreferences: soft,
    confidence,
    followUp: confidence.clarify,
    retrievalSources: [
      { name: 'TMDB discover/search', available: false, note: 'TMDB_API_KEY not configured in this environment' },
    ],
    candidateFunnel: {
      beforeFilter: null,
      afterFilter: null,
      unavailableReason: 'Live candidate retrieval requires TMDB_API_KEY (not configured).',
    },
  };
}
