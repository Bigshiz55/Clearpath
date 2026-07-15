import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { computeFinalists } from '@/lib/court';
import { getProfile, regionFor } from '@/lib/profile';

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
    const result = await computeFinalists(
      body.members.map((m) => ({ name: m.name, love: m.love, avoid: m.avoid, mood: m.mood })),
      body.mediaType,
      body.boostGenres,
      body.excludeKeys,
      region,
    );
    if (result.error) return NextResponse.json({ error: result.error }, { status: 200 });
    return NextResponse.json({ finalists: result.finalists });
  } catch {
    return NextResponse.json({ error: 'The court is in recess — try again.' }, { status: 500 });
  }
}
