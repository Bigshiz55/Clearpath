/**
 * Localization layer for the Clarification Engine. Complete keys with placeholders
 * (never concatenated fragments), a fallback chain (locale → base → English), and
 * missing-key logging — raw keys are NEVER shown to the user. Self-contained on
 * this branch (the app-wide i18n catalog is on a separate branch); structured so
 * these keys move into the shared catalog once it merges.
 */
import { baseLocale, DEFAULT_LOCALE } from './locale';
import type { MeaningKey } from './canonical';

export type ClarifyKey =
  | 'clarification.heading'
  | 'clarification.one_quick_question'
  | 'clarification.which_did_you_mean'
  | 'clarification.looking_for_something_else'
  | 'clarification.could_not_identify'
  | 'clarification.try_one_of_these'
  | 'clarification.dismiss'
  | `meaning.${MeaningKey}`;

type Dict = Record<string, string>;

/** Dictionaries. Placeholders use {title}. Fully translated for shipped locales. */
const DICTS: Record<string, Dict> = {
  en: {
    'clarification.heading': 'Help us narrow the case.',
    'clarification.one_quick_question': 'One quick question before the verdict.',
    'clarification.which_did_you_mean': 'Which did you mean?',
    'clarification.looking_for_something_else': 'Looking for something else?',
    'clarification.could_not_identify': 'I couldn’t confidently identify your request.',
    'clarification.try_one_of_these': 'Try one of these:',
    'clarification.dismiss': 'Dismiss',
    'meaning.where_to_stream_title': 'Where to stream {title}',
    'meaning.title_airing_soon': 'Is {title} on TV soon',
    'meaning.new_franchise_release': 'A new {title} release',
    'meaning.show_franchise': 'Show the {title} franchise',
    'meaning.find_the_title': 'Find {title}',
    'meaning.similar_to_title': 'Something like {title}',
    'meaning.browse_genre': 'Browse {title}',
    'meaning.mood_pick': 'Pick something to watch',
    'meaning.titles_with_person': 'Titles with {title}',
    'meaning.whats_on_service': 'What’s on {title}',
    'meaning.release_date_of_title': 'Release date of {title}',
    'meaning.watch_order_of_franchise': 'Watch order for {title}',
    'meaning.could_not_identify': 'Search for {title}',
  },
  es: {
    'clarification.heading': 'Ayúdanos a acotar el caso.',
    'clarification.one_quick_question': 'Una pregunta rápida antes del veredicto.',
    'clarification.which_did_you_mean': '¿A cuál te refieres?',
    'clarification.looking_for_something_else': '¿Buscas otra cosa?',
    'clarification.could_not_identify': 'No pude identificar tu solicitud con seguridad.',
    'clarification.try_one_of_these': 'Prueba una de estas:',
    'clarification.dismiss': 'Descartar',
    'meaning.where_to_stream_title': 'Dónde ver {title}',
    'meaning.title_airing_soon': '¿Dan {title} pronto en TV?',
    'meaning.new_franchise_release': 'Un nuevo estreno de {title}',
    'meaning.show_franchise': 'Ver la saga de {title}',
    'meaning.find_the_title': 'Buscar {title}',
    'meaning.similar_to_title': 'Algo como {title}',
    'meaning.browse_genre': 'Explorar {title}',
    'meaning.mood_pick': 'Elegir algo para ver',
    'meaning.titles_with_person': 'Títulos con {title}',
    'meaning.whats_on_service': 'Qué hay en {title}',
    'meaning.release_date_of_title': 'Fecha de estreno de {title}',
    'meaning.watch_order_of_franchise': 'Orden para ver {title}',
    'meaning.could_not_identify': 'Buscar {title}',
  },
  zh: {
    'clarification.heading': '帮我们缩小范围。',
    'clarification.one_quick_question': '判决前的一个快速问题。',
    'clarification.which_did_you_mean': '你指的是哪一个？',
    'clarification.looking_for_something_else': '在找别的吗？',
    'clarification.could_not_identify': '我无法确定你的请求。',
    'clarification.try_one_of_these': '试试这些：',
    'clarification.dismiss': '关闭',
    'meaning.where_to_stream_title': '在哪里观看《{title}》',
    'meaning.title_airing_soon': '《{title}》快在电视上播了吗',
    'meaning.new_franchise_release': '《{title}》的新作',
    'meaning.show_franchise': '查看《{title}》系列',
    'meaning.find_the_title': '查找《{title}》',
    'meaning.similar_to_title': '类似《{title}》的',
    'meaning.browse_genre': '浏览{title}',
    'meaning.mood_pick': '挑一部来看',
    'meaning.titles_with_person': '有 {title} 的影视',
    'meaning.whats_on_service': '{title} 上有什么',
    'meaning.release_date_of_title': '《{title}》的上映日期',
    'meaning.watch_order_of_franchise': '《{title}》的观看顺序',
    'meaning.could_not_identify': '搜索{title}',
  },
  // RTL preview locale — proves the architecture handles right-to-left + Arabic.
  ar: {
    'clarification.heading': 'ساعدنا في تضييق نطاق القضية.',
    'clarification.one_quick_question': 'سؤال سريع قبل الحكم.',
    'clarification.which_did_you_mean': 'أيّهما تقصد؟',
    'clarification.looking_for_something_else': 'تبحث عن شيء آخر؟',
    'clarification.could_not_identify': 'لم أتمكّن من تحديد طلبك بثقة.',
    'clarification.try_one_of_these': 'جرّب أحد هذه:',
    'clarification.dismiss': 'إغلاق',
    'meaning.where_to_stream_title': 'أين تشاهد {title}',
    'meaning.title_airing_soon': 'هل يُعرض {title} قريباً على التلفاز',
    'meaning.new_franchise_release': 'إصدار جديد من {title}',
    'meaning.show_franchise': 'اعرض سلسلة {title}',
    'meaning.find_the_title': 'ابحث عن {title}',
    'meaning.similar_to_title': 'شيء مثل {title}',
    'meaning.browse_genre': 'تصفّح {title}',
    'meaning.mood_pick': 'اختر ما تشاهده',
    'meaning.titles_with_person': 'أعمال مع {title}',
    'meaning.whats_on_service': 'ماذا يوجد على {title}',
    'meaning.release_date_of_title': 'تاريخ إصدار {title}',
    'meaning.watch_order_of_franchise': 'ترتيب مشاهدة {title}',
    'meaning.could_not_identify': 'ابحث عن {title}',
  },
};

