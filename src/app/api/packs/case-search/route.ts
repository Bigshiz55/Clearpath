import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchCases } from '@/lib/packs/cases';

export const dynamic = 'force-dynamic';

/** "Where have I seen this?" — plain search over Case/programme titles, descriptions, and location. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q') ?? '';
  if (q.trim().length < 2) return NextResponse.json({ results: [] });
  try {
    const supabase = createClient();
    const results = await searchCases(supabase, q);
    return NextResponse.json({
      results: results.map((c) => ({ slug: c.slug, title: c.title, description: c.description, statusSummary: c.statusSummary })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Search failed.' }, { status: 500 });
  }
}
