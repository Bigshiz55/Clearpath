/**
 * STRUCTURED QUERY PLANNER (pure). Converts a natural-language recommendation
 * request into an explicit plan of HARD constraints BEFORE any retrieval — the
 * step whose absence let "three movies on Lifetime" return TV shows on unrelated
 * networks. It preserves every explicit constraint (count, media type, source)
 * and marks them required, so downstream validation can filter before ranking.
 * No I/O; unit-tested.
 */
import { normalizeMediaWord, resolveSource, type MediaKind, type CanonicalSource } from '@/lib/nlu/mediaOntology';

export interface PlannedSource {
  canonicalName: string;
  sourceType: CanonicalSource['sourceType'];
  networkKey?: string;
  providerId?: number;
  required: boolean;
}

export interface QueryGroup {
  mediaTypes: MediaKind[];
  sources: PlannedSource[];
  count: number | null;
}

export interface QueryPlan {
  intent: 'recommendation' | 'exact_title' | 'similar_to' | 'discovery';
  count: { requested: number | null; minimum: number | null; maximum: number | null };
  mediaTypes: MediaKind[]; // empty = no media constraint
  sources: PlannedSource[]; // required sources (union unless grouped)
  personalized: boolean;
  uniqueResults: boolean;
  regionRequired: boolean;
  /** Multi-group requests ("2 on Lifetime and 3 on Hulu") fill independently. */
  groups: QueryGroup[] | null;
  /** Human-readable hard constraints for logs/reports. */
  hardConstraints: string[];
  ambiguities: string[];
  rawQuery: string;
}

const WORD_NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2, few: 3, several: 4 };

/** Extract an explicit requested count. Null when unspecified. */
export function extractCount(text: string): number | null {
  const t = text.toLowerCase();
  const digit = t.match(/\b(\d{1,3})\b/);
  if (digit) { const n = Number(digit[1]); if (n >= 1 && n <= 100) return n; }
  const word = t.match(/\b(a couple(?: of)?|a few|several|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  if (word) {
    const key = word[1]!.replace(/^a /, '').replace(/ of$/, '').trim();
    return WORD_NUM[key] ?? null;
  }
  return null;
}

const PERSONAL_CUE = /\b(i should watch|i'?d (?:like|enjoy|love)|i would (?:like|enjoy|love)|i (?:want|need)|for me|recommend|my match|i'?ll like|we'?d (?:both )?like|for (?:me|us|my)|good for me)\b/i;
const SIMILARITY_CUE = /\b(like|similar to|reminds me of|in the vein of|-like\b)\b/i;

const MEDIA_WORD = /\b(movies?|films?|features?|flicks?|shows?|series|tv series|tv shows?|programmes?|programs?|sitcoms?|mini-?series|limited series|documentar(?:y|ies)|docs?|episodes?)\b/gi;

function toPlanned(s: CanonicalSource, required: boolean): PlannedSource {
  return { canonicalName: s.canonicalName, sourceType: s.sourceType, networkKey: s.networkKey, providerId: s.providerId, required };
}

/** Detect all media kinds named in a text span. Strips the verb "show me/us"
 *  first so the request verb is never mistaken for the media word "show". */
function mediaTypesIn(text: string): MediaKind[] {
  const cleaned = text.replace(/\bshows?\s+(?:me|us|them)\b/gi, ' ');
  const out = new Set<MediaKind>();
  const m = cleaned.match(MEDIA_WORD) ?? [];
  for (const w of m) { const k = normalizeMediaWord(w); if (k) out.add(k); }
  return [...out];
}

/** Split "2 movies on Lifetime and 3 shows on Hulu" into independent groups.
 *  Returns null when the text is not a multi-group request. */
function splitGroups(text: string): QueryGroup[] | null {
  // Only treat as multi-group when there are ≥2 "<count> <media> on <source>"
  // segments joined by "and". Conservative to avoid false splits.
  const segRe = /(\d+|a couple(?: of)?|a few|one|two|three|four|five|six|seven|eight|nine|ten)\s+([a-z ]*?(?:movies?|films?|shows?|series|documentar(?:y|ies)))\s+(?:on|from)\s+([a-z0-9+ ]+?)(?=\s+and\s+\d|\s+and\s+(?:a|one|two|three|four|five|six|seven|eight|nine|ten)\b|$)/gi;
  const groups: QueryGroup[] = [];
  let m: RegExpExecArray | null;
  while ((m = segRe.exec(text)) !== null) {
    const count = extractCount(m[1]!);
    const media = mediaTypesIn(m[2]!);
    const src = resolveSource(m[3]!);
    if (src) groups.push({ count, mediaTypes: media, sources: [toPlanned(src, true)] });
  }
  return groups.length >= 2 ? groups : null;
}

/** Resolve EVERY source named in the text (union). */
function allSources(text: string): PlannedSource[] {
  const found: PlannedSource[] = [];
  const seen = new Set<string>();
  // Scan token windows so multiple "on X ... on Y" both resolve.
  for (const m of text.matchAll(/\b(?:on|from|via|available on|streaming on)\s+([a-z0-9+ ]{2,30})/gi)) {
    const s = resolveSource(m[1]!);
    if (s && !seen.has(s.canonicalName)) { seen.add(s.canonicalName); found.push(toPlanned(s, true)); }
  }
  // Also a bare leading network/provider ("Lifetime movies", "Netflix thrillers").
  if (found.length === 0) {
    const s = resolveSource(text);
    if (s) found.push(toPlanned(s, true));
  }
  return found;
}

/** Build the structured plan. Pure. */
export function buildQueryPlan(rawQuery: string): QueryPlan {
  const text = (rawQuery ?? '').slice(0, 300);
  const ambiguities: string[] = [];
  const count = extractCount(text);
  const mediaTypes = mediaTypesIn(text);
  const personalized = PERSONAL_CUE.test(text);
  const groups = splitGroups(text);
  const sources = groups ? groups.flatMap((g) => g.sources) : allSources(text);

  // Intent: similarity cue wins; else if a count/media/source recommendation
  // shape is present → recommendation; else discovery.
  let intent: QueryPlan['intent'];
  if (SIMILARITY_CUE.test(text) && !/\b(life ?time|hallmark)\b/i.test(text.replace(SIMILARITY_CUE, ''))) {
    intent = 'similar_to';
  } else if (count != null || mediaTypes.length > 0 || sources.length > 0 || personalized) {
    intent = 'recommendation';
  } else {
    intent = 'discovery';
  }

  const hard: string[] = [];
  if (count != null) hard.push(`count=${count}`);
  for (const mt of mediaTypes) hard.push(`mediaType=${mt}`);
  for (const s of sources) hard.push(`source=${s.canonicalName}(${s.sourceType})`);

  // Ambiguity: a Hallmark-family source named generically may need a follow-up.
  const hallmarkGeneric = /\bhallmark\b/i.test(text) && !/hallmark (channel|mystery|movies now|drama)/i.test(text);
  if (hallmarkGeneric) ambiguities.push('Should I use all Hallmark services, or only Hallmark Channel?');

  return {
    intent,
    count: { requested: count, minimum: count, maximum: count },
    mediaTypes,
    sources,
    personalized,
    uniqueResults: true,
    regionRequired: sources.some((s) => s.sourceType === 'network' || s.sourceType === 'streaming_provider'),
    groups,
    hardConstraints: hard,
    ambiguities,
    rawQuery: text,
  };
}
