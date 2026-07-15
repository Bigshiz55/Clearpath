import type { RatingSource, TitleMetadata, PrimaryCall, VerdictTier } from '@/lib/types';
import { deciderSearchUrl, episodeSummary } from '@/lib/tmdb/meta-helpers';

function callStyleFor(call: PrimaryCall): string {
  return call === 'WATCH IT'
    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100'
    : call === 'MAYBE'
      ? 'border-yellow-400/40 bg-yellow-500/15 text-yellow-100'
      : 'border-red-400/40 bg-red-500/15 text-red-100';
}

function ScoreChip({ icon, tint, value, label }: { icon: string; tint: string; value: string; label: string }) {
  return (
    <div className="flex flex-shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <span className={`grid h-7 w-7 place-items-center rounded-md text-sm ${tint}`}>{icon}</span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-extrabold tabular-nums text-white">{value}</span>
        <span className="text-[9px] uppercase tracking-wide text-slate-500">{label}</span>
      </span>
    </div>
  );
}

/**
 * Top-of-page summary: the headline call plus every score in one glanceable
 * strip — WatchVerdict score, personal match, and all *available* external
 * ratings (IMDb, Rotten Tomatoes, Metacritic, TMDB). Missing sources are simply
 * omitted; nothing is fabricated.
 */
