/**
 * Language-independent entity resolution. Localized / original / alternate /
 * transliterated titles all resolve to ONE universal id. PURE. Offline it uses a
 * compact multilingual alias catalog (production merges TMDB alternate titles +
 * embeddings); the resolution CONTRACT is what matters and is identical online.
 */
import { normTitle, titleTokens, isTokenWindow } from '@/lib/search/titleMatch';
import type { EntityType } from './canonical';

export interface TitleRecord {
  id: string;            // universal id, e.g. "movie:1366"
  canonical: string;     // recognizable display title
  franchiseId: string | null;
  isFranchiseName: boolean; // the bare title also names a franchise (⇒ ambiguous)
  aliases: string[];     // localized/original/alt/translit/misspelling, any script
}

/** Compact multilingual catalog (adversarial-set coverage). Aliases span scripts. */
export const TITLE_CATALOG: TitleRecord[] = [
  { id: 'movie:1366', canonical: 'Rocky', franchiseId: 'col:1575', isFranchiseName: true, aliases: ['rocky', 'ロッキー', 'рокки', '洛奇', '洛基', 'روكي'] },
  { id: 'tv:71446', canonical: 'Money Heist', franchiseId: null, isFranchiseName: false, aliases: ['money heist', 'la casa de papel', 'haus des geldes', 'la casa di carta', 'ペーパーハウス', 'بيت الورق'] },
  { id: 'movie:546554', canonical: 'Knives Out', franchiseId: 'col:721683', isFranchiseName: false, aliases: ['knives out', 'entre navajas y secretos', 'a coup de couteaux', 'ナイブズアウト', 'puñales por la espalda'] },
  { id: 'tv:19885', canonical: 'Sherlock', franchiseId: null, isFranchiseName: false, aliases: ['sherlock', 'シャーロック', 'شيرلوك', 'шерлок', '神探夏洛克'] },
  { id: 'movie:414906', canonical: 'The Batman', franchiseId: 'col:263', isFranchiseName: true, aliases: ['batman', 'the batman', 'バットマン', 'باتمان', 'бэтمен', '蝙蝠侠'] },
  { id: 'movie:155', canonical: 'The Dark Knight', franchiseId: 'col:263', isFranchiseName: false, aliases: ['the dark knight', 'el caballero oscuro', 'the dark night', 'ダークナイト', '黑暗骑士'] },
  { id: 'movie:27205', canonical: 'Inception', franchiseId: null, isFranchiseName: false, aliases: ['inception', 'origen', 'a origem', 'インセプション', 'начало', '盗梦空间', 'إنسبشن'] },
  { id: 'movie:157336', canonical: 'Interstellar', franchiseId: null, isFranchiseName: false, aliases: ['interstellar', 'インターステラー', '星际穿越'] },
];

const GENRE_WORDS = ['comedy', 'horror', 'thriller', 'romance', 'drama', 'documentary', 'comedia', 'terror', 'suspenso', 'documental'];
const MOOD_WORDS = ['funny', 'scary', 'sad', 'dark', 'cozy', 'gory', 'murder mystery', 'gracioso', 'de miedo', 'triste'];
const SERVICE_WORDS = ['netflix', 'max', 'hulu', 'disney', 'prime', 'apple tv', 'peacock', 'paramount'];

export interface ResolvedEntities {
  title: TitleRecord | null;
  /** The exact alias text that matched (so cue scoring can exclude the title span). */
  matchedAlias: string | null;
  entityType: EntityType;
  entityName: string | null;
  franchiseId: string | null;
  genre: string | null;
  mood: string | null;
  service: string | null;
}

/** Match an alias against the query: token-window for Latin, substring for
 *  non-Latin scripts (CJK/Arabic/Cyrillic have no spaces / fold differently). */
function aliasMatches(alias: string, query: string): boolean {
  const isLatin = /^[\x00-\x7fÀ-ɏ\s'.:!?-]+$/.test(alias);
  if (isLatin) {
    const qa = titleTokens(query), aa = titleTokens(alias);
    if (aa.length === 0) return false;
    if (isTokenWindow(aa, qa)) return true;
    return normTitle(query) === normTitle(alias);
  }
  return query.includes(alias);
}

export function resolveEntities(query: string): ResolvedEntities {
  const low = query.toLowerCase();
  // Longest matching alias wins (prefer specific over franchise-name).
  let best: { rec: TitleRecord; alias: string; len: number } | null = null;
  for (const rec of TITLE_CATALOG) {
    for (const alias of rec.aliases) {
      if (aliasMatches(alias, query) && (!best || alias.length > best.len)) best = { rec, alias, len: alias.length };
    }
  }
  const genre = GENRE_WORDS.find((g) => low.includes(g)) ?? null;
  const mood = MOOD_WORDS.find((m) => low.includes(m)) ?? null;
  const service = SERVICE_WORDS.find((s) => low.includes(s)) ?? null;

  if (best) {
    return { title: best.rec, matchedAlias: best.alias, entityType: 'title', entityName: best.rec.canonical, franchiseId: best.rec.franchiseId, genre, mood, service };
  }
  if (genre) return { title: null, matchedAlias: null, entityType: 'genre', entityName: genre, franchiseId: null, genre, mood, service };
  if (mood) return { title: null, matchedAlias: null, entityType: 'mood', entityName: mood, franchiseId: null, genre, mood, service };
  if (service) return { title: null, matchedAlias: null, entityType: 'service', entityName: service, franchiseId: null, genre, mood, service };
  return { title: null, matchedAlias: null, entityType: 'none', entityName: null, franchiseId: null, genre, mood, service };
}
