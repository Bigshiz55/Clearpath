import 'server-only';
import { isStoplistedCorrespondent } from './correspondentStoplist';

/**
 * Case-identifier extraction — a pure, deterministic (rule-based) extractor,
 * never an LLM call. Runs only as a batch job (`runExtractionBatch`), never
 * in a user request path. A real API-backed classifier (mirroring the
 * gpt-4o-mini pattern in src/lib/titleDimensions.ts) was considered, but no
 * OPENAI_API_KEY is configured in this environment — see the phase report.
 * The interface below is the seam a future LLM-backed extractor could sit
 * behind without touching callers.
 */

export interface EpisodeInput {
  tvmazeEpisodeId: number;
  series: string;
  network: string;
  title: string;
  airdate: string;
  synopsis: string;
}

export interface CaseIdentifiers {
  /**
   * Matching-safe subject names: everything in `rawSubjectNames` MINUS
   * known correspondents/narrators (the stoplist, applied here — episode
   * scoped, no batch needed) and, after a batch run, minus per-series
   * high-frequency names (see `runExtractionBatch`). This is the field
   * matching.ts reads — it never sees suppressed names, so no changes were
   * needed there.
   */
  subjectNames: string[];
  /**
   * Every name extraction found, before any correspondent suppression — a
   * stoplisted or frequency-suppressed name still appears here. Optional so
   * that `matching.ts` (which only ever reads `subjectNames` and doesn't
   * need this field) and its tests can keep constructing minimal identifier
   * literals unchanged; every real extraction always populates it.
   */
  rawSubjectNames?: string[];
  location: string | null;
  year: number | null;
  crimeType: string | null;
}

export interface ExtractionResult {
  tvmazeEpisodeId: number;
  identifiers: CaseIdentifiers;
}

// A small, fixed vocabulary — not episode content, just a classification
// taxonomy. First match in the list order wins when multiple appear.
const CRIME_TYPES: { label: string; pattern: RegExp }[] = [
  { label: 'serial killer', pattern: /\bserial killer\b/i },
  { label: 'kidnapping', pattern: /\bkidnap(?:ped|ping|per)?\b/i },
  { label: 'abduction', pattern: /\babduct(?:ed|ion)?\b/i },
  { label: 'disappearance', pattern: /\b(disappear(?:ance|ed|ing)?|missing|vanish(?:ing|ed)?)\b/i },
  { label: 'cold case', pattern: /\bcold case\b/i },
  { label: 'homicide', pattern: /\bhomicide\b/i },
  { label: 'murder', pattern: /\bmurder(?:ed|er)?\b/i },
  { label: 'arson', pattern: /\barson\b/i },
  { label: 'fraud', pattern: /\bfraud\b/i },
  { label: 'assault', pattern: /\bassault(?:ed)?\b/i },
  { label: 'robbery', pattern: /\brobbery\b/i },
  { label: 'domestic violence', pattern: /\bdomestic (?:violence|abuse)\b/i },
];

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
  'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania',
  'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
];

const MAJOR_CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio',
  'San Diego', 'Dallas', 'Austin', 'Memphis', 'Las Vegas', 'Miami', 'Atlanta', 'Boston', 'Seattle',
  'Denver', 'Detroit', 'Nashville', 'Portland', 'Baltimore', 'Milwaukee', 'Albuquerque', 'Tucson',
  'Sacramento', 'Cleveland', 'Orlando', 'St. Louis', 'Pittsburgh', 'Cincinnati', 'Kansas City',
  'Long Island', 'New Orleans', 'Charlotte', 'Columbus', 'Indianapolis', 'San Francisco', 'Jacksonville',
];

const LOCATIONS = [...new Set([...US_STATES, ...MAJOR_CITIES])].sort((a, b) => b.length - a.length);

/**
 * Strip diacritics for matching purposes only (e.g. "JonBenét" -> "JonBenet")
 * — extraction always keeps the original spelling in `subjectNames`; this is
 * used solely where two names need to be COMPARED (see matching.ts's
 * `normalizeName`), so "JonBenét" and "JonBenet" resolve to the same entity
 * without either extracted record losing its real, original form.
 */