export function AtAGlance({
  primaryCall,
  tier,
  oneLiner,
  watchVerdictScore,
  matchScore,
  matchLabel,
  sources,
  deciderUrl,
}: {
  primaryCall: PrimaryCall;
  tier: VerdictTier;
  oneLiner: string;
  watchVerdictScore: number;
  matchScore: number;
  matchLabel: string;
  sources: RatingSource[];
  deciderUrl: string;
}) {
  const available = sources.filter((s) => s.available);
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-xl border px-4 py-2 text-lg font-black tracking-tight ${callStyleFor(primaryCall)}`}>
          {primaryCall}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white">{tier}</div>
          <p className="line-clamp-2 text-xs text-slate-300 sm:text-sm">{oneLiner}</p>
        </div>
      </div>

      <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
        <ScoreChip icon="🍿" tint="bg-brand-500/25" value={`${watchVerdictScore}`} label="WatchVerdict" />
        <ScoreChip icon="🎯" tint="bg-amber-500/25" value={`${matchScore}`} label={matchLabel} />
        {available.map((s) => {
          const { node, label } = iconFor(s.name);
          return (
            <div key={s.name} className="flex flex-shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              {node}
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-extrabold tabular-nums text-white">{s.raw}</span>
                <span className="text-[9px] uppercase tracking-wide text-slate-500">{label}</span>
              </span>
            </div>
          );
        })}
        <a
          href={deciderUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-shrink-0 items-center gap-2 rounded-xl border border-brand-400/30 bg-brand-500/10 px-3 py-2 text-brand-100"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-white/5 text-sm">📺</span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-bold">Decider ↗</span>
            <span className="text-[9px] uppercase tracking-wide text-slate-500">Stream/Skip</span>
          </span>
        </a>
      </div>
    </section>
  );
}

/** Icon + style per known rating source. */
function iconFor(name: string): { node: React.ReactNode; label: string } {
  switch (name) {
    case 'IMDb':
      return {
        label: '/ 10',
        node: <span className="grid h-7 w-7 place-items-center rounded-md bg-[#f5c518] text-[9px] font-black tracking-tight text-black">IMDb</span>,
      };
    case 'Rotten Tomatoes':
      return { label: 'Tomatometer', node: <span className="grid h-7 w-7 place-items-center rounded-md bg-[#fa320a] text-base">🍅</span> };
    case 'Metacritic':
      return { label: 'Metacritic', node: <span className="grid h-7 w-7 place-items-center rounded-md bg-[#00ce7a] text-[11px] font-black text-emerald-950">M</span> };
    case 'TMDB Audience':
      return { label: 'audience', node: <span className="grid h-7 w-7 place-items-center rounded-md bg-[#0d253f] text-[8px] font-black text-[#90cea1]">TMDB</span> };
    default:
      return { label: '', node: <span className="grid h-7 w-7 place-items-center rounded-md bg-white/10 text-xs">★</span> };
  }
}

export function RatingIcons({ sources }: { sources: RatingSource[] }) {
  const available = sources.filter((s) => s.available);
  if (available.length === 0) {
    return <p className="text-sm text-slate-400">No external ratings available yet for this title.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {available.map((s) => {
        const { node, label } = iconFor(s.name);
        return (
          <div key={s.name} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            {node}
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-extrabold tabular-nums text-white">{s.raw}</span>
              <span className="text-[9px] uppercase tracking-wide text-slate-500">{label}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

const ENGLISH_COPY: Record<TitleMetadata['englishAvailability'], { label: string; note: string; good: boolean }> = {
  native: { label: 'In English', note: 'Originally in English.', good: true },
  available: { label: 'English dub available', note: 'An English version exists (dub and/or subtitles). Availability can vary by streaming provider.', good: true },
  subtitles: { label: 'Subtitles', note: 'Not available in English audio — expect subtitles.', good: false },
  unknown: { label: 'Language info limited', note: 'We couldn’t confirm English audio for this title.', good: false },
};

export function LanguageEpisodes({ meta }: { meta: TitleMetadata }) {
  const eng = ENGLISH_COPY[meta.englishAvailability];
  const eps = episodeSummary(meta.mediaType, meta.episodesAired, meta.episodesTotal, meta.nextEpisodeDate);
  const origLang = meta.spokenLanguages[0] ?? (meta.originalLanguage ? meta.originalLanguage.toUpperCase() : null);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5">🗣️</span>
        <div>
          <div className="text-sm font-semibold text-white">
            <span className={eng.good ? 'text-emerald-300' : 'text-amber-300'}>{eng.label}</span>
            {origLang && meta.englishAvailability !== 'native' ? <span className="text-slate-400"> · original {origLang}</span> : null}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">{eng.note}</div>
        </div>
      </div>
      {eps && (
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5">📺</span>
          <div className="w-full">
            <div className="text-sm font-semibold text-white">{eps}</div>
            {meta.episodesAired != null && meta.episodesAired > 0 && (
              <div className="mt-1.5 flex gap-1" aria-hidden>
                {Array.from({ length: Math.min(meta.episodesAired, 24) }).map((_, i) => (
                  <span key={i} className="h-1.5 flex-1 rounded-full bg-emerald-500" />
                ))}
                {meta.nextEpisodeDate &&
                  Array.from({ length: 3 }).map((_, i) => (
                    <span key={`o${i}`} className="h-1.5 flex-1 rounded-full bg-white/12" />
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function RecommendationConsensus({
  meta,
  primaryCall,
  sources,
}: {
  meta: TitleMetadata;
  primaryCall: PrimaryCall;
  sources: RatingSource[];
}) {
  const rt = sources.find((s) => s.name === 'Rotten Tomatoes' && s.available);
  const tmdb = sources.find((s) => s.name === 'TMDB Audience' && s.available);
  const callStyle =
    primaryCall === 'WATCH IT'
      ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100'
      : primaryCall === 'MAYBE'
        ? 'border-yellow-400/40 bg-yellow-500/15 text-yellow-100'
        : 'border-red-400/40 bg-red-500/15 text-red-100';

  const Row = ({ icon, name, value, right }: { icon: string; name: string; value: string; right?: React.ReactNode }) => (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md bg-white/5 text-sm">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white">{name}</div>
        <div className="text-xs text-slate-300">{value}</div>
      </div>
      {right}
    </div>
  );

  return (
    <div className="space-y-2.5">
      <Row
        icon="🎬"
        name="WatchVerdict"
        value="Our personalized call"
        right={<span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${callStyle}`}>{primaryCall}</span>}
      />
      <Row
        icon="📺"
        name="Decider"
        value="Stream It or Skip It review"
        right={
          <a
            href={deciderSearchUrl(meta.title, meta.year)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-brand-400/40 bg-brand-500/15 px-2.5 py-1 text-xs font-semibold text-brand-100"
          >
            See Decider ↗
          </a>
        }
      />
      {rt && <Row icon="🍅" name="Critics" value={`Rotten Tomatoes · ${rt.raw}`} />}
      {tmdb && <Row icon="👥" name="Audience" value={`TMDB · ${tmdb.raw}`} />}
      <p className="text-[11px] text-slate-500">
        Decider has no public feed, so we link to their review rather than guess their verdict. Critic
        &amp; audience rows show only real, available data.
      </p>
    </div>
  );
}
