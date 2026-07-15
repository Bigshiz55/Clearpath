import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { MediaType, WatchlistStatus } from '@/lib/types';
import { buildReportForCurrentUser } from '@/lib/report';
import { VerdictReportView, type WatchState } from '@/components/verdict/VerdictReportView';
import { createClient } from '@/lib/supabase/server';
import { TmdbError } from '@/lib/tmdb/client';
import { ConfigError } from '@/lib/env';
import { getMyServices } from '@/lib/profile';
import { getBriefing, type Briefing } from '@/lib/briefing';

export const dynamic = 'force-dynamic';

function parseParams(params: { type: string; id: string }): { mediaType: MediaType; id: number } | null {
  if (params.type !== 'movie' && params.type !== 'tv') return null;
  const id = Number.parseInt(params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return { mediaType: params.type, id };
}

export async function generateMetadata({ params }: { params: { type: string; id: string } }): Promise<Metadata> {
  const parsed = parseParams(params);
  if (!parsed) return { title: 'Not found' };
  return { title: 'Verdict' };
}

async function getWatchState(tmdbId: number, mediaType: MediaType): Promise<WatchState | undefined> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return undefined;
    const { data } = await supabase
      .from('watchlist_items')
      .select('id, status, rating, notes')
      .eq('user_id', user.id)
      .eq('tmdb_id', tmdbId)
      .eq('media_type', mediaType)
      .maybeSingle();
    if (!data) return { itemId: null, status: null, rating: null, notes: null };
    return {
      itemId: data.id as string,
      status: data.status as WatchlistStatus,
      rating: (data.rating as number | null) ?? null,
      notes: (data.notes as string | null) ?? null,
    };
  } catch {
    return undefined;
  }
}

async function getMyServicesForCurrentUser(): Promise<number[]> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    return await getMyServices(supabase, user.id);
  } catch {
    return [];
  }
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <h1 className="text-xl font-semibold text-white">{title}</h1>
      <p className="mt-2 text-sm text-slate-400">{message}</p>
      <Link href="/app" className="btn-secondary mt-6 inline-flex">
        ← Back to search
      </Link>
    </div>
  );
}

export default async function TitlePage({ params }: { params: { type: string; id: string } }) {
  const parsed = parseParams(params);
  if (!parsed) notFound();

  try {
    const [{ report }, watchState, myServices, briefing] = await Promise.all([
      buildReportForCurrentUser(parsed.mediaType, parsed.id),
      getWatchState(parsed.id, parsed.mediaType),
      getMyServicesForCurrentUser(),
      getBriefing(parsed.mediaType, parsed.id).catch((): Briefing | undefined => undefined),
    ]);
    return (
      <VerdictReportView
        report={report}
        watchState={watchState}
        myServices={myServices}
        briefing={briefing}
      />
    );
  } catch (e) {
    if (e instanceof ConfigError) {
      return <ErrorCard title="Not configured yet" message={e.userMessage} />;
    }
    if (e instanceof TmdbError) {
      if (e.status === 404) notFound();
      return <ErrorCard title="Couldn’t load this title" message={e.userMessage} />;
    }
    return (
      <ErrorCard
        title="Something went wrong"
        message="We couldn’t generate this verdict right now. Please try again in a moment."
      />
    );
  }
}
