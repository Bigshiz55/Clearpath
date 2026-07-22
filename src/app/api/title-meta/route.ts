import { NextResponse } from 'next/server';
import { getScoringData } from '@/lib/titleData';
import type { MediaType } from '@/lib/types';
import type { TitleMetaLite } from '@/lib/feedback/reasons';

export const dynamic = 'force-dynamic';

/** Minimal, cached title metadata for the adaptive Pass reason chips. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const id = Number(url.searchParams.get('id'));
  if ((type !== 'movie' && type !== 'tv') || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  try {
    const { meta } = await getScoringData(type as MediaType, id, 'US');
    const lite: TitleMetaLite = {
      mediaType: type as MediaType,
      genres: meta.genres,
      runtimeMinutes: meta.runtimeMinutes ?? null,
      episodeRuntimeMinutes: meta.episodeRuntimeMinutes ?? null,
      numberOfSeasons: meta.numberOfSeasons ?? null,
      year: meta.year ?? null,
      originalLanguage: meta.originalLanguage,
      englishNative: meta.englishAvailability === 'native',
      voteAverage: meta.voteAverage,
    };
    return NextResponse.json({ meta: lite });
  } catch {
    return NextResponse.json({ meta: null });
  }
}
