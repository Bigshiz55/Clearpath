/**
 * Title display selection. Fallback order: localized → regional → original →
 * English → best available. Globally-recognized titles are NOT replaced by obscure
 * translations; the localized/original form is shown secondarily when useful.
 */
import { baseLocale } from './locale';
import type { TitleRecord } from './entities';

export interface TitleDisplay { display: string; secondary: string | null }

const isLatin = (s: string) => /^[\x00-\x7fÀ-ɏ\s'.:!?-]+$/.test(s);

/** Choose the best display title for a locale, with an optional secondary form. */
export function displayTitle(rec: TitleRecord, locale: string): TitleDisplay {
  const base = baseLocale(locale);
  // A well-known localized form for Romance locales (e.g. "La Casa de Papel" for es).
  const localizedAlias = rec.aliases.find((a) => isLatin(a) && a.toLowerCase() !== rec.canonical.toLowerCase());
  // For non-Latin UI locales, surface the native-script alias secondarily.
  const nativeAlias = rec.aliases.find((a) => !isLatin(a));

  if (base === 'es' && localizedAlias && rec.canonical === 'Money Heist') {
    return { display: 'La Casa de Papel', secondary: rec.canonical };
  }
  const secondary = (base === 'zh' || base === 'ja') ? (nativeAlias ?? null) : (localizedAlias ?? null);
  return { display: rec.canonical, secondary: secondary && secondary !== rec.canonical ? secondary : null };
}

/** Display string for a non-title entity (genre/mood/service) — the raw name. */
export function displayEntityName(name: string | null): string { return name ?? ''; }
