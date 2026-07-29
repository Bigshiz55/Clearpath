import 'server-only';

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
  subjectNames: string[];
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

const NAME_STOPWORDS = new Set([
  'The', 'A', 'An', 'In', 'On', 'At', 'Is', 'It', 'His', 'Her', 'They', 'She', 'He', 'Who', 'What',
  'When', 'Where', 'Why', 'How', 'This', 'That', 'New', 'North', 'South', 'East', 'West', 'Dateline',
  'CBS', 'ABC', 'NBC',
]);

/** 2-3 consecutive capitalized words, filtered against common non-name openers and the location gazetteer. */
function extractSubjectNames(text: string): string[] {
  const found = new Set<string>();
  const re = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const candidate = m[1]!;
    const firstWord = candidate.split(' ')[0]!;
    if (NAME_STOPWORDS.has(firstWord)) continue;
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

/** Pure — extracts structured Case identifiers from one episode's title + synopsis. */
export function extractCaseIdentifiers(episode: EpisodeInput): CaseIdentifiers {
  const text = `${episode.title}. ${episode.synopsis}`;
  return {
    subjectNames: extractSubjectNames(text),
    location: extractLocation(text),
    year: extractYear(text, episode.airdate),
    crimeType: extractCrimeType(text),
  };
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
 */
export function runExtractionBatch(episodes: EpisodeInput[]): ExtractionBatchReport {
  const start = performance.now();
  const results = episodes.map((episode) => ({
    tvmazeEpisodeId: episode.tvmazeEpisodeId,
    identifiers: extractCaseIdentifiers(episode),
  }));
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