export function normalizeDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const NAME_STOPWORDS = new Set([
  'The', 'A', 'An', 'In', 'On', 'At', 'Is', 'It', 'His', 'Her', 'They', 'She', 'He', 'Who', 'What',
  'When', 'Where', 'Why', 'How', 'This', 'That', 'New', 'North', 'South', 'East', 'West', 'Dateline',
  'CBS', 'ABC', 'NBC',
  // Common sentence-initial verbs/gerunds in headline-style synopses ("Did
  // Michele MacNeill...", "Remembering Michele MacNeill") — without these,
  // a leading gerund/auxiliary swallows the real name into a 3-word phrase
  // that fails to match the same name extracted without that lead-in.
  'Did', 'Does', 'Do', 'Was', 'Were', 'Could', 'Would', 'Should', 'Will', 'Has', 'Have', 'Had',
  'Remembering', 'Investigating', 'Following', 'Watching', 'Looking', 'Inside', 'Meet',
]);

// Name-token shapes, widest-to-narrowest so alternation prefers the longer
// compound match over a short prefix (e.g. "McDonald" over just "Mc"):
//  - COMPOUND: an internally-capitalized token with no separator — a short
//    capital+lowercase* prefix (Mc/Mac/De/Jon, up to 3 lowercase letters)
//    immediately followed by another capital+lowercase+ segment. Covers
//    McDonald, MacArthur, DeAngelo, JonBenet, and (via the accented-letter
//    range) JonBenét.
//  - APOSTROPHE: a single capital initial + apostrophe + capitalized word
//    (O'Neill, D'Angelo) — the only real-world case where a bare single
//    capital letter is a legitimate name segment.
//  - HYPHENATED: two capitalized words joined by a hyphen (Smith-Jones).
//  - PLAIN: an ordinary single capitalized word (John, Ramsey).
const LOWER = 'a-zà-öø-ÿ';
const UPPER = 'A-ZÀ-ÖØ-Þ';
const COMPOUND = `[${UPPER}][${LOWER}]{0,3}[${UPPER}][${LOWER}]+`;
const APOSTROPHE = `[${UPPER}]['’][${UPPER}][${LOWER}]+`;
const HYPHENATED = `[${UPPER}][${LOWER}]+-[${UPPER}][${LOWER}]+`;
const PLAIN = `[${UPPER}][${LOWER}]+`;

// Standalone-eligible: distinctive enough on their own (an internal capital,
// apostrophe, or hyphen is a strong name signal) to count as a subject even
// with no capitalized neighbor. PLAIN alone never qualifies standalone —
// ordinary capitalized words are too common — it only counts inside a 2-3
// word run (handled by ANY_WORD below).
const DISTINCTIVE = `(?:${COMPOUND}|${APOSTROPHE}|${HYPHENATED})`;
const ANY_WORD = `(?:${COMPOUND}|${APOSTROPHE}|${HYPHENATED}|${PLAIN})`;

const MULTI_WORD_NAME_RE = new RegExp(`\\b(${ANY_WORD}(?:\\s+${ANY_WORD}){1,2})\\b`, 'g');
const STANDALONE_DISTINCTIVE_NAME_RE = new RegExp(`\\b(${DISTINCTIVE})\\b`, 'g');

/**
 * "Correspondent" immediately before a name ("Correspondent Peter Van Sant
 * reports...", a recurring construction in this fixture set's 48 Hours
 * episodes) pushes the real 3-word name past this extractor's 3-word
 * window, truncating it to "Correspondent Peter Van" — which then can't
 * match the correspondent stoplist's clean "Peter Van Sant" entry. Stripped
 * before name-window matching only; every other extractor still sees the
 * full original text. Deliberately narrow (just this one word, not a wider
 * "Host/Anchor/Reporter/Narrator" list) — only "Correspondent" has evidence
 * in this fixture set of causing a truncation; a broader list risks
 * stripping those words out of real names/phrases without a concrete case
 * showing it's needed.
 */
const ROLE_PREFIX_RE = /\bCorrespondent\s+/g;