/** Records of missing-key fallbacks, for analytics (untranslated-string rate). */
export interface MissRecord { key: string; requested: string; servedBy: string }
const misses: MissRecord[] = [];
export function missingKeyReport(): readonly MissRecord[] { return misses; }
export function clearMissingKeys(): void { misses.length = 0; }

/** Fallback chain for a locale: itself → base → English. */
function chainFor(locale: string): string[] {
  const base = baseLocale(locale);
  return Array.from(new Set([locale, base, DEFAULT_LOCALE]));
}

/**
 * Localize a key with placeholder interpolation. NEVER returns a raw key: an
 * unknown key falls through the chain and, if still missing, yields a readable
 * placeholder while logging the miss.
 */
export function localize(locale: string, key: ClarifyKey, vars: Record<string, string> = {}): string {
  const chain = chainFor(locale);
  for (const loc of chain) {
    const dict = DICTS[loc];
    const template = dict?.[key];
    if (template != null) {
      if (loc !== baseLocale(locale)) misses.push({ key, requested: locale, servedBy: loc });
      return interpolate(template, vars);
    }
  }
  misses.push({ key, requested: locale, servedBy: 'none' });
  // Human-readable last resort — never a raw key.
  return vars.title ? `${humanize(key)}: ${vars.title}` : humanize(key);
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
function humanize(key: string): string {
  return key.split('.').pop()!.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Does a shipped/known dictionary fully cover a key (no fallback needed)? */
export function hasKey(locale: string, key: ClarifyKey): boolean {
  return DICTS[baseLocale(locale)]?.[key] != null;
}
