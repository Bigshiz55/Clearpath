import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getPopular, getTitle, getWatchProviders } from '@/lib/tmdb/client';
import { tmdbImage } from '@/lib/tmdb/image';
import { buildVerdict, avoidRule, loveRule, tierFromScore } from '@/lib/scoring';
import { getProfile, regionFor } from '@/lib/profile';
import type { PreferenceTrait } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TRAIT = z.enum([
  'supernatural',
  'paranormal',
  'science_fiction',
  'fantasy',
  'noir',
  'slow_burn',
  'grounded_crime',
  'psychological_thriller',
  'detective_mystery',
  'domestic_thriller',
  'serial_killer',
  'franchise_favorite',
]);

const bodySchema = z.object({
  members: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        avoid: z.array(TRAIT).max(12).default([]),
        love: z.array(TRAIT).max(12).default([]),
      }),
    )
    .min(1)
    .max(6),
  mediaType: z.enum(['any', 'movie', 'tv']).default('any'),
});

function groupVerdict(minScore: number, anyVeto: boolean): string {
  if (anyVeto) return 'Has a dealbreaker for someone';
  if (minScore >= 75) return 'Great for everyone';
  if (minScore >= 60) return 'Solid pick for the group';
  if (minScore >= 45) return 'Works if everyone’s flexible';
  return 'Tough crowd — best of a hard bunch';
}

export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Add at least one person first.' }, { status: 400 });
  }

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const profile = user ? await getProfile(supabase, user.id) : null;
    const region = regionFor(profile);

    // Candidate pool: popular movies + TV (broad, recognizable).
    const wantMovie = body.mediaType !== 'tv';
    const wantTv = body.mediaType !== 'movie';
    const [movies, shows] = await Promise.all([
      wantMovie ? getPopular('movie', region, 1) : Promise.resolve([]),
      wantTv ? getPopular('tv', region, 1) : Promise.resolve([]),
    ]);
    const pool = [...movies, ...shows].filter((d) => d.posterPath).slice(0, 20);
    if (pool.length === 0) {
      return NextResponse.json({ error: 'Couldn’t load candidates. Try again.' }, { status: 502 });
    }

    const contexts = body.members.map((m) => ({
      name: m.name,
      personal: {
        label: m.name,
        rules: [
          ...m.avoid.map((t) => avoidRule(t as PreferenceTrait)),
          ...m.love.map((t) => loveRule(t as PreferenceTrait)),
        ],
        likedFranchiseIds: [] as number[],
        collectionId: null,
      },
    }));

    const scored = await Promise.all(
      pool.map(async (c) => {
        try {
          const meta = await getTitle(c.mediaType, c.id, region);
          const perMember = contexts.map((mc) => {
            const report = buildVerdict({ meta, providers: null, personal: mc.personal });
            // Any negative adjustment here comes from that person's "avoid"
            // (hard-no) trait firing on a defining characteristic.
            const vetoed = report.personal.adjustments.some((a) => a.points < 0);
            return { name: mc.name, score: report.personal.score, vetoed };
          });
          const anyVeto = perMember.some((p) => p.vetoed);
          const scores = perMember.map((p) => p.score);
          const minScore = Math.min(...scores);
          const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
          return { c, meta, perMember, anyVeto, minScore, avgScore };
        } catch {
          return null;
        }
      }),
    );

    const valid = scored.filter((s): s is NonNullable<typeof s> => s !== null);
    // Non-vetoed first, then maximize the worst-off person, then the average.
    valid.sort(
      (a, b) =>
        Number(a.anyVeto) - Number(b.anyVeto) ||
        b.minScore - a.minScore ||
        b.avgScore - a.avgScore,
    );
    const top = valid.slice(0, 3);

    // Streaming for the shortlisted picks.
    const picks = await Promise.all(
      top.map(async (t) => {
        const providers = await getWatchProviders(t.c.mediaType, t.c.id, region).catch(() => null);
        const streaming = Array.from(
          new Set(
            (providers?.options ?? [])
              .filter((o) => o.type === 'flatrate' || o.type === 'free' || o.type === 'ads')
              .map((o) => o.providerName),
          ),
        );
        return {
          id: t.c.id,
          mediaType: t.c.mediaType,
          title: t.meta.title,
          year: t.meta.year,
          posterUrl: tmdbImage(t.meta.posterPath, 'w342'),
          minScore: t.minScore,
          avgScore: t.avgScore,
          anyVeto: t.anyVeto,
          tier: tierFromScore(t.minScore),
          verdict: groupVerdict(t.minScore, t.anyVeto),
          perMember: t.perMember,
          streaming,
        };
      }),
    );

    return NextResponse.json({ picks });
  } catch {
    return NextResponse.json({ error: 'Could not build a group pick right now.' }, { status: 500 });
  }
}
