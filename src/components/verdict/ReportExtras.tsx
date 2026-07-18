import type { RatingSource, TitleMetadata, PrimaryCall, VerdictTier, WatchProviders } from '@/lib/types';
import { episodeSummary } from '@/lib/tmdb/meta-helpers';
import { originSummary } from '@/lib/origin';
import { LogoMark } from '@/components/Logo';

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
  providers,
}: {
  primaryCall: PrimaryCall;
  tier: VerdictTier;
  oneLiner: string;
  watchVerdictScore: number;
  matchScore: number;
  matchLabel: string;
  sources: RatingSource[];
  providers: WatchProviders | null;
}) {
  const available = sources.filter((s) => s.available);
  const streamNames = Array.from(
    new Set(
      (providers?.options ?? [])
        .filter((o) => o.type === 'flatrate' || o.type === 'free' || o.type === 'ads')
        .map((o) => o.providerName),
    ),
  );
  const rentBuy = (providers?.options ?? []).some((o) => o.type === 'rent' || o.type === 'buy');
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
        <div className={`flex flex-shrink-0 items-center gap-2 rounded-xl border px-3 py-2 ${callStyleFor(primaryCall)}`}>
          <span aria-hidden>📺</span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-extrabold">
              {primaryCall === 'WATCH IT' ? 'STREAM IT' : primaryCall}
            </span>
            <span className="text-[9px] uppercase tracking-wide opacity-70">Stream / Skip</span>
          </span>
        </div>
        {/* The WatchVerdict score — carried inside the site's own mark, prominent. */}
        <div className="flex flex-shrink-0 items-center gap-2 rounded-xl border border-brand-400/40 bg-brand-500/10 px-3 py-1.5">
          <LogoMark
            box="h-12 w-12 rounded-xl"
            inner="h-9 w-9"
            overlay={<span className="text-lg font-black tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">{watchVerdictScore}</span>}
          />
          <span className="flex flex-col leading-tight">
            <span className="text-[10px] font-black uppercase tracking-wide text-brand-100">WatchVerdict</span>
            <span className="text-[9px] uppercase tracking-wide text-slate-400">Score / 100</span>
          </span>
        </div>
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
      </div>

      <div className="mt-3 flex items-start gap-2 text-sm">
        <span aria-hidden>📺</span>
        {streamNames.length > 0 ? (
          <span className="text-slate-200">
            <span className="font-semibold text-white">Streaming:</span> {streamNames.join(', ')}
          </span>
        ) : (
          <span className="text-slate-400">
            No subscription stream found in your region{rentBuy ? ' — rent or buy available below' : ' yet'}.
          </span>
        )}
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

export function LanguageEpisodes({ meta }: { meta: TitleMetadata }) {
  const origin = originSummary(meta);
  const eps = episodeSummary(meta.mediaType, meta.episodesAired, meta.episodesTotal, meta.nextEpisodeDate);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-base">
          {origin?.flag || '🗣️'}
        </span>
        <div>
          <div className="text-sm font-semibold text-white">
            {origin ? (
              <>
                <span>{origin.headline}</span>
                <span className={origin.good ? 'text-emerald-300' : 'text-amber-300'}>
                  {' · '}
                  {origin.english === 'native'
                    ? 'in English'
                    : origin.english === 'available'
                      ? 'English dub available'
                      : origin.english === 'subtitles'
                        ? 'subtitled'
                        : 'language unconfirmed'}
                </span>
              </>
            ) : (
              <span className="text-slate-300">Origin &amp; language not available</span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {origin?.note ?? 'We couldn’t confirm where this title is from or its original language.'}
          </div>
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

const SOURCE_META: Record<string, { icon: string; kind: string }> = {
  IMDb: { icon: '⭐', kind: 'IMDb' },
  'Rotten Tomatoes': { icon: '🍅', kind: 'Critics · Rotten Tomatoes' },
  'RT Audience': { icon: '🍿', kind: 'Audience · Rotten Tomatoes' },
  Metacritic: { icon: 'Ⓜ️', kind: 'Critics · Metacritic' },
  'Metacritic Users': { icon: '🄼', kind: 'Audience · Metacritic' },
  'TMDB Audience': { icon: '👥', kind: 'Audience · TMDB' },
  Trakt: { icon: '📺', kind: 'Community · Trakt' },
  Letterboxd: { icon: '📓', kind: 'Community · Letterboxd' },
  'Roger Ebert': { icon: '🎞️', kind: 'Critic · RogerEbert.com' },
};

export function RecommendationConsensus({
  primaryCall,
  sources,
}: {
  primaryCall: PrimaryCall;
  sources: RatingSource[];
}) {
  const available = sources.filter((s) => s.available);
  const callStyle = callStyleFor(primaryCall);

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
      {available.map((s) => {
        const m = SOURCE_META[s.name] ?? { icon: '★', kind: s.name };
        return (
          <Row
            key={s.name}
            icon={m.icon}
            name={s.name}
            value={m.kind}
            right={<span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-sm font-bold tabular-nums text-white">{s.raw}</span>}
          />
        );
      })}
      <p className="text-[11px] text-slate-500">Every row shows only real, available data — nothing is guessed.</p>
    </div>
  );
}
