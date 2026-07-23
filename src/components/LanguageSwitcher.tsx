'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setLocale } from '@/lib/actions/locale';
import { SUPPORTED_LOCALES, LOCALE_NAMES, type UiLocale } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';

/**
 * The Language control (part of Language & Region). Sets the UI locale via a
 * cookie-backed server action, then refreshes so server components re-render in
 * the new language. Region/timezone/currency are chosen separately elsewhere —
 * language never changes the user's market.
 */
export function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: string) {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div>
      <label htmlFor="wv-language" className="label mb-1.5 block">
        {t('common.language')}
      </label>
      <select
        id="wv-language"
        className="input"
        value={locale}
        disabled={pending}
        onChange={(e) => choose(e.target.value)}
      >
        {SUPPORTED_LOCALES.map((l: UiLocale) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
      <p className="helper mt-1">{t('common.languageRegion')}</p>
    </div>
  );
}
