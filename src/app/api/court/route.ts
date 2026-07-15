import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getPopular, getTitle, getWatchProviders } from '@/lib/tmdb/client';
import { tmdbImage } from '@/lib/tmdb/image';
import { buildVerdict, avoidRule, loveRule } from '@/lib/scoring';
import { getProfile, regionFor } from '@/lib/profile';
import type { PreferenceTrait, TitleMetadata } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TRAIT = z.enum([
  'supernatural', 'paranormal', 'science_fiction', 'fantasy', 'noir', 'slow_burn',
  'grounded_crime', 'psychological_thriller', 'detective_mystery', 'domestic_thriller', 'serial_killer', 'franchise_favorite',
]);
const MOOD = z.enum(['any', 'light', 'intense', 'funny', 'cinematic', 'short']);

const bodySchema = z.object({
  members: z.array(z.object({
    name: z.string().min(1).max(40),
    avoid: z.array(TRAIT).max(12).default([]),
    love: z.array(TRAIT).max(12).default([]),
    mood: MOOD.default('any'),
  })).min(1).max(8),
  mediaType: z.enum(['any', 'movie', 'tv']).default('any'),
  boostGenres: z.array(z.string().max(40)).max(20).default([]),
  excludeKeys: z.array(z.string().max(40)).max(400).default([]),
});

const g = (meta: TitleMetadata, names: string[]) => meta.genres.some((x) => names.includes(x.toLowerCase()));
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
  const genrePhrase = m.genres.slice(0, 2).join(' / ') || 'Drama';
  out.push(genrePhrase);
  if (m.mediaType === 'movie' && m.runtimeMinutes) out.push(`${m.runtimeMinutes} min`);
  else if (m.mediaType === 'tv') out.push(m.numberOfSeasons ? `${m.numberOfSeasons} season${m.numberOfSeasons === 1 ? '' : 's'}` : 'TV series');
  out.push(isIntense(m) ? 'Intense' : isComedy(m) ? 'Light & funny' : 'Grounded');
  if ((m.voteAverage ?? 0) >= 7.5) out.push('Acclaimed');
  else if ((m.voteAverage ?? 0) >= 6.8) out.push('Well-liked');
  if (m.mediaType === 'movie' && (m.voteAverage ?? 0) >= 7.2) out.push('Cinematic');
  if (m.englishAvailability === 'subtitles') out.push('Subtitles');
  return out;
}

export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Add who’s playing first.' }, { status: 400 });
  }

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const profile = user ? await getProfile(supabase, user.id) : null;
    const region = regionFor(profile);

    const wantMovie = body.mediaType !== 'tv';
    const wantTv = body.mediaType !== 'movie';
    const [movies, shows] = await Promise.all([
      wantMovie ? getPopular('movie', region, 1) : Promise.resolve([]),
      wantTv ? getPopular('tv', region, 1) : Promise.resolve([]),
    ]);
    const exclude = new Set(body.excludeKeys);
    const boost = new Set(body.boostGenres.map((x) => x.toLowerCase()));
    const pool = [...movies, ...shows].filter((d) => d.posterPath && !exclude.has(`${d.mediaType}-${d.id}`)).slice(0, 22);
    if (pool.length === 0) return NextResponse.json({ error: 'Couldn’t load candidates. Try again.' }, { status: 502 });

    const contexts = body.members.map((m) => ({
      name: m.name, mood: m.mood,
      personal: {
        label: m.name,
        rules: [...m.avoid.map((t) => avoidRule(t as PreferenceTrait)), ...m.love.map((t) => loveRule(t as PreferenceTrait))],
        likedFranchiseIds: [] as number[], collectionId: null,
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
      } catch { return null; }
    }));

    const valid = scored.filter((s): s is NonNullable<typeof s> => s !== null && !s.hardVeto);
    valid.sort((a, b) => b.minScore + b.groupBonus - (a.minScore + a.groupBonus) || b.avgScore - a.avgScore);
    const finalists = valid.slice(0, 3);
    if (finalists.length === 0) return NextResponse.json({ error: 'Everything hit a hard-no. Loosen the exclusions.' }, { status: 200 });

    const out = await Promise.all(finalists.map(async (t) => {
      const providers = await getWatchProviders(t.c.mediaType, t.c.id, region).catch(() => null);
      const streaming = Array.from(new Set((providers?.options ?? []).filter((o) => o.type === 'flatrate' || o.type === 'free' || o.type === 'ads').map((o) => o.providerName)));
      return {
        id: t.c.id, mediaType: t.c.mediaType, title: t.meta.title, year: t.meta.year,
        posterUrl: tmdbImage(t.meta.posterPath, 'w342'),
        attributes: attributes(t.meta),
        genres: t.meta.genres,
        perMember: t.perMember,
        minScore: t.minScore, avgScore: t.avgScore, streaming,
      };
    }));

    return NextResponse.json({ finalists: out });
  } catch {
    return NextResponse.json({ error: 'The court is in recess — try again.' }, { status: 500 });
  }
}
