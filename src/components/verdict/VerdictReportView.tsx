import type { VerdictReport, ContentSignal, WatchlistStatus } from '@/lib/types';
import Link from 'next/link';
import { ScoreRing } from '@/components/ScoreRing';
import { VerdictBadge, DispositionChip } from '@/components/VerdictBadge';
import { ProviderRow } from '@/components/ProviderRow';
import { Poster } from '@/components/PosterCard';
import { SaveButton } from '@/components/SaveButton';
import { tmdbImage } from '@/lib/tmdb/client';
import { VerdictActions } from './VerdictActions';
import { AtAGlance, RatingIcons, LanguageEpisodes, RecommendationConsensus } from './ReportExtras';
import { TonightBanner } from './TonightBanner';
import { TitleBriefing } from './TitleBriefing';
import { CriticsTable } from './CriticsTable';
import { TheaterMode } from '@/components/TheaterMode';
import { PostWatchInterview } from './PostWatchInterview';
import { FinishCheck } from './FinishCheck';
import { ContentDnaView } from './ContentDnaView';
import { buildPanel } from '@/lib/swarm';
import type { InterviewQuestion, Disposition } from '@/lib/interview';
import type { RiskAssessment } from '@/lib/finish';
import type { ContentDna } from '@/lib/contentDna';
import type { Briefing } from '@/lib/briefing';
import { originSummary } from '@/lib/origin';

const LEVEL_COLOR: Record<ContentSignal['level'], string> = {
  none: 'bg-white/10 text-slate-400',
  low: 'bg-emerald-500/15 text-emerald-200',
  moderate: 'bg-yellow-500/15 text-yellow-100',
  high: 'bg-red-500/15 text-red-200',
  unknown: 'bg-white/5 text-slate-500',
};

function confidenceLabel(c: 'high' | 'medium' | 'low'): string {
  return c === 'high' ? 'High confidence' : c === 'medium' ? 'Moderate confidence' : 'Low confidence — limited data';
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="tabular-nums text-slate-300">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-300" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export interface WatchState {
  itemId: string | null;
  status: WatchlistStatus | null;
  rating: number | null;
  notes: string | null;
}

