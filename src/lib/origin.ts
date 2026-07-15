// Client-safe helpers that turn TMDB origin/language signals into a plain-English
// statement of where a title is from and whether you'll watch it in English,
// dubbed, or with subtitles. Pure — safe to import anywhere.
import type { TitleMetadata } from '@/lib/types';

/** Nationality adjectives for the common origin countries (fallback: country name). */
const DEMONYMS: Record<string, string> = {
  US: 'American', GB: 'British', CA: 'Canadian', AU: 'Australian', IE: 'Irish',
  NZ: 'New Zealand', KR: 'South Korean', JP: 'Japanese', CN: 'Chinese', HK: 'Hong Kong',
  TW: 'Taiwanese', IN: 'Indian', FR: 'French', DE: 'German', ES: 'Spanish', IT: 'Italian',
  MX: 'Mexican', BR: 'Brazilian', AR: 'Argentine', SE: 'Swedish', NO: 'Norwegian',
  DK: 'Danish', FI: 'Finnish', NL: 'Dutch', BE: 'Belgian', PL: 'Polish', RU: 'Russian',
  TR: 'Turkish', TH: 'Thai', ID: 'Indonesian', PH: 'Filipino', ZA: 'South African',
  IL: 'Israeli', PT: 'Portuguese', CO: 'Colombian', CL: 'Chilean', IS: 'Icelandic',
};

function regionNames(): Intl.DisplayNames | null {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; }
}
function languageNames(): Intl.DisplayNames | null {
  try { return new Intl.DisplayNames(['en'], { type: 'language' }); } catch { return null; }
}

/** 🇰🇷 flag emoji from a 2-letter ISO country code (regional indicator pair). */
export function flagFor(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '';
  const cc = code.toUpperCase();
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function countryName(code: string): string {
  return regionNames()?.of(code.toUpperCase()) ?? code.toUpperCase();
}
function languageName(code: string | null): string | null {
  if (!code) return null;
  const n = languageNames()?.of(code);
  return n ?? code.toUpperCase();
}

export interface OriginSummary {
  flag: string;
  /** "American", "South Korean", or "From <Country>" when we have no adjective. */
  demonym: string | null;
  countryName: string | null;
  languageName: string | null;
  english: 'native' | 'available' | 'subtitles' | 'unknown';
  /** Whether it's easily watchable in English (native or dub available). */
  good: boolean;
  /** Short chip, e.g. "🇺🇸 American · English" or "🇰🇷 Korean · subtitled". */
  chip: string;
  /** One-line headline, e.g. "American film" / "South Korean series". */
  headline: string;
  /** Full sentence about language & how you'll watch it. */
  note: string;
}

type OriginInput = Pick<
  TitleMetadata,
  'originCountries' | 'originalLanguage' | 'englishAvailability' | 'mediaType'
>;

export function originSummary(meta: OriginInput): OriginSummary | null {
  const code = (meta.originCountries ?? []).find((c) => /^[A-Za-z]{2}$/.test(c)) ?? null;
  const english = meta.englishAvailability;
  if (!code && english === 'unknown') return null;

  const flag = code ? flagFor(code) : '';
  const name = code ? countryName(code) : null;
  const demonym = code ? (DEMONYMS[code.toUpperCase()] ?? null) : null;
  const lang = languageName(meta.originalLanguage);
  const kind = meta.mediaType === 'tv' ? 'series' : 'film';
  const KindCap = meta.mediaType === 'tv' ? 'Series' : 'Film';

  const headline = code
    ? demonym
      ? `${demonym} ${kind}`
      : `${KindCap} from ${name}`
    : english === 'native'
      ? 'English-language title'
      : 'Origin unavailable';

  let note: string;
  let good: boolean;
  let langTag: string;
  switch (english) {
    case 'native':
      note = 'Originally in English — no dub or subtitles needed.';
      good = true;
      langTag = 'English';
      break;
    case 'available':
      note = lang
        ? `Originally in ${lang} — an English dub and/or subtitles exist (which you get can vary by streaming service).`
        : 'An English version exists (dub and/or subtitles) — availability varies by service.';
      good = true;
      langTag = lang ? `${lang} · English dub` : 'English dub';
      break;
    case 'subtitles':
      note = lang
        ? `In ${lang} with no English dub — expect to read subtitles.`
        : 'Foreign-language with no English dub — expect subtitles.';
      good = false;
      langTag = lang ? `${lang} · subtitled` : 'subtitled';
      break;
    default:
      note = 'We couldn’t confirm the original language or whether an English version exists.';
      good = false;
      langTag = 'language unconfirmed';
      break;
  }

  const chipCountry = demonym ?? name ?? '';
  const chip = [flag, [chipCountry, english === 'native' ? '' : langTag].filter(Boolean).join(' · ')]
    .filter(Boolean)
    .join(' ')
    .trim();

  return { flag, demonym, countryName: name, languageName: lang, english, good, chip, headline, note };
}
