import 'server-only';
import Link from 'next/link';
import { searchTitles, getSimilar } from '@/lib/tmdb/client';
import { getScoringData } from '@/lib/titleData';
import { buildVerdict } from '@/lib/scoring';
import { regionFor } from '@/lib/profile';
import { streamingNames } from '@/lib/services';
import { tmdbImage } from '@/lib/tmdb/image';
import { matchBand } from '@/lib/verdict/matchBand';
import type { ConfidenceLevel } from '@/lib/verdictExplain';

/**
 * PROVE THE OUTPUT, DON'T JUST DESCRIBE IT.
 *
 * The three-step cards above explain the PROCESS; a visitor still hasn't seen
 * what a real Verd1ct actually looks like. This runs the exact same scoring
 * pipeline `askJudgeTitle` uses (`getScoringData` → `buildVerdict`) against a
 * fixed, unambiguous title, live, at request time — the quality numbers and
 * ratings are real. What CANNOT be honest here is personal fit (there is no
 * taste profile for an anonymous visitor) and live provider availability
 * without a signed-in region — both are labeled as illustrative rather than
 * presented as real personalization or current availability.
 *
 * Fails open: no TMDB key, a network miss, or an empty search all render the
 * same honest fallback rather than a broken section or (worse) invented data.
 */

const EXAMPLE_QUERY = 'The Godfather';

const CONFIDENCE_TEXT: Record<ConfidenceLevel, string> = {
  high: 'Strong evidence — independent sources agree.',
  medium: 'Good evidence — real signal, not unanimous.',
  low: 'Limited evidence on this title.',
};

interface ExampleData {
  title: string;
  year: number | null;
  posterUrl: string | null;
  mediaType: 'movie' | 'tv';
  ruling: 'FOR' | 'AGAINST';
  rulingHeadline: string;
  quality: number;
  reasons: string[];
  caution: string | null;
  runtimeLabel: string | null;
  where: string | null;
  confidenceLevel: ConfidenceLevel;
  alternate: { title: string; year: number | null; posterUrl: string | null } | null;
}

function fmtRuntime(minutes: number | null): string | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function loadExample(): Promise<ExampleData | null> {
  try {
    const results = await searchTitles(EXAMPLE_QUERY);
    const top = results.find((r) => r.mediaType === 'movie' && r.title.toLowerCase().includes('godfather'));
    if (!top) return null;

    const region = regionFor(null);
    const { meta, providers } = await getScoringData(top.mediaType, top.id, region);
    const report = buildVerdict({
      meta,
      providers,
      // No real visitor taste data exists here — this only ever reads
      // report.general.score below, never report.personal, but hasSignal:
      // false keeps the context honest regardless.
      personal: { label: 'General Verdict', rules: [], likedFranchiseIds: [], collectionId: null, hasSignal: false },
    });

    const quality = Math.round(report.general.standardScore ?? report.general.score);
    const ruling: ExampleData['ruling'] = report.primaryCall === 'SKIP IT' ? 'AGAINST' : 'FOR';
    const rulingHeadline =
      report.primaryCall === 'WATCH IT' ? 'WATCH THIS TONIGHT' : report.primaryCall === 'MAYBE' ? 'WORTH A LOOK' : 'NOT RIGHT NOW';

    const where = providers?.available ? streamingNames(providers.options as never).slice(0, 2).join(', ') || null : null;

    let alternate: ExampleData['alternate'] = null;
    try {
      const similar = await getSimilar(top.mediaType, top.id);
      const first = similar[0];
      if (first) {
        alternate = { title: first.title, year: first.year, posterUrl: tmdbImage(first.posterPath, 'w185') };
      }
    } catch {
      /* the alternate is a bonus; the example still stands without it */
    }

    return {
      title: meta.title,
      year: meta.year,
      posterUrl: tmdbImage(meta.posterPath, 'w342'),
      mediaType: top.mediaType,
      ruling,
      rulingHeadline,
      quality,
      reasons: report.reasonsFor.slice(0, 3),
      caution: report.reasonsAgainst[0] ?? null,
      runtimeLabel: fmtRuntime(meta.runtimeMinutes ?? meta.episodeRuntimeMinutes ?? null),
      where,
      confidenceLevel: report.general.confidence,
      alternate,
    };
  } catch {
    return null;
  }
}

export async function ExampleVerdict() {
  const data = await loadExample();

  return (
    <section className="border-t border-white/10" data-testid="example-verdict">
      <div className="container-page py-8 sm:py-10">
        <h2 className="text-center text-sm font-black uppercase tracking-[0.16em] text-slate-500">Example Verd1ct</h2>

        {!data ? (
          <p className="mx-auto mt-4 max-w-md text-center text-sm text-slate-500" data-testid="example-verdict-fallback">
            Live example unavailable right now — enter the courtroom to see a real one.
          </p>
        ) : (
          <div className="mx-auto mt-5 max-w-lg" data-testid="example-verdict-card">
            <div className="wv-tile flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              {data.posterUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- external TMDB CDN, matches PosterCard's convention
                <img src={data.posterUrl} alt="" className="h-[120px] w-20 flex-none rounded-lg object-cover" />
              )}
              <div className="min-w-0">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-wide ${
                    data.ruling === 'FOR' ? 'bg-emerald-500/25 text-emerald-100' : 'bg-red-500/25 text-red-100'
                  }`}
                >
                  {data.ruling} — {data.rulingHeadline}
                </span>
                <h3 className="mt-1.5 truncate text-base font-bold text-white">
                  {data.title} {data.year ? <span className="font-normal text-slate-400">({data.year})</span> : null}
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Quality {data.quality} · Fit for you <span className="italic">illustrative — no taste profile yet</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-400">{matchBand(data.confidenceLevel)} · {CONFIDENCE_TEXT[data.confidenceLevel]}</p>
              </div>
            </div>

            {data.reasons.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-slate-200">
                {data.reasons.map((r) => (
                  <li key={r} className="flex gap-1.5">
                    <span aria-hidden className="text-brand-300">+</span>
                    {r}
                  </li>
                ))}
              </ul>
            )}
            {data.caution && (
              <p className="mt-1.5 flex gap-1.5 text-sm text-slate-400">
                <span aria-hidden>—</span>
                {data.caution}
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              {data.runtimeLabel && <span>{data.runtimeLabel}</span>}
              <span>{data.where ? `Available on ${data.where}` : 'Where to watch — sample presentation, not current availability'}</span>
            </div>

            {data.alternate && (
              <p className="mt-3 text-xs text-slate-500">
                The Alternate: {data.alternate.title} {data.alternate.year ? `(${data.alternate.year})` : ''}
              </p>
            )}

            <p className="mt-3 text-center text-xs text-slate-600">
              A live example, not personalized to you.{' '}
              <Link href="/app" className="text-brand-300 underline hover:text-brand-200">
                Enter WatchVerd1ct for your own Verd1ct →
              </Link>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