export function VerdictReportView({
  report,
  watchState,
  myServices = [],
  briefing,
  interview,
  finishCheck,
  contentDna,
}: {
  report: VerdictReport;
  watchState?: WatchState;
  myServices?: number[];
  briefing?: Briefing;
  interview?: { disposition: Disposition; questions: InterviewQuestion[] } | null;
  finishCheck?: RiskAssessment | null;
  contentDna?: ContentDna | null;
}) {
  const t = report.title;
  const origin = originSummary(t);
  const panel = buildPanel(report);
  const backdrop = tmdbImage(t.backdropPath, 'w780');
  const poster = tmdbImage(t.posterPath, 'w342');
  const runtime =
    t.mediaType === 'movie'
      ? t.runtimeMinutes
        ? `${t.runtimeMinutes} min`
        : null
      : t.numberOfSeasons
        ? `${t.numberOfSeasons} season${t.numberOfSeasons === 1 ? '' : 's'}`
        : t.episodeRuntimeMinutes
          ? `~${t.episodeRuntimeMinutes} min/ep`
          : null;

  return (
    <article className="space-y-6">
      {/* At-a-glance summary — call + every score/rating in one strip, always first */}
      <AtAGlance
        primaryCall={report.primaryCall}
        tier={report.tier}
        oneLiner={report.oneLiner}
        watchVerdictScore={report.general.score}
        matchScore={report.personal.score}
        matchLabel={report.personal.label}
        sources={report.general.sources}
        providers={report.providers}
      />

      {/* Can I watch it tonight on a plan I have? */}
      <TonightBanner providers={report.providers} myServices={myServices} />

      {/* Header */}
      <header className="card relative overflow-hidden">
        {backdrop && (
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={backdrop} alt="" className="h-full w-full object-cover opacity-25" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-850 via-ink-850/80 to-ink-850/40" />
          </div>
        )}
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
          <div className="h-48 w-32 flex-shrink-0 overflow-hidden rounded-xl shadow-card sm:h-56 sm:w-40">
            <Poster posterUrl={poster} title={t.title} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip">{t.mediaType === 'movie' ? 'Movie' : 'TV Series'}</span>
              {t.contentRating && <span className="chip">{t.contentRating}</span>}
              {runtime && <span className="chip">{runtime}</span>}
              {t.status && t.mediaType === 'tv' && <span className="chip">{t.status}</span>}
              {origin?.chip && (
                <span
                  className={`chip ${origin.good ? 'border-emerald-400/40 text-emerald-100' : 'border-amber-400/40 text-amber-100'}`}
                  title={origin.note}
                >
                  {origin.chip}
                </span>
              )}
            </div>
            <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
              {t.title} {t.year ? <span className="font-normal text-slate-400">({t.year})</span> : null}
            </h1>
            {t.genres.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.genres.map((g) => (
                  <span key={g} className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-slate-300">
                    {g}
                  </span>
                ))}
              </div>
            )}
            {t.overview && <p className="mt-3 max-w-2xl text-sm text-slate-300">{t.overview}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {t.trailerUrl && (
                <a href={t.trailerUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex">
                  ▶ Watch trailer
                </a>
              )}
              {/* Save it right from the placard — same list as everywhere else. */}
              <SaveButton
                tmdbId={t.id}
                mediaType={t.mediaType}
                title={t.title}
                year={t.year}
                posterPath={t.posterPath}
                initialSaved={watchState?.itemId != null}
                initialItemId={watchState?.itemId ?? null}
                variant="inline"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Score summary */}
      <section className="card p-5 sm:p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-around">
          <ScoreRing score={report.general.score} label="WatchVerdict Score" sublabel={confidenceLabel(report.general.confidence)} accent="brand" size={128} />
          <div className="hidden h-24 w-px bg-white/10 sm:block" />
          <ScoreRing score={report.personal.score} label={report.personal.label} sublabel={`base ${report.personal.baseScore} → ${report.personal.score}`} accent="gold" size={128} />
        </div>
        <div className="mt-5 flex flex-col items-center gap-3 text-center">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <VerdictBadge tier={report.tier} size="lg" />
            <DispositionChip disposition={report.watchlistDisposition} />
          </div>
          <p className="max-w-xl text-slate-200">{report.oneLiner}</p>
        </div>
      </section>

      {/* Will you finish it? — honest, from your own history */}
      {finishCheck && <FinishCheck assessment={finishCheck} />}

      {/* Actions */}
      <VerdictActions
        tmdbId={t.id}
        mediaType={t.mediaType}
        title={t.title}
        year={t.year}
        posterPath={t.posterPath}
        personalLabel={report.personal.label}
        initialItemId={watchState?.itemId ?? null}
        initialStatus={watchState?.status ?? null}
        initialRating={watchState?.rating ?? null}
        initialNotes={watchState?.notes ?? null}
      />

      {/* Post-watch interview — appears once you've marked it watched/dropped */}
      {interview && interview.questions.length > 0 && (
        <PostWatchInterview
          tmdbId={t.id}
          mediaType={t.mediaType}
          disposition={interview.disposition}
          questions={interview.questions}
        />
      )}

      {/* Theater Mode — dim the lights, hush notifications, tell the group */}
      <TheaterMode
        tmdbId={t.id}
        mediaType={t.mediaType}
        title={t.title}
        year={t.year}
        posterPath={t.posterPath}
        runtimeMinutes={t.runtimeMinutes ?? t.episodeRuntimeMinutes}
      />

      {/* The Critics' Table — grounded multi-perspective panel */}
      <CriticsTable
        panel={panel}
        facts={{ title: t.title, year: t.year, watchVerdictScore: report.general.score, tier: report.tier }}
      />

      {/* Ratings (icons) + language & episodes */}
      <section className="card p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-white">Ratings</h2>
        <p className="mt-1 text-xs text-slate-500">
          Critic scores from IMDb / Rotten Tomatoes / Metacritic (when available); audience from TMDB.
        </p>
        <div className="mt-4">
          <RatingIcons sources={report.general.sources} />
        </div>
        <div className="mt-5 border-t border-white/10 pt-5">
          <LanguageEpisodes meta={t} />
        </div>
      </section>

      {/* Recommendation consensus */}
      <section className="card p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-white">Recommendation consensus</h2>
        <div className="mt-4">
          <RecommendationConsensus primaryCall={report.primaryCall} sources={report.general.sources} />
        </div>
      </section>

      {/* Score explanation */}
      <section className="card p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-white">How this score was built</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <Bar label="General quality" value={report.general.breakdown.quality} />
            <Bar label="Audience reception" value={report.general.breakdown.audience} />
            <Bar label="Watchability" value={report.general.breakdown.watchability} />
            <Bar label="Engagement" value={report.general.breakdown.engagement} />
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold text-white">Ratings used</div>
              <div className="mt-2 space-y-1 text-sm">
                {report.general.sources.map((s) => (
                  <div key={s.name} className="flex items-center justify-between">
                    <span className="text-slate-400">{s.name}</span>
                    <span className={s.available ? 'text-slate-200' : 'text-slate-500'}>
                      {s.available ? s.raw : 'Not available'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Audience & critic scores shown as reported. When critic aggregators are
                unavailable, quality is estimated from audience data (shrunk toward neutral when
                few votes exist) and labeled as such — never presented as an official critic score.
              </p>
            </div>
          </div>
        </div>

        {report.personal.adjustments.length > 0 && (
          <div className="mt-5">
            <div className="text-sm font-semibold text-white">
              {report.personal.label} adjustments
            </div>
            <ul className="mt-2 space-y-2">
              {report.personal.adjustments.map((a, i) => (
                <li key={i} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
                  <span
                    className={`mt-0.5 rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                      a.points < 0 ? 'bg-red-500/20 text-red-200' : 'bg-emerald-500/20 text-emerald-200'
                    }`}
                  >
                    {a.points > 0 ? `+${a.points}` : a.points}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      {a.label}
                      {a.defining && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-200">hard rule</span>}
                    </div>
                    <div className="text-xs text-slate-400">{a.reason}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Why it may / may not work */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <h3 className="flex items-center gap-2 text-base font-semibold text-emerald-200">Why it may work</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {report.reasonsFor.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-emerald-400">+</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <h3 className="flex items-center gap-2 text-base font-semibold text-red-200">Why it may not</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {report.reasonsAgainst.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-red-400">–</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Not a fit? Send it to the Judge for better-for-you alternatives. */}
      {report.primaryCall !== 'WATCH IT' && (
        <section>
          <Link
            href={`/app/ask?q=${encodeURIComponent(t.title)}`}
            className="card flex items-center justify-between gap-3 p-4 transition hover:border-white/25 hover:bg-white/[0.05]"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">Not feeling this one?</div>
              <div className="text-xs text-slate-400">Let the Judge put it on trial and show better-for-you picks in the same lane.</div>
            </div>
            <span className="btn-primary flex-none">Ask the Judge →</span>
          </Link>
        </section>
      )}

      {/* Content DNA — aggregated from real viewer check-ins */}
      {contentDna && <ContentDnaView dna={contentDna} />}

      {/* Content & tone */}
      <section className="card p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-white">Content &amp; tone</h2>
        <p className="mt-1 text-xs text-slate-500">
          Signals inferred from genre, keywords, and rating. Where we can’t responsibly determine a
          level, it’s marked unknown rather than guessed.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {report.contentSignals.map((s) => (
            <div key={s.label} className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="text-sm font-medium text-white">{s.label}</div>
              <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs capitalize ${LEVEL_COLOR[s.level]}`}>
                {s.note ?? s.level}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Where to watch */}
      <section className="card p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-white">Where to watch</h2>
        <p className="mt-1 text-xs text-slate-500">Legal options for your region. We link out — we never host or stream content.</p>
        <div className="mt-4">
          <ProviderRow providers={report.providers} myServices={myServices} />
        </div>
      </section>

      {/* The Dossier — real credits, themes, franchise */}
      {briefing && <TitleBriefing briefing={briefing} keywords={t.keywords} />}

      {/* More like this */}
      {report.similar.length > 0 && (
        <section className="card p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">More like this</h2>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {report.similar.map((s) => (
              <Link key={`${s.mediaType}-${s.id}`} href={`/app/title/${s.mediaType}/${s.id}`} className="group block">
                <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-white/10">
                  <Poster posterUrl={tmdbImage(s.posterPath, 'w185')} title={s.title} className="transition group-hover:scale-105" />
                  <div className="absolute right-1.5 top-1.5 z-10">
                    <SaveButton
                      tmdbId={s.id}
                      mediaType={s.mediaType}
                      title={s.title}
                      year={s.year}
                      posterPath={s.posterPath}
                    />
                  </div>
                </div>
                <div className="mt-1 line-clamp-1 text-xs text-slate-300">{s.title}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Final verdict */}
      <section className="card bg-cinema-radial p-6 text-center">
        <div className="text-xs uppercase tracking-wider text-slate-400">Final verdict</div>
        <div className="mt-2 flex flex-col items-center gap-2">
          <VerdictBadge tier={report.tier} size="lg" />
          <div className="text-sm text-slate-300">
            Watchlist call: <DispositionChip disposition={report.watchlistDisposition} />
          </div>
        </div>
      </section>
    </article>
  );
}