/**
 * 2-3 consecutive capitalized-token runs, plus standalone compound/
 * apostrophe/hyphenated surnames that don't need a capitalized neighbor to
 * be a real name (McDonald, O'Neill, Smith-Jones). Filtered against common
 * non-name openers and the location gazetteer.
 */
function extractSubjectNames(rawText: string): string[] {
  const text = rawText.replace(ROLE_PREFIX_RE, '');
  const found = new Set<string>();
  const spans: [number, number][] = [];

  let m: RegExpExecArray | null;
  MULTI_WORD_NAME_RE.lastIndex = 0;
  while ((m = MULTI_WORD_NAME_RE.exec(text))) {
    let candidate = m[1]!;
    let start = m.index;
    // A leading stopword ("The JonBenet Ramsey") shouldn't sink the whole
    // phrase — drop it and re-validate the shorter remainder ("JonBenet
    // Ramsey") instead of discarding a real name because of what preceded it.
    let firstWord = candidate.split(' ')[0]!;
    if (NAME_STOPWORDS.has(firstWord) && candidate.includes(' ')) {
      const dropped = firstWord.length + 1;
      candidate = candidate.slice(dropped);
      start += dropped;
      firstWord = candidate.split(' ')[0]!;
    }
    spans.push([start, start + candidate.length]);
    if (NAME_STOPWORDS.has(firstWord)) continue;
    if (LOCATIONS.includes(candidate)) continue;
    found.add(candidate);
  }

  STANDALONE_DISTINCTIVE_NAME_RE.lastIndex = 0;
  while ((m = STANDALONE_DISTINCTIVE_NAME_RE.exec(text))) {
    const candidate = m[1]!;
    const start = m.index;
    const end = start + m[0].length;
    // Skip if already covered by a multi-word match (avoid double-counting
    // "Ramsey" inside "JonBenét Ramsey" as a separate standalone entry).
    if (spans.some(([a, b]) => start < b && end > a)) continue;
    if (NAME_STOPWORDS.has(candidate)) continue;
    if (LOCATIONS.includes(candidate)) continue;
    found.add(candidate);
  }

  return [...found];
}

function extractLocation(text: string): string | null {
  for (const loc of LOCATIONS) {
    if (text.includes(loc)) return loc;
  }
  return null;
}

function extractYear(text: string, airdate: string): number | null {
  const m = text.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  if (m) return Number(m[0]);
  // Fall back to the air year only if no year is mentioned in the text —
  // still honest (it's the episode's real airdate), just a weaker signal.
  const airYear = Number(airdate?.slice(0, 4));
  return Number.isFinite(airYear) ? airYear : null;
}

function extractCrimeType(text: string): string | null {
  for (const { label, pattern } of CRIME_TYPES) {
    if (pattern.test(text)) return label;
  }
  return null;
}

/**
 * Pure — extracts structured Case identifiers from one episode's title +
 * synopsis. Applies the manual correspondent stoplist (episode-scoped, no
 * batch context needed); frequency-based suppression is a second pass that
 * only `runExtractionBatch` can do, since it needs stats across the series.
 */
export function extractCaseIdentifiers(episode: EpisodeInput): CaseIdentifiers {
  const text = `${episode.title}. ${episode.synopsis}`;
  const rawSubjectNames = extractSubjectNames(text);
  const subjectNames = rawSubjectNames.filter((name) => !isStoplistedCorrespondent(episode.series, name));
  return {
    subjectNames,
    rawSubjectNames,
    location: extractLocation(text),
    year: extractYear(text, episode.airdate),
    crimeType: extractCrimeType(text),
  };
}

