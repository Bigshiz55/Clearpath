/**
 * Pure, dependency-free message lookup + locale negotiation. Kept separate from
 * any Next.js server API so it is fully unit-testable and reusable on client and
 * server.
 *
 * Message format: nested JSON namespaces; keys are dot-paths. Interpolation uses
 * `{name}` placeholders. This intentionally does NOT implement full ICU
 * plural/select — messages that need pluralization should carry explicit `_one`/
 * `_other` sibling keys and callers use `plural()`. (If richer ICU is needed
 * later, swap this resolver for next-intl without changing call sites' keys.)
 */
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, baseLang, type UiLocale } from './config';

export type Messages = Record<string, unknown>;

/** Look up a dot-path in a nested messages object. Returns undefined if missing. */
function lookup(messages: Messages, key: string): unknown {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** Interpolate `{name}` placeholders from params. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m,
  );
}

/**
 * Translate `key` against a resolved messages object, falling back to the English
 * messages when a key is missing (so a partially-translated catalog degrades
 * gracefully rather than showing a raw key). Final fallback is the key itself.
 */
export function translate(
  messages: Messages,
  fallback: Messages,
  key: string,
  params?: Record<string, string | number>,
): string {
  const hit = lookup(messages, key);
  if (typeof hit === 'string') return interpolate(hit, params);
  const fb = lookup(fallback, key);
  if (typeof fb === 'string') return interpolate(fb, params);
  return key;
}

/**
 * Choose a plural form. English/Spanish use one/other; Chinese has a single form
 * (always "other"). Callers provide `key` with `.one`/`.other` siblings.
 */
export function plural(
  messages: Messages,
  fallback: Messages,
  key: string,
  count: number,
  params?: Record<string, string | number>,
): string {
  const form = count === 1 ? 'one' : 'other';
  return translate(messages, fallback, `${key}.${form}`, { count, ...params });
}

/**
 * Negotiate a supported UI locale from an explicit cookie value and/or an
 * Accept-Language header. Order: valid cookie → best Accept-Language match
 * (exact, then by base language) → default. Pure — no I/O.
 */
export function negotiateLocale(cookieValue: string | null | undefined, acceptLanguage: string | null | undefined): UiLocale {
  if (cookieValue && (SUPPORTED_LOCALES as readonly string[]).includes(cookieValue)) {
    return cookieValue as UiLocale;
  }
  if (acceptLanguage) {
    const wanted = acceptLanguage
      .split(',')
      .map((part) => {
        const [tag, q] = part.trim().split(';q=');
        return { tag: (tag ?? '').trim(), q: q ? Number(q) : 1 };
      })
      .filter((x) => x.tag)
      .sort((a, b) => b.q - a.q);
    // exact match first
    for (const { tag } of wanted) {
      if ((SUPPORTED_LOCALES as readonly string[]).includes(tag)) return tag as UiLocale;
    }
    // base-language match (e.g. "es" or "es-MX" → es-419; "zh"/"zh-CN" → zh-Hans)
    for (const { tag } of wanted) {
      const base = baseLang(tag);
      const found = SUPPORTED_LOCALES.find((l) => baseLang(l) === base);
      if (found) return found;
    }
  }
  return DEFAULT_LOCALE;
}
