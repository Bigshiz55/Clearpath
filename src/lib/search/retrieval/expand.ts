/**
 * Stage 2 — Query Expansion. PURE + deterministic. Generates a de-duplicated set
 * of alternate queries (target 20–100 for a non-trivial input) using spelling
 * correction, pluralization/singularization, franchise expansion, aliases,
 * abbreviations, semantic equivalents, and common user wording. TMDB alternate
 * titles are an ASYNC source (see sources.ts) and are merged in by the pipeline;
 * this pure stage covers everything derivable without I/O.
 */
import { TITLE_ALIASES, normalizeTitleAlias } from '@/lib/nlu/detectors';
import { normTitle } from '@/lib/search/titleMatch';
import { stripGreeting } from './intent';
import type { Expansion, ExpansionKind, Intent } from './types';

/** Common misspellings → correction, applied as whole-word substitutions. */
const TYPO_MAP: Record<string, string> = {
  freind: 'friend', freinds: 'friends', teh: 'the', recomend: 'recommend',
  recomendation: 'recommendation', reccommend: 'recommend', moive: 'movie', moives: 'movies',
  serie: 'series', charater: 'character', avengers: 'avengers', gaurdians: 'guardians',
  spiderman: 'spider-man', starwars: 'star wars', hobbit: 'hobbit', intersteller: 'interstellar',
  inceptio: 'inception', godzila: 'godzilla', jurrasic: 'jurassic', harrypotter: 'harry potter',
  batman: 'batman', deadpol: 'deadpool', gladiaor: 'gladiator', shawshank: 'shawshank',
};

/** Genre / mood synonyms → the canonical genre word (semantic equivalents). */
const SEMANTIC: Record<string, string[]> = {
  scary: ['horror', 'thriller'], funny: ['comedy'], hilarious: ['comedy'], sad: ['drama', 'tearjerker'],
  romantic: ['romance', 'rom-com'], spooky: ['horror'], action: ['action', 'adventure'],
  thrilling: ['thriller'], animated: ['animation'], kids: ['family', 'animation'], smart: ['thriller', 'mystery'],
  feelgood: ['comedy', 'feel-good'], dark: ['thriller', 'drama'], epic: ['adventure', 'fantasy'],
};

/** Reverse alias map: full title → its known abbreviations. */
const FULL_TO_ABBR: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const [abbr, full] of Object.entries(TITLE_ALIASES)) {
    (out[full.toLowerCase()] ??= []).push(abbr);
  }
  return out;
})();

const levenshtein = (a: string, b: string): number => {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const d = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = d[0]!; d[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = d[j]!;
      d[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, d[j]!, d[j - 1]!);
      prev = tmp;
    }
  }
  return d[n]!;
};

function pluralize(w: string): string | null {
  if (/([^aeiou])y$/i.test(w)) return w.replace(/y$/i, 'ies');
  if (/(s|x|z|ch|sh)$/i.test(w)) return w + 'es';
  if (/s$/i.test(w)) return null;
  return w + 's';
}
function singularize(w: string): string | null {
  if (/ies$/i.test(w)) return w.replace(/ies$/i, 'y');
  if (/(ss)es$/i.test(w)) return w.replace(/es$/i, '');
  if (/(x|z|ch|sh)es$/i.test(w)) return w.replace(/es$/i, '');
  if (/s$/i.test(w) && !/ss$/i.test(w)) return w.replace(/s$/i, '');
  return null;
}

/** Fix obvious typos word-by-word (whole-word map + a small fuzzy pass). */
function correctSpelling(text: string): string | null {
  const words = text.split(/\s+/);
  let changed = false;
  const fixed = words.map((w) => {
    const key = w.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (TYPO_MAP[key]) { changed = true; return TYPO_MAP[key]; }
    return w;
  });
  return changed ? fixed.join(' ') : null;
}

