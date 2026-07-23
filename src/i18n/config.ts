/**
 * i18n configuration — the single source of truth for supported locales and the
 * separation of concerns the architecture requires (language ≠ region ≠ voice).
 *
 * This phase ships three UI locales. Market region, timezone, and currency are
 * SEPARATE (see profile fields / region.ts) and are never derived from uiLocale.
 */

export const SUPPORTED_LOCALES = ['en-US', 'es-419', 'zh-Hans'] as const;
export type UiLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: UiLocale = 'en-US';

/** Human names (in-language) for a language picker. */
export const LOCALE_NAMES: Record<UiLocale, string> = {
  'en-US': 'English',
  'es-419': 'Español (Latinoamérica)',
  'zh-Hans': '简体中文',
};

/** BCP-47 base language for `<html lang>` and TMDB `language` (contentLanguage). */
export const BASE_LANGUAGE: Record<UiLocale, string> = {
  'en-US': 'en',
  'es-419': 'es',
  'zh-Hans': 'zh',
};

/**
 * Default SpeechRecognition locale for a UI locale. voiceLocale is a SEPARATE,
 * user-overridable preference; this is only the sensible default when the user
 * hasn't chosen one. (es-419 → es-US is the most broadly supported LatAm Spanish
 * voice model in en-US browsers; users can pick es-MX explicitly.)
 */
export const DEFAULT_VOICE_LOCALE: Record<UiLocale, string> = {
  'en-US': 'en-US',
  'es-419': 'es-US',
  'zh-Hans': 'zh-CN',
};

/** Voice locales we offer explicitly (per the brief). */
export const SUPPORTED_VOICE_LOCALES = ['en-US', 'es-US', 'es-MX', 'zh-CN'] as const;

/** The cookie that carries the resolved UI locale across SSR + client. */
export const LOCALE_COOKIE = 'wv_locale';

export function isUiLocale(v: unknown): v is UiLocale {
  return typeof v === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(v);
}

/** Base-language (`en`) view of an arbitrary BCP-47 tag, lowercased. */
export function baseLang(tag: string): string {
  return tag.toLowerCase().split('-')[0] ?? tag.toLowerCase();
}