/**
 * A name appearing in this fraction (or more) of one series' episodes is
 * treated as recurring production talent, not a Case subject, and is
 * suppressed from that series' `subjectNames` — a general safeguard beyond
 * the manual stoplist. Chosen deliberately at 25%, not the 80% used in the
 * accept-criteria example, because:
 *  - It comfortably triggers on the 80% example (well below it).
 *  - The most-recurring REAL Case subject actually observed in this fixture
 *    set — Jodi Arias, genuinely covered across 5 Snapped/20/20 episodes —
 *    sits at 5.0-8.3% of her series. No real individual is legitimately the
 *    subject of a quarter or more of an anthology true-crime series; a name
 *    at that rate is structurally a host/narrator, not a story.
 *  - 25% gives roughly 3x headroom over the highest observed legitimate
 *    repeat-subject rate, so it won't falsely suppress a real recurring case
 *    even as the fixture set grows, while still catching correspondents
 *    this file's manual stoplist doesn't yet know about.
 */
export const CORRESPONDENT_FREQUENCY_THRESHOLD = 0.25;

/**
 * Frequency suppression needs enough episodes to make a percentage mean
 * anything — a single-episode series would put any name it mentions at
 * 100% "frequency" without that being evidence of anything recurring.
 * Below this many episodes for a series, only the manual stoplist applies.
 */
const MIN_EPISODES_FOR_FREQUENCY_SUPPRESSION = 5;

/**
 * Batch-level, per-series correspondent suppression. Mutates each result's
 * `subjectNames` in place (removing any name at/above the frequency
 * threshold for that episode's series) — `rawSubjectNames` is left
 * untouched, so a suppressed name is still visible there. Per-series only:
 * a name frequent on one series never affects another series' episodes.
 */
function suppressFrequentNames(results: ExtractionResult[], episodes: EpisodeInput[]): void {
  const seriesById = new Map(episodes.map((e) => [e.tvmazeEpisodeId, e.series]));

  const seriesEpisodeCount = new Map<string, number>();
  const seriesNameCount = new Map<string, Map<string, number>>();
  for (const r of results) {
    const series = seriesById.get(r.tvmazeEpisodeId)!;
    seriesEpisodeCount.set(series, (seriesEpisodeCount.get(series) ?? 0) + 1);
    const nameCounts = seriesNameCount.get(series) ?? new Map<string, number>();
    for (const name of new Set(r.identifiers.subjectNames)) {
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    }
    seriesNameCount.set(series, nameCounts);
  }

  const suppressedBySeries = new Map<string, Set<string>>();
  for (const [series, nameCounts] of seriesNameCount) {
    const total = seriesEpisodeCount.get(series)!;
    const suppressed = new Set<string>();
    if (total >= MIN_EPISODES_FOR_FREQUENCY_SUPPRESSION) {
      for (const [name, count] of nameCounts) {
        if (count / total >= CORRESPONDENT_FREQUENCY_THRESHOLD) suppressed.add(name);
      }
    }
    suppressedBySeries.set(series, suppressed);
  }

  for (const r of results) {
    const series = seriesById.get(r.tvmazeEpisodeId)!;
    const suppressed = suppressedBySeries.get(series);
    if (suppressed && suppressed.size > 0) {
      r.identifiers.subjectNames = r.identifiers.subjectNames.filter((name) => !suppressed.has(name));
    }
  }
}

export interface ExtractionBatchReport {
  results: ExtractionResult[];
  count: number;
  durationMs: number;
  costUsd: number;
  costUsdPer1000: number;
  method: 'rule-based';
}

/**
 * Batch extraction over a full fixture/programme set. Never called from a
 * request handler — this is the job entry point. Rule-based, so the API
 * cost is genuinely $0; wall-clock cost is reported for capacity planning.
 * Applies per-series frequency-based correspondent suppression as a second
 * pass after per-episode extraction (the manual stoplist is already applied
 * per-episode in `extractCaseIdentifiers`).
 */
export function runExtractionBatch(episodes: EpisodeInput[]): ExtractionBatchReport {
  const start = performance.now();
  const results = episodes.map((episode) => ({
    tvmazeEpisodeId: episode.tvmazeEpisodeId,
    identifiers: extractCaseIdentifiers(episode),
  }));
  suppressFrequentNames(results, episodes);
  const durationMs = performance.now() - start;
  return {
    results,
    count: episodes.length,
    durationMs,
    costUsd: 0,
    costUsdPer1000: 0,
    method: 'rule-based',
  };
}
