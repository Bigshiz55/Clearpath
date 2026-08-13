import type { RatingSource, TitleMetadata, PrimaryCall, VerdictTier, WatchProviders, MediaType } from '@/lib/types';
import { episodeSummary } from '@/lib/tmdb/meta-helpers';
import { originSummary } from '@/lib/origin';
import { DnaScore } from '@/components/DnaScore';
import { formatRating } from '@/lib/ratings/format';
import { VerdictConfidence } from './VerdictConfidence';
import { officialProviderNames } from '@/lib/providers/brand';

// Niche community aggregators we don't surface — they read as "random stars".
// Metacritic is dropped too: it's usually sparse and adds a fourth number that
// clutters the row without changing the call.
const HIDDEN_SOURCES = new Set(['Trakt', 'Letterboxd', 'Roger Ebert', 'Metacritic', 'Metacritic Users']);

function callStyleFor(call: PrimaryCall): string {
  return call === 'WATCH IT'
    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100'
    : call === 'MAYBE'
      ? 'border-yellow-400/40 bg-yellow-500/15 text-yellow-100'
      : 'border-red-400/40 bg-red-500/15 text-red-100';
}

/**
 * Top-of-page summary: the headline call plus every score in one glanceable
 * strip — WatchVerd1ct score, personal match, and all *available* external
 * ratings (IMDb, Rotten Tomatoes, Metacritic, TMDB). Missing sources are simply
 * omitted; nothing is fabricated.
 */
export function AtAGlance({
  primaryCall,
  tier,
  oneLiner,
  mediaType,
  tmdbId,
  sources,
  providers,
}: {
  primaryCall: PrimaryCall;
  tier: VerdictTier;
  oneLiner: string;
  mediaType: MediaType;
  tmdbId: number;
  sources: RatingSource[];
  providers: WatchProviders | null;
}) {
  const available = sources.filter((s) => s.available && !HIDDEN_SOURCES.has(s.name));
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
        </div>
        {/* HOW SURE, BESIDE HOW GOOD. The call says what we think; this says
            how much evidence that rests on — and taps open the reasons in
            plain language. Built from the engine's OWN available sources plus
            how many titles this user has rated, so it can never claim more
            than we hold. */}
        <VerdictConfidence
          className="flex-none"
          mediaType={mediaType}
          tmdbId={tmdbId}
          ratingSourceCount={available.length}
          availabilityVerified={streamNames.length > 0}
        />
      </div>

      {/* THE VERDICT SENTENCE IS NOT A CAPTION, AND MUST NEVER BE CLIPPED.
          It used to sit in the middle column of the badge row under
          `line-clamp-2` — a column ~130px wide on a phone, between a 100px
          call badge and the confidence chip. Measured on the shipped harness:
          at 320px the sentence needed 64px of height and got 32, so half the
          product's actual recommendation was cut off, silently, with no
          affordance to read the rest. It now gets its own full-width row and
          no clamp: this is the one line the whole page exists to deliver. */}
      <p data-testid="verdict-one-liner" className="mt-2 text-sm leading-snug text-slate-300">
        {oneLiner}
      </p>

      <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {/* The DNA Score is the headline personal call (its own Stream It / Skip
            It lives inside it); the objective verdict is the badge above. No
            duplicate Stream/Skip box here — it only collided with the DNA call. */}
        <DnaScore mediaType={mediaType} tmdbId={tmdbId} />
        {available.map((s) => {
          // ONE FORMATTER FOR EVERY RATING. The old per-surface assembly put a
          // "/ 10" label under a raw that already said "/10" — "7.9/10 / 10".
          // `formatRating` splits value from scale exactly once, and names the
          // source honestly (a TMDB-derived number is "Audience score", never
          // Popcornmeter branding — the tooltip says where it really came from).
          const f = formatRating(s);
          return (
            <div key={s.name} title={f.detail} className="flex flex-shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              {iconFor(s.name).node}
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-extrabold tabular-nums text-white">
                  {f.value}
                  {f.scale && <span className="ml-0.5 text-[10px] font-bold text-slate-400">{f.scale}</span>}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-slate-500">{f.source}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-start gap-2 text-sm">
        {streamNames.length > 0 ? (
          <span className="text-slate-200">
            {/* The official spellings, from the one brand registry — a
                television emoji is not a brand mark. */}
            <span className="font-semibold text-white">Streaming:</span>{' '}
            {officialProviderNames(streamNames).join(' · ')}
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

/** Icon per known rating source. Labels come from `formatRating` — the one
 *  shared formatter — never from here, which is how "/ 10" ended up printed
 *  under a value that already said "/10". */
function iconFor(name: string): { node: React.ReactNode } {
  switch (name) {
    case 'IMDb':
      return {
        node: <span className="grid h-7 w-7 place-items-center rounded-md bg-[#f5c518] text-[9px] font-black tracking-tight text-black">IMDb</span>,
      };
    case 'Rotten Tomatoes':
      return { node: <span className="grid h-7 w-7 place-items-center rounded-md bg-[#fa320a] text-base">🍅</span> };
    case 'RT Audience':
    case 'TMDB Audience':
      return { node: <span className="grid h-7 w-7 place-items-center rounded-md bg-[#faa71a] text-base">🍿</span> };
    case 'Metacritic':
      return { node: <span className="grid h-7 w-7 place-items-center rounded-md bg-[#00ce7a] text-[11px] font-black text-emerald-950">M</span> };
    case 'Metacritic Users':
      return { node: <span className="grid h-7 w-7 place-items-center rounded-md border border-[#00ce7a]/60 text-[11px] font-black text-[#00ce7a]">M</span> };
    default:
      return { node: <span className="grid h-7 w-7 place-items-center rounded-md bg-white/10 text-xs">★</span> };
  }
}

export function RatingIcons({ sources }: { sources: RatingSource[] }) {
  const available = sources.filter((s) => s.available && !HIDDEN_SOURCES.has(s.name));
  if (available.length === 0) {
    return <p className="text-sm text-slate-400">No external ratings available yet for this title.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {available.map((s) => {
        const f = formatRating(s);
        return (
          <div key={s.name} title={f.detail} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            {iconFor(s.name).node}
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-extrabold tabular-nums text-white">
                {f.value}
                {f.scale && <span className="ml-0.5 text-[10px] font-bold text-slate-400">{f.scale}</span>}
              </span>
              <span className="text-[9px] uppercase tracking-wide text-slate-500">{f.source}</span>
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
  const available = sources.filter((s) => s.available && !HIDDEN_SOURCES.has(s.name));
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
        name="WatchVerd1ct"
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
