/**
 * Combinatorial search-validation generator. Produces thousands of realistic
 * multi-constraint search prompts by crossing the dimensions the product must
 * understand — origin, language, audio, platform, runtime, genre, reference
 * title, exclusions, media type — with a deterministic seed so any failure is
 * reproducible. Each case carries the structured expected intent + hard
 * constraints its wording implies, so the grader can verify, per case, that the
 * REAL parser understood it. Pure; no I/O.
 */
import type { CriticalCase } from './suite';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Origin { adj: string; country: string; lang: string }
const ORIGINS: Origin[] = [
  { adj: 'Spanish', country: 'ES', lang: 'es' },
  { adj: 'Korean', country: 'KR', lang: 'ko' },
  { adj: 'French', country: 'FR', lang: 'fr' },
  { adj: 'Italian', country: 'IT', lang: 'it' },
  { adj: 'German', country: 'DE', lang: 'de' },
  { adj: 'Japanese', country: 'JP', lang: 'ja' },
  { adj: 'Mexican', country: 'MX', lang: 'es' },
];

interface Platform { phrase: string; kind: 'network' | 'platform'; key?: string; id?: number }
const PLATFORMS: Platform[] = [
  { phrase: 'on Netflix', kind: 'platform', id: 8 },
  { phrase: 'on Prime', kind: 'platform', id: 9 },
  { phrase: 'on Hulu', kind: 'platform', id: 15 },
  { phrase: 'on Max', kind: 'platform', id: 1899 },
  { phrase: 'on Disney+', kind: 'platform', id: 337 },
  { phrase: 'on Hallmark', kind: 'network', key: 'hallmark' },
];

const GENRES = ['crime', 'mystery', 'thriller', 'comedy', 'romance', 'horror', 'documentary', 'detective', 'action'];
const REFERENCES = ['Rocky', 'Knives Out', 'The Silence of the Lambs', 'Gone Girl', 'Home Alone', 'Se7en', 'Die Hard'];
const RUNTIMES = [
  { phrase: 'under 90 minutes', max: 90 },
  { phrase: 'under 100 minutes', max: 100 },
  { phrase: 'under 110 minutes', max: 110 },
  { phrase: 'under two hours', max: 120 },
];
const AUDIO = [
  { phrase: 'with English audio', dub: false },
  { phrase: 'dubbed in English', dub: true },
];
const EXCLUSIONS = [
  { phrase: ', not animated', tag: 'animation' },
  { phrase: ', no supernatural stuff', tag: 'supernatural' },
];

const pick = <T,>(arr: T[], r: () => number): T => arr[Math.floor(r() * arr.length)]!;
const chance = (p: number, r: () => number) => r() < p;

/** Generate `n` deterministic combinatorial cases from `seed`. */
export function generateCases(n: number, seed = 1): CriticalCase[] {
  const r = mulberry32(seed);
  const out: CriticalCase[] = [];
  for (let i = 0; i < n; i++) {
    const media: 'movie' | 'tv' = chance(0.75, r) ? 'movie' : 'tv';
    const useOrigin = chance(0.55, r);
    const usePlatform = chance(0.5, r);
    const useRuntime = media === 'movie' && chance(0.4, r);
    const useAudio = useOrigin && chance(0.6, r);
    const useRef = chance(0.35, r);
    const useExcl = chance(0.3, r);

    const origin = useOrigin ? pick(ORIGINS, r) : null;
    const platform = usePlatform ? pick(PLATFORMS, r) : null;
    const runtime = useRuntime ? pick(RUNTIMES, r) : null;
    const audio = useAudio ? pick(AUDIO, r) : null;
    const genre = pick(GENRES, r);
    const ref = useRef ? pick(REFERENCES, r) : null;
    const excl = useExcl ? pick(EXCLUSIONS, r) : null;
    const noun = media === 'movie' ? (chance(0.5, r) ? 'movie' : 'film') : 'series';

    // Assemble a natural prompt.
    const parts = ['A'];
    if (origin) parts.push(origin.adj);
    parts.push(genre, noun);
    if (ref) parts.push(`like ${ref}`);
    if (platform) parts.push(platform.phrase);
    if (audio) parts.push(audio.phrase);
    if (runtime) parts.push(runtime.phrase);
    let prompt = parts.join(' ');
    if (excl) prompt += excl.phrase;
    prompt += '.';

    // Structured expectation (parse-level hard constraints).
    const expect: CriticalCase['expect'] = {};
    const hard: string[] = [];
    if (media === 'movie') { expect.contentType = 'movie'; }
    if (media === 'tv') { expect.contentType = 'tv'; }
    if (origin) { expect.originCountries = [origin.country]; hard.push(`origin_${origin.country}`); }
    if (audio) { expect.englishAudioRequired = true; if (audio.dub) expect.englishDubRequired = true; hard.push('english_audio'); }
    if (platform?.kind === 'platform') { expect.platformIds = [platform.id!]; hard.push('platform'); }
    if (platform?.kind === 'network') { expect.networks = [platform.key!]; hard.push('network'); }
    if (runtime) { expect.runtimeMaxMinutes = runtime.max; hard.push('runtime'); }
    if (ref) { expect.reference = ref; hard.push('reference'); }
    if (excl) { expect.exclude = [excl.tag]; hard.push(`exclude_${excl.tag}`); }

    out.push({ id: `gen-${seed}-${i}`, prompt, expect, hardConstraints: hard });
  }
  return out;
}

/** The full dimension catalogue (for the report's "categories tested"). */
export const DIMENSIONS = {
  origins: ORIGINS.map((o) => o.adj),
  platforms: PLATFORMS.map((p) => p.phrase.replace('on ', '')),
  genres: GENRES,
  references: REFERENCES,
  runtimes: RUNTIMES.map((x) => x.phrase),
  audio: AUDIO.map((a) => a.phrase),
  exclusions: EXCLUSIONS.map((e) => e.tag),
};
