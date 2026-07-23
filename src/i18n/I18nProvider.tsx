'use client';

import { createContext, useContext, useMemo } from 'react';
import { translate, plural, type Messages } from './translate';
import type { UiLocale } from './config';

interface I18nValue {
  locale: UiLocale;
  t: (key: string, params?: Record<string, string | number>) => string;
  plural: (key: string, count: number, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Provides the active locale + messages to client components. The server layout
 * resolves the locale and passes the active + English (fallback) catalogs down
 * once; client components read via `useT()`. English fallback means a
 * partially-translated catalog degrades gracefully instead of showing raw keys.
 */
export function I18nProvider({
  locale,
  messages,
  fallback,
  children,
}: {
  locale: UiLocale;
  messages: Messages;
  fallback: Messages;
  children: React.ReactNode;
}) {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: (key, params) => translate(messages, fallback, key, params),
      plural: (key, count, params) => plural(messages, fallback, key, count, params),
    }),
    [locale, messages, fallback],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Client hook. Safe no-op fallback (returns the key) if used outside a provider. */
export function useI18n(): I18nValue {
  return (
    useContext(I18nContext) ?? {
      locale: 'en-US',
      t: (key) => key,
      plural: (key) => key,
    }
  );
}

/** Convenience: just the translate function. */
export function useT() {
  return useI18n().t;
}
