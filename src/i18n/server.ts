import 'server-only';
import { cookies, headers } from 'next/headers';
import { negotiateLocale, translate, plural, type Messages } from './translate';
import { LOCALE_COOKIE, BASE_LANGUAGE, DEFAULT_VOICE_LOCALE, type UiLocale } from './config';
import { CATALOGS, ENGLISH_MESSAGES } from './catalogs';

export { ENGLISH_MESSAGES };

/** Resolve the active UI locale for this request (cookie → Accept-Language →
 *  default). Signed-in overrides (profiles.ui_locale) are layered in by the
 *  caller when available, since the cookie is written on that choice. */
export function resolveLocale(): UiLocale {
  const cookie = cookies().get(LOCALE_COOKIE)?.value ?? null;
  const al = headers().get('accept-language');
  return negotiateLocale(cookie, al);
}

export function getMessages(locale: UiLocale): Messages {
  return CATALOGS[locale] ?? ENGLISH_MESSAGES;
}

export interface ServerI18n {
  locale: UiLocale;
  /** contentLanguage / <html lang> base (e.g. 'es'). */
  language: string;
  /** default voice locale for SpeechRecognition (user can override). */
  voiceLocale: string;
  messages: Messages;
  t: (key: string, params?: Record<string, string | number>) => string;
  plural: (key: string, count: number, params?: Record<string, string | number>) => string;
}

/** One call to get everything a server component needs to localize. */
export function getServerI18n(): ServerI18n {
  const locale = resolveLocale();
  const messages = getMessages(locale);
  return {
    locale,
    language: BASE_LANGUAGE[locale],
    voiceLocale: DEFAULT_VOICE_LOCALE[locale],
    messages,
    t: (key, params) => translate(messages, ENGLISH_MESSAGES, key, params),
    plural: (key, count, params) => plural(messages, ENGLISH_MESSAGES, key, count, params),
  };
}
