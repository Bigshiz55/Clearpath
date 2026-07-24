/**
 * Locale registry, response-language resolution, and query-language detection.
 * PURE. The interface language and the title language are SEPARATE concepts: a
 * Spanish user searching "The Dark Knight" still gets Spanish clarification text.
 */

export type Dir = 'ltr' | 'rtl';
export interface LocaleInfo { code: string; dir: Dir; family: string; shipped: boolean }

/**
 * Supported locales. `shipped` = fully translated + production-supported on this
 * branch's target set (en/es/zh). The others are SCAFFOLDED: the architecture
 * (cues, detection, dir, fallback) supports them and they can be promoted by
 * completing their dictionary — proving the design is not English-bolted-on.
 */
export const LOCALES: Record<string, LocaleInfo> = {
  en: { code: 'en', dir: 'ltr', family: 'Germanic', shipped: true },
  es: { code: 'es', dir: 'ltr', family: 'Romance', shipped: true },
  zh: { code: 'zh', dir: 'ltr', family: 'Sinitic', shipped: true },
  fr: { code: 'fr', dir: 'ltr', family: 'Romance', shipped: false },
  de: { code: 'de', dir: 'ltr', family: 'Germanic', shipped: false },
  pt: { code: 'pt', dir: 'ltr', family: 'Romance', shipped: false },
  ja: { code: 'ja', dir: 'ltr', family: 'Japonic', shipped: false },
  ar: { code: 'ar', dir: 'rtl', family: 'Semitic', shipped: false },
};

export const DEFAULT_LOCALE = 'en';
export function localeInfo(code: string): LocaleInfo { return LOCALES[baseLocale(code)] ?? LOCALES[DEFAULT_LOCALE]!; }
export function isRtl(code: string): boolean { return localeInfo(code).dir === 'rtl'; }
/** "es-419" / "zh-Hans" → base "es"/"zh". */
export function baseLocale(code: string | null | undefined): string {
  if (!code) return DEFAULT_LOCALE;
  return code.toLowerCase().split(/[-_]/)[0]!;
}

export interface QueryLanguage { lang: string; confidence: number }

/** Detect the query language from SCRIPT + function/cue words, deliberately
 *  ignoring proper-noun title tokens so a foreign title doesn't flip the language. */
export function detectQueryLanguage(text: string): QueryLanguage {
  const t = text.trim();
  if (!t) return { lang: DEFAULT_LOCALE, confidence: 0 };
  // Script-based (strong signal).
  if (/[؀-ۿ]/.test(t)) return { lang: 'ar', confidence: 0.95 };
  if (/[぀-ヿ]/.test(t)) return { lang: 'ja', confidence: 0.9 };   // kana ⇒ Japanese
  if (/[가-힯]/.test(t)) return { lang: 'ko', confidence: 0.9 };
  if (/[一-鿿]/.test(t) && !/[぀-ヿ]/.test(t)) return { lang: 'zh', confidence: 0.85 };
  // Latin function-word cues (weaker; scored).
  const low = ' ' + t.toLowerCase() + ' ';
  const votes: Record<string, number> = {};
  const bump = (l: string, n = 1) => (votes[l] = (votes[l] ?? 0) + n);
  const HINTS: Record<string, RegExp[]> = {
    es: [/\bdónde\b|\bdonde\b/, /\bpuedo\b/, /\bver\b/, /\bpelícula\b|\bpeli\b/, /\bviene\b|\bsale\b/, /\balgo como\b/, /\bqué\b/],
    fr: [/\boù\b/, /\bregarder\b/, /\bfilm\b/, /\bpasse\b/, /\bvoir\b/, /\bun truc comme\b/, /\bbientôt\b/],
    de: [/\bwo\b/, /\bläuft\b|\blauft\b/, /\bkommt\b/, /\bstreamen\b/, /\bder film mit\b/, /\bso was wie\b/, /\bbald\b/],
    pt: [/\bonde\b/, /\bassistir\b/, /\bvai passar\b/, /\bfilme\b/, /\balgo tipo\b/],
    en: [/\bwhere\b/, /\bwatch\b/, /\bstream\b/, /\bcoming\b/, /\bsomething like\b/, /\bmovie\b|\bshow\b/, /\btonight\b/],
  };
  for (const [lang, rs] of Object.entries(HINTS)) for (const r of rs) if (r.test(low)) bump(lang);
  const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { lang: DEFAULT_LOCALE, confidence: 0.3 };
  const [lang, score] = ranked[0]!;
  const total = ranked.reduce((s, [, v]) => s + v, 0);
  return { lang, confidence: Math.min(0.9, 0.4 + 0.5 * (score / total)) };
}

export interface LocaleSelection { locale: string; source: 'app' | 'query' | 'conversation' | 'default'; dir: Dir; queryLanguage: QueryLanguage }

/**
 * Resolve the response language. Order: app language → query language →
 * conversation language → English. The interface never flips just because a title
 * is foreign (query-language detection ignores title tokens).
 */
export function resolveResponseLocale(opts: {
  appLocale?: string | null;
  conversationLocale?: string | null;
  queryText: string;
}): LocaleSelection {
  const ql = detectQueryLanguage(opts.queryText);
  let locale: string; let source: LocaleSelection['source'];
  if (opts.appLocale) { locale = baseLocale(opts.appLocale); source = 'app'; }
  else if (ql.confidence >= 0.6 && LOCALES[ql.lang]) { locale = ql.lang; source = 'query'; }
  else if (opts.conversationLocale) { locale = baseLocale(opts.conversationLocale); source = 'conversation'; }
  else { locale = DEFAULT_LOCALE; source = 'default'; }
  if (!LOCALES[locale]) locale = DEFAULT_LOCALE;
  return { locale, source, dir: localeInfo(locale).dir, queryLanguage: ql };
}
