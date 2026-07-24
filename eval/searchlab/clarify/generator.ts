/**
 * Seeded multilingual ambiguous-query generator + curated adversarial cases for
 * the Clarification Engine benchmark. Deterministic (mulberry32). Each case carries
 * the expected CANONICAL intent, expected locale, and whether it is genuinely
 * ambiguous, so the benchmark can measure clarification precision/recall per locale.
 */
import type { CanonicalIntent } from '@/lib/search/clarify/canonical';

export interface ClarifyCase {
  id: string;
  query: string;
  appLocale: string;
  expectIntent: CanonicalIntent;
  expectTitleId: string | null;
  ambiguous: boolean;   // a genuinely ambiguous query SHOULD clarify
  scenario: string;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)]!;

/** {name} per-locale title tokens that resolve to a universal id. */
const TITLES = [
  { id: 'movie:1366', names: { en: 'Rocky', es: 'Rocky', zh: '洛奇', fr: 'Rocky', de: 'Rocky', pt: 'Rocky', ja: 'ロッキー', ar: 'روكي' } },
  { id: 'movie:414906', names: { en: 'Batman', es: 'Batman', zh: '蝙蝠侠', fr: 'Batman', de: 'Batman', pt: 'Batman', ja: 'バットマン', ar: 'باتمان' } },
  { id: 'movie:27205', names: { en: 'Inception', es: 'Origen', zh: '盗梦空间', fr: 'Inception', de: 'Inception', pt: 'A Origem', ja: 'インセプション', ar: 'روكي' } },
  { id: 'tv:19885', names: { en: 'Sherlock', es: 'Sherlock', zh: '神探夏洛克', fr: 'Sherlock', de: 'Sherlock', pt: 'Sherlock', ja: 'シャーロック', ar: 'شيرلوك' } },
];

/** Per-locale templates → canonical intent. {t} = a localized title token. */
const TEMPLATES: Record<string, { tmpl: string; intent: CanonicalIntent; ambiguous: boolean; needsTitle: boolean }[]> = {
  en: [
    { tmpl: 'where can I watch {t}', intent: 'streaming_lookup', ambiguous: false, needsTitle: true },
    { tmpl: '{t} coming', intent: 'live_tv_schedule', ambiguous: true, needsTitle: true },
    { tmpl: 'something like {t}', intent: 'similar_to', ambiguous: false, needsTitle: true },
    { tmpl: 'recommend me something', intent: 'recommendation', ambiguous: false, needsTitle: false },
    { tmpl: '{t}', intent: 'find_title', ambiguous: false, needsTitle: true },
  ],
  es: [
    { tmpl: 'dónde puedo ver {t}', intent: 'streaming_lookup', ambiguous: false, needsTitle: true },
    { tmpl: '{t} viene', intent: 'live_tv_schedule', ambiguous: true, needsTitle: true },
    { tmpl: 'algo como {t}', intent: 'similar_to', ambiguous: false, needsTitle: true },
    { tmpl: 'recomiéndame algo', intent: 'recommendation', ambiguous: false, needsTitle: false },
    { tmpl: '{t}', intent: 'find_title', ambiguous: false, needsTitle: true },
  ],
  zh: [
    { tmpl: '在哪里看{t}', intent: 'streaming_lookup', ambiguous: false, needsTitle: true },
    { tmpl: '{t}什么时候播', intent: 'live_tv_schedule', ambiguous: true, needsTitle: true },
    { tmpl: '类似{t}的', intent: 'similar_to', ambiguous: false, needsTitle: true },
    { tmpl: '{t}', intent: 'find_title', ambiguous: false, needsTitle: true },
  ],
};

export function generateClarifyCases(count: number, seed = 4242): ClarifyCase[] {
  const r = rng(seed);
  const locales = Object.keys(TEMPLATES);
  const out: ClarifyCase[] = [];
  let i = 0;
  while (out.length < count) {
    const loc = pick(r, locales);
    const tpl = pick(r, TEMPLATES[loc]!);
    const title = pick(r, TITLES);
    const name = (title.names as Record<string, string>)[loc] ?? title.names.en;
    const query = tpl.tmpl.replace('{t}', name);
    out.push({
      id: `${loc}-${i++}`, query, appLocale: loc,
      expectIntent: tpl.intent, expectTitleId: tpl.needsTitle ? title.id : null,
      ambiguous: tpl.ambiguous, scenario: tpl.intent,
    });
  }
  return out;
}

