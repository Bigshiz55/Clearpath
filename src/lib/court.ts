import 'server-only';
import { getPopular, getTitle, getWatchProviders, getSimilar } from '@/lib/tmdb/client';
import { tmdbImage } from '@/lib/tmdb/image';
import { buildVerdict, avoidRule, loveRule } from '@/lib/scoring';
import type { MediaType, PreferenceTrait, TitleMetadata } from '@/lib/types';

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

// ---------------------------------------------------------------------------
// Live Court v2 — wishlist-driven ranked finalists
// ---------------------------------------------------------------------------

/** One title a person searched for and added to their wishlist. */
export interface CourtPick {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
}
export interface CourtWishMember {
  name: string;
  mood: string;
  picks: CourtPick[];
}
export interface RankedFinalist {
  rank: number; // 1-based, ranked by combined best-fit
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterUrl: string | null;
  attributes: string[];
  genres: string[];
  perMember: { name: string; score: number; picked: boolean }[];
  pickedBy: string[]; // names who explicitly added it to their wishlist
  fit: number; // combined group best-fit, 0..100
  minScore: number;
  avgScore: number;
  streaming: string[];
}

const keyOf = (mt: MediaType, id: number) => `${mt}-${id}`;
const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * How well one candidate fits one member. An explicit wishlist pick is a full
 * 100 — they asked for it. Otherwise we score honest signal only: genre overlap
 * with the genres that member DID pick, plus the title's own quality, nudged by
 * their stated mood. No invented affinity.
 */
function memberFit(
  memberPickGenres: Set<string>,
  memberPicked: boolean,
  mood: string,
  meta: TitleMetadata,
): number {
  if (memberPicked) return 100;
  const genres = meta.genres.map((x) => x.toLowerCase());
  const overlap = genres.length > 0 ? genres.filter((x) => memberPickGenres.has(x)).length / genres.length : 0;
  const quality = Math.max(0, Math.min(1, ((meta.voteAverage ?? 5) - 5) / 5)); // 5..10 → 0..1
  const base = 40 + overlap * 40 + quality * 20; // 40..100
  return clamp100(base + moodNudge(mood, meta));
}

/**
 * The judge's ruling for Live Court v2: from everyone's searched wishlists,
 * rank the 3 titles that best fit the WHOLE group (highest floor first, so
 * nobody's stuck with something they'd hate), broadened with "more like this"
 * so vetoes and "show 3 more" always have somewhere to go. `excludeKeys` drops
 * titles already shown/vetoed. Real TMDB data only.
 */
export async function computeFinalistsFromPicks(
  members: CourtWishMember[],
  mediaType: 'any' | 'movie' | 'tv',
  excludeKeys: string[],
  region: string,
): Promise<{ finalists?: RankedFinalist[]; error?: string }> {
  const allow = (mt: MediaType) => (mediaType === 'any' ? true : mt === mediaType);
  const exclude = new Set(excludeKeys);

  // Everyone's picks, deduped and filtered to the chosen media type.
  const pickMap = new Map<string, CourtPick>();
  for (const m of members) {
    for (const p of m.picks) {
      if (!allow(p.mediaType)) continue;
      pickMap.set(keyOf(p.mediaType, p.id), p);
    }
  }
  const picks = [...pickMap.values()];
  if (picks.length === 0) return { error: 'Nobody added anything to watch yet. Search and add a few titles first.' };

  // Broaden the candidate pool with "more like this" for depth (veto / show more).
  const pool = new Map<string, { id: number; mediaType: MediaType }>();
  for (const p of picks) pool.set(keyOf(p.mediaType, p.id), { id: p.id, mediaType: p.mediaType });
  const similarLists = await Promise.all(
    picks.slice(0, 8).map((p) => getSimilar(p.mediaType, p.id).catch(() => [])),
  );
  for (const list of similarLists) {
    for (const s of list) {
      if (!allow(s.mediaType)) continue;
      pool.set(keyOf(s.mediaType, s.id), { id: s.id, mediaType: s.mediaType });
    }
  }
  const candidates = [...pool.values()].filter((c) => !exclude.has(keyOf(c.mediaType, c.id))).slice(0, 30);
  if (candidates.length === 0) return { error: 'That’s every option we’ve got — nothing new to show.' };

  // Fetch metadata once for every candidate (picks are a subset, so this also
  // gives us each member's pick genres).
  const metaEntries = await Promise.all(
    candidates.map(async (c) => {
      try {
        return [keyOf(c.mediaType, c.id), await getTitle(c.mediaType, c.id, region)] as const;
      } catch {
        return null;
      }
    }),
  );
  const metaMap = new Map<string, TitleMetadata>();
  for (const e of metaEntries) if (e) metaMap.set(e[0], e[1]);

  // Each member's pick-genre fingerprint (from titles they actually picked).
  const memberCtx = members.map((m) => {
    const picked = new Set(m.picks.filter((p) => allow(p.mediaType)).map((p) => keyOf(p.mediaType, p.id)));
    const genres = new Set<string>();
    for (const k of picked) {
      const meta = metaMap.get(k);
      if (meta) for (const g of meta.genres) genres.add(g.toLowerCase());
    }
    return { name: m.name, mood: m.mood, picked, genres };
  });

  const scored = [...metaMap.entries()].map(([k, meta]) => {
    const perMember = memberCtx.map((mc) => ({
      name: mc.name,
      score: memberFit(mc.genres, mc.picked.has(k), mc.mood, meta),
      picked: mc.picked.has(k),
    }));
    const scores = perMember.map((p) => p.score);
    const minScore = Math.min(...scores);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const pickedBy = perMember.filter((p) => p.picked).map((p) => p.name);
    const fit = clamp100(0.55 * minScore + 0.45 * avgScore + pickedBy.length * 8);
    return { key: k, meta, perMember, minScore, avgScore, pickedBy, fit };
  });

  scored.sort((a, b) => b.fit - a.fit || b.avgScore - a.avgScore || b.minScore - a.minScore);
  const top = scored.slice(0, 3);
  if (top.length === 0) return { error: 'Couldn’t rank anything. Try again.' };

  const finalists = await Promise.all(
    top.map(async (t, i) => {
      const providers = await getWatchProviders(t.meta.mediaType, t.meta.id, region).catch(() => null);
      const streaming = Array.from(
        new Set(
          (providers?.options ?? [])
            .filter((o) => o.type === 'flatrate' || o.type === 'free' || o.type === 'ads')
            .map((o) => o.providerName),
        ),
      );
      return {
        rank: i + 1,
        id: t.meta.id,
        mediaType: t.meta.mediaType,
        title: t.meta.title,
        year: t.meta.year,
        posterUrl: tmdbImage(t.meta.posterPath, 'w342'),
        attributes: attributes(t.meta),
        genres: t.meta.genres,
        perMember: t.perMember,
        pickedBy: t.pickedBy,
        fit: t.fit,
        minScore: t.minScore,
        avgScore: t.avgScore,
        streaming,
      } satisfies RankedFinalist;
    }),
  );

  return { finalists };
}

