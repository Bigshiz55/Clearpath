import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { readViewingMind, type MentalistSeed } from '@/lib/mentalist';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({
  seeds: z
    .array(z.object({ id: z.number().int().positive(), mediaType: z.enum(['movie', 'tv']) }))
    .min(2)
    .max(7),
});

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Pick 2–7 titles you love.' }, { status: 400 });
    }

    const result = await readViewingMind(supabase, user.id, parsed.data.seeds as MentalistSeed[]);
    if (!result) return NextResponse.json({ error: 'Couldn’t read those — try a few well-known titles.' }, { status: 422 });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'The mind-reader hit a snag.' }, { status: 500 });
  }
}
