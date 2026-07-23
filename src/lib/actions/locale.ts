'use server';

import { cookies } from 'next/headers';
import { LOCALE_COOKIE, isUiLocale } from '@/i18n/config';

/**
 * Persist the user's UI-locale choice in a cookie (SSR + client both read it via
 * the negotiator). Language is stored SEPARATELY from region/timezone/currency —
 * choosing a language never changes the user's market. When the additive
 * `profiles.ui_locale` column is approved + applied, we also persist there for a
 * signed-in user; until then the cookie is the source of truth (works for guests
 * too, and needs no schema change).
 */
export async function setLocale(locale: string): Promise<{ ok: boolean }> {
  if (!isUiLocale(locale)) return { ok: false };
  cookies().set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return { ok: true };
}