/** Curated adversarial cases from the spec (exact expectations). */
export const ADVERSARIAL: ClarifyCase[] = [
  { id: 'en-rocky-coming', query: 'rocky coming', appLocale: 'en', expectIntent: 'live_tv_schedule', expectTitleId: 'movie:1366', ambiguous: true, scenario: 'ambiguous_airing' },
  { id: 'en-where-sherlock', query: 'where sherlock at', appLocale: 'en', expectIntent: 'streaming_lookup', expectTitleId: 'tv:19885', ambiguous: false, scenario: 'streaming_slang' },
  { id: 'en-new-batman', query: 'new batman one', appLocale: 'en', expectIntent: 'upcoming_release', expectTitleId: 'movie:414906', ambiguous: true, scenario: 'upcoming' },
  { id: 'es-rocky-viene', query: 'rocky viene', appLocale: 'es', expectIntent: 'live_tv_schedule', expectTitleId: 'movie:1366', ambiguous: true, scenario: 'ambiguous_airing' },
  { id: 'es-donde-rocky', query: 'donde sale rocky', appLocale: 'es', expectIntent: 'streaming_lookup', expectTitleId: 'movie:1366', ambiguous: false, scenario: 'streaming' },
  { id: 'es-algo-knives', query: 'algo como knives out', appLocale: 'es', expectIntent: 'similar_to', expectTitleId: 'movie:546554', ambiguous: false, scenario: 'similar' },
  { id: 'fr-rocky-passe', query: 'rocky passe bientôt', appLocale: 'fr', expectIntent: 'live_tv_schedule', expectTitleId: 'movie:1366', ambiguous: true, scenario: 'ambiguous_airing' },
  { id: 'fr-ou-rocky', query: 'où voir rocky', appLocale: 'fr', expectIntent: 'streaming_lookup', expectTitleId: 'movie:1366', ambiguous: false, scenario: 'streaming' },
  { id: 'de-kommt-rocky', query: 'kommt rocky bald', appLocale: 'de', expectIntent: 'upcoming_release', expectTitleId: 'movie:1366', ambiguous: true, scenario: 'ambiguous_airing' },
  { id: 'de-wo-rocky', query: 'wo läuft rocky', appLocale: 'de', expectIntent: 'streaming_lookup', expectTitleId: 'movie:1366', ambiguous: false, scenario: 'streaming' },
  { id: 'pt-rocky-passar', query: 'rocky vai passar', appLocale: 'pt', expectIntent: 'live_tv_schedule', expectTitleId: 'movie:1366', ambiguous: true, scenario: 'ambiguous_airing' },
  { id: 'pt-onde-rocky', query: 'onde assistir rocky', appLocale: 'pt', expectIntent: 'streaming_lookup', expectTitleId: 'movie:1366', ambiguous: false, scenario: 'streaming' },
  { id: 'ja-rocky-doko', query: 'ロッキーどこで見れる', appLocale: 'ja', expectIntent: 'streaming_lookup', expectTitleId: 'movie:1366', ambiguous: false, scenario: 'streaming' },
  { id: 'ja-rocky-yaru', query: 'ロッキーやる', appLocale: 'ja', expectIntent: 'live_tv_schedule', expectTitleId: 'movie:1366', ambiguous: true, scenario: 'ambiguous_airing' },
  { id: 'ar-ayn-rocky', query: 'أين أشاهد روكي', appLocale: 'ar', expectIntent: 'streaming_lookup', expectTitleId: 'movie:1366', ambiguous: false, scenario: 'streaming' },
  { id: 'ar-rocky-soon', query: 'هل روكي سيعرض قريباً', appLocale: 'ar', expectIntent: 'live_tv_schedule', expectTitleId: 'movie:1366', ambiguous: true, scenario: 'ambiguous_airing' },
  // title language ≠ interface language
  { id: 'en-casa-de-papel', query: 'La Casa de Papel', appLocale: 'en', expectIntent: 'find_title', expectTitleId: 'tv:71446', ambiguous: false, scenario: 'foreign_title_en_ui' },
  { id: 'es-dark-knight', query: 'The Dark Knight', appLocale: 'es', expectIntent: 'find_title', expectTitleId: 'movie:155', ambiguous: false, scenario: 'english_title_es_ui' },
  // descriptions → recovery (could_not_identify), never a wrong confident answer
  { id: 'en-train', query: 'that train movie', appLocale: 'en', expectIntent: 'unknown', expectTitleId: null, ambiguous: true, scenario: 'description' },
  { id: 'en-detective', query: 'british detective', appLocale: 'en', expectIntent: 'unknown', expectTitleId: null, ambiguous: true, scenario: 'description' },
];
