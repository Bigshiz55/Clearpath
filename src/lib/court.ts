import 'server-only';
import { getPopular, getTitle, getWatchProviders } from '@/lib/tmdb/client';
import { tmdbImage } from '@/lib/tmdb/image';
import { buildVerdict, avoidRule, loveRule } from '@/lib/scoring';
import type { PreferenceTrait, TitleMetadata } from '@/lib/types';

export interface CourtMemberInput {
  name: string;
  love: string[];
  avoid: string[];
  mood: string;
}
export interface CourtFinalist {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterUrl: string | null;
  attributes: string[];
  genres: string[];
  perMember: { name: string; score: number; vetoed: boolean; mood: string }[];
  minScore: number;
  avgScore: number;
  streaming: string[];
}

const g = (m: TitleMetadata, names: string[]) => m.genres.some((x) => names.includes(x.toLowerCase()));
const isIntense = (m: TitleMetadata) => g(m, ['horror', 'thriller', 'crime', 'war']);
const isComedy = (m: TitleMetadata) => g(m, ['comedy']);

function moodNudge(mood: string, m: TitleMetadata): number {
  const runtime = m.mediaType === 'movie' ? m.runtimeMinutes ?? 0 : 0;
  switch (mood) {
    case 'short': return m.mediaType === 'tv' ? -8 : runtime > 135 ? -12 : runtime > 110 ? -5 : 0;
    case 'light': return isIntense(m) ? -12 : 0;
    case 'intense': return isIntense(m) ? 4 : -6;
    case 'funny': return isComedy(m) ? 5 : -8;
    case 'cinematic': return m.mediaType === 'tv' ? -10 : (m.voteAverage ?? 0) < 6.8 ? -4 : 3;
    default: return 0;
  }
}

function attributes(m: TitleMetadata): string[] {
  const out: string[] = [];
  out.push(m.genres.slice(0, 2).join(' / ') || 'Drama');
  if (m.mediaType === 'movie' && m.runtimeMinutes) out.push(`${m.runtimeMinutes} min`);
  else if (m.mediaType === 'tv') out.push(m.numberOfSeasons ? `${m.numberOfSeasons} season${m.numberOfSeasons === 1 ? '' : 's'}` : 'TV series');
  out.push(isIntense(m) ? 'Intense' : isComedy(m) ? 'Light & funny' : 'Grounded');
  if ((m.voteAverage ?? 0) >= 7.5) out.push('Acclaimed');
  else if ((m.voteAverage ?? 0) >= 6.8) out.push('Well-liked');
  if (m.mediaType === 'movie' && (m.voteAverage ?? 0) >= 7.2) out.push('Cinematic');
  if (m.englishAvailability === 'subtitles') out.push('Subtitles');
  return out;
}

export async function computeFinalists(
  members: CourtMemberInput[],
  mediaType: 'any' | 'movie' | 'tv',
  boostGenres: string[],
  excludeKeys: string[],
  region: string,
): Promise<{ finalists?: CourtFinalist[]; error?: string }> {
  const wantMovie = mediaType !== 'tv';
  const wantTv = mediaType !== 'movie';
  const [movies, shows] = await Promise.all([
    wantMovie ? getPopular('movie', region, 1) : Promise.resolve([]),
    wantTv ? getPopular('tv', region, 1) : Promise.resolve([]),
  ]);
  const exclude = new Set(excludeKeys);
  const boost = new Set(boostGenres.map((x) => x.toLowerCase()));
  const pool = [...movies, ...shows].filter((d) => d.posterPath && !exclude.has(`${d.mediaType}-${d.id}`)).slice(0, 22);
  if (pool.length === 0) return { error: 'Couldn’t load candidates. Try again.' };

  const contexts = members.map((m) => ({
    name: m.name,
    mood: m.mood,
    personal: {
      label: m.name,
      rules: [...m.avoid.map((t) => avoidRule(t as PreferenceTrait)), ...m.love.map((t) => loveRule(t as PreferenceTrait))],
      likedFranchiseIds: [] as number[],
      collectionId: null,
    },
  }));

  const scored = await Promise.all(pool.map(async (c) => {
    try {
      const meta = await getTitle(c.mediaType, c.id, region);
      const perMember = contexts.map((mc) => {
        const report = buildVerdict({ meta, providers: null, personal: mc.personal });
        const hardNo = report.personal.adjustments.some((a) => a.points < 0);
        const raw = Math.max(0, Math.min(100, report.personal.score + moodNudge(mc.mood, meta)));
        return { name: mc.name, score: raw, vetoed: hardNo, mood: mc.mood };
      });
      const hardVeto = perMember.some((p) => p.vetoed);
      const scores = perMember.map((p) => p.score);
      const minScore = Math.min(...scores);
      const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const groupBonus = boost.size > 0 && meta.genres.some((x) => boost.has(x.toLowerCase())) ? 6 : 0;
      return { c, meta, perMember, hardVeto, minScore, avgScore, groupBonus };
    } catch {
      return null;
    }
  }));

  const valid = scored.filter((s): s is NonNullable<typeof s> => s !== null && !s.hardVeto);
  valid.sort((a, b) => b.minScore + b.groupBonus - (a.minScore + a.groupBonus) || b.avgScore - a.avgScore);
  const finalists = valid.slice(0, 3);
  if (finalists.length === 0) return { error: 'Everything hit a hard-no. Loosen the exclusions.' };

  const out = await Promise.all(finalists.map(async (t) => {
    const providers = await getWatchProviders(t.c.mediaType, t.c.id, region).catch(() => null);
    const streaming = Array.from(new Set((providers?.options ?? []).filter((o) => o.type === 'flatrate' || o.type === 'free' || o.type === 'ads').map((o) => o.providerName)));
    return {
      id: t.c.id,
      mediaType: t.c.mediaType,
      title: t.meta.title,
      year: t.meta.year,
      posterUrl: tmdbImage(t.meta.posterPath, 'w342'),
      attributes: attributes(t.meta),
      genres: t.meta.genres,
      perMember: t.perMember,
      minScore: t.minScore,
      avgScore: t.avgScore,
      streaming,
    };
  }));

  return { finalists: out };
}
