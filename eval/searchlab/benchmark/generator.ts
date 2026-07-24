/**
 * Deterministic, SEEDED natural-language query generator for the retrieval
 * benchmark. Produces thousands of diverse NL queries by combining intent
 * templates × catalog entities × perturbations (typos, conversational wrappers,
 * pluralization, incomplete fragments, aliases). Seeded so a run is reproducible
 * and diffable across code changes (regression benchmarking).
 */
import { CATALOG_TITLES, type CatalogTitle } from './catalog';
import type { IntentKind } from '@/lib/search/retrieval/types';

export interface GeneratedQuery {
  text: string;
  expectedIntent: IntentKind;
  /** The catalog id this query should resolve to, when it names a real title. */
  expectedTitleId: string | null;
  /** Every generated query MUST NOT dead-end (recovery or confident result). */
  mustNeverDeadEnd: true;
  perturbations: string[];
}

/** mulberry32 — tiny seeded PRNG (deterministic; no Math.random). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ACTORS = ['Tom Hanks', 'Meryl Streep', 'Denzel Washington', 'Zendaya', 'Leonardo DiCaprio'];
const GENRES = ['horror', 'comedy', 'thriller', 'romance', 'sci-fi', 'drama'];
const MOODS = ['scary', 'funny', 'sad', 'feelgood', 'dark', 'epic'];
const CONV_PREFIX = ['', '', '', 'hey ', 'um ', 'ok so ', 'ugh ', 'i wanna find '];
const CONV_SUFFIX = ['', '', '', '?', ' please', ' lol', ' tonight'];

function pick<T>(r: () => number, xs: T[]): T { return xs[Math.floor(r() * xs.length)]!; }
function chance(r: () => number, p: number): boolean { return r() < p; }

function perturb(r: () => number, text: string, log: string[]): string {
  let out = text;
  if (chance(r, 0.35)) { out = pick(r, CONV_PREFIX) + out; if (out !== text) log.push('conv_prefix'); }
  if (chance(r, 0.3)) { out = out + pick(r, CONV_SUFFIX); log.push('conv_suffix'); }
  if (chance(r, 0.5)) out = out.toLowerCase();
  return out.replace(/\s+/g, ' ').trim();
}

type Builder = (r: () => number, t: CatalogTitle, log: string[]) => { text: string; intent: IntentKind; titleId: string | null } | null;

const BUILDERS: Builder[] = [
  // title lookup — exact, alias, typo, wording
  (r, t, log) => {
    const roll = r();
    if (roll < 0.4) return { text: t.title, intent: 'title_lookup', titleId: t.id };
    if (roll < 0.6 && t.typos.length) { log.push('typo'); return { text: pick(r, t.typos), intent: 'title_lookup', titleId: t.id }; }
    if (roll < 0.75 && t.aliases.length) { log.push('alias'); return { text: pick(r, t.aliases), intent: 'title_lookup', titleId: t.id }; }
    return { text: `watch ${t.title}`, intent: 'title_lookup', titleId: t.id };
  },
  // similar-to
  (r, t) => ({ text: pick(r, [`movies like ${t.title}`, `shows similar to ${t.title}`, `something like ${t.title}`, `more like ${t.title}`]), intent: 'similar_to', titleId: t.id }),
  // availability
  (r, t) => ({ text: pick(r, [`where can I watch ${t.title}`, `is ${t.title} on netflix`, `where to stream ${t.title}`]), intent: 'availability', titleId: t.id }),
  // franchise
  (r, t) => (t.franchise ? { text: pick(r, [`${t.franchise} movies`, `all the ${t.franchise} films`, `${t.franchise} collection`]), intent: 'franchise', titleId: null } : null),
];

const INTENTLESS: { text: () => string; intent: IntentKind }[] = [];

export function generateQueries(count: number, seed = 1234): GeneratedQuery[] {
  const r = rng(seed);
  const out: GeneratedQuery[] = [];

  const emit = (text: string, intent: IntentKind, titleId: string | null, log: string[]) => {
    const finalText = perturb(r, text, log);
    if (finalText.length < 2) return;
    out.push({ text: finalText, expectedIntent: intent, expectedTitleId: titleId, mustNeverDeadEnd: true, perturbations: [...log] });
  };

  while (out.length < count) {
    const roll = r();
    // ~70% title-anchored intents, ~30% title-less (genre/rec/schedule/upcoming/incomplete/conversational)
    if (roll < 0.7) {
      const t = pick(r, CATALOG_TITLES);
      const b = pick(r, BUILDERS);
      const built = b(r, t, []);
      if (built) emit(built.text, built.intent, built.titleId, []);
    } else {
      const kind = pick(r, ['genre', 'recommendation', 'schedule', 'upcoming', 'incomplete', 'conversational'] as IntentKind[]);
      const log: string[] = [];
      let text = '';
      switch (kind) {
        case 'genre': text = pick(r, [`a good ${pick(r, GENRES)} movie`, `something ${pick(r, MOODS)}`, `${pick(r, GENRES)} shows`]); break;
        case 'recommendation': text = pick(r, ['recommend me something', 'what should I watch', 'surprise me', 'anything good to watch']); break;
        case 'schedule': text = pick(r, ["what's on tonight", 'live tv right now', 'what is airing now']); break;
        case 'upcoming': text = pick(r, ['movies coming out soon', 'upcoming releases', 'new movies releasing']); break;
        case 'incomplete': text = pick(r, ['movies with the guy from', 'that show about', 'the one with', 'something like the']); log.push('incomplete'); break;
        case 'conversational': text = pick(r, ["i'm bored", 'hey any ideas', 'ugh find me something fun', 'i feel like watching something']); break;
        default: text = 'something to watch';
      }
      emit(text, kind, null, log);
    }
  }
  return out;
}

export { INTENTLESS };