export function expandQueries(rawText: string, intent: Intent, max = 100): Expansion[] {
  const text = stripGreeting(rawText.trim());
  const seen = new Set<string>();
  const out: Expansion[] = [];
  const add = (query: string, kind: ExpansionKind, weight: number) => {
    const q = query.trim();
    if (q.length < 2) return;
    const key = normTitle(q) + '|' + kind;
    const dedupe = normTitle(q);
    if (seen.has(dedupe) && kind !== 'original') return;
    if (out.some((e) => e.query.toLowerCase() === q.toLowerCase())) return;
    seen.add(dedupe);
    out.push({ query: q, kind, weight: Math.round(weight * 100) / 100 });
  };

  add(text, 'original', 1);
  const low = text.toLowerCase().replace(/[?.!]+$/, '');
  add(low, 'normalized', 0.98);

  // spelling correction
  const spell = correctSpelling(text);
  if (spell) add(spell, 'spelling', 0.9);

  // alias / abbreviation expansion (both directions)
  const aliasFull = normalizeTitleAlias(low);
  if (aliasFull.toLowerCase() !== low) add(aliasFull, 'alias', 0.88);
  const abbrs = FULL_TO_ABBR[aliasFull.toLowerCase()] ?? FULL_TO_ABBR[low];
  for (const a of abbrs ?? []) add(a, 'abbreviation', 0.6);

  // the detected title/franchise/reference entity as its own query
  for (const ent of [intent.entities.title, intent.entities.franchise].filter(Boolean) as string[]) {
    add(ent, 'wording', 0.85);
    const en = normalizeTitleAlias(ent.toLowerCase());
    if (en.toLowerCase() !== ent.toLowerCase()) add(en, 'alias', 0.84);
  }

  // per-word plural/singular + typo variants across the phrase
  const words = low.split(/\s+/).filter(Boolean);
  words.forEach((w, i) => {
    for (const variant of [pluralize(w), singularize(w)]) {
      if (!variant || variant === w) continue;
      const kind: ExpansionKind = variant.length > w.length ? 'plural' : 'singular';
      const swapped = [...words]; swapped[i] = variant;
      add(swapped.join(' '), kind, 0.72);
    }
    // fuzzy single-word typo repair against the typo lexicon
    const cands = Object.values(TYPO_MAP);
    let best: string | null = null, bestD = 2;
    for (const c of cands) { const d = levenshtein(w, c); if (d > 0 && d < bestD) { bestD = d; best = c; } }
    if (best && w.length >= 4) { const swapped = [...words]; swapped[i] = best; add(swapped.join(' '), 'spelling', 0.66); }
  });

  // contiguous multi-word sub-phrases (length >= 2) — real alternate queries a
  // user might type ("the lord of the rings" → "lord of the rings", "the rings").
  if (words.length >= 3) {
    for (let len = words.length - 1; len >= 2; len--) {
      for (let i = 0; i + len <= words.length; i++) add(words.slice(i, i + len).join(' '), 'wording', 0.5);
    }
  }

  // franchise expansion: append franchise scope words
  if (intent.kind === 'franchise' || intent.entities.franchise || words.length <= 4) {
    const base = intent.entities.franchise ?? aliasFull;
    for (const suffix of ['movies', 'series', 'collection', 'saga', 'complete series', 'trilogy', 'all movies']) add(`${base} ${suffix}`, 'franchise', 0.68);
  }

  // semantic equivalents for mood/genre words
  words.forEach((w) => {
    for (const syn of SEMANTIC[w] ?? []) {
      add(low.replace(new RegExp(`\\b${w}\\b`, 'i'), syn), 'semantic', 0.62);
      add(syn, 'semantic', 0.5);
    }
  });

  // common wording variants (help conversational / incomplete inputs)
  const core = intent.entities.title ?? aliasFull;
  for (const tmpl of [`${core}`, `${core} movie`, `${core} show`, `the ${core}`, `watch ${core}`]) {
    add(tmpl, 'wording', 0.55);
  }

  return out.slice(0, max);
}
