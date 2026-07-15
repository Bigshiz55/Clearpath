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
import { buildInterview, type Disposition } from '@/lib/interview';
import { getFinishProfile, assessTitleRisk } from '@/lib/finish';

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

async function getFinishProfileForCurrentUser() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return await getFinishProfile(supabase, user.id);
  } catch {
    return null;
  }
}

/** Has the user already done the post-watch interview? Errors (e.g. migration
 *  0009 not applied) resolve to "done" so we never show a broken prompt. */
async function getFeedbackDone(tmdbId: number, mediaType: MediaType): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return true;
    const { data, error } = await supabase
      .from('title_feedback')
      .select('id')
      .eq('user_id', user.id)
      .eq('tmdb_id', tmdbId)
      .eq('media_type', mediaType)
      .maybeSingle();
    if (error) return true;
    return Boolean(data);
  } catch {
    return true;
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
    const [{ report, briefing }, watchState, myServices, feedbackDone, finishProfile] = await Promise.all([
      buildReportForCurrentUser(parsed.mediaType, parsed.id),
      getWatchState(parsed.id, parsed.mediaType),
      getMyServicesForCurrentUser(),
      getFeedbackDone(parsed.id, parsed.mediaType),
      getFinishProfileForCurrentUser(),
    ]);

    const t = report.title;
    const finishCheck = finishProfile
      ? assessTitleRisk(
          {
            long: t.mediaType === 'movie' && (t.runtimeMinutes ?? 0) >= 140,
            longRunningTv: t.mediaType === 'tv' && (t.numberOfSeasons ?? 0) >= 4,
            subtitleOnly: t.englishAvailability === 'subtitles',
            runtimeMinutes: t.runtimeMinutes,
            seasons: t.numberOfSeasons ?? null,
          },
          finishProfile,
        )
      : null;

    const status = watchState?.status;
    const disposition: Disposition | null =
      status === 'watched' ? 'finished' : status === 'dropped' ? 'abandoned' : null;
    const interview =
      disposition && !feedbackDone
        ? {
            disposition,
            questions: buildInterview(
              {
                mediaType: report.title.mediaType,
                genres: report.title.genres,
                runtimeMinutes: report.title.runtimeMinutes,
                numberOfSeasons: report.title.numberOfSeasons ?? null,
              },
              disposition,
            ),
          }
        : null;

    return (
      <VerdictReportView
        report={report}
        watchState={watchState}
        myServices={myServices}
        briefing={briefing}
        interview={interview}
        finishCheck={finishCheck}
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
