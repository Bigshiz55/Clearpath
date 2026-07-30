import { notFound } from 'next/navigation';
import { computeGeneralScore } from '@/lib/scoring/general';
import { buildEvidence } from '@/lib/verdict/evidence';
import { SCENARIOS, scenarioById } from '@/lib/verdict/evidenceFixtures';
import { FactorBar, SourceConfidenceCard } from '@/components/verdict/ScoreEvidence';
import { Nav } from '@/components/Nav';

/**
 * VERDICT-EVIDENCE harness (MOBILE_HARNESS=1).
 *
 * Renders the REAL score-evidence section and the REAL app header from fixture
 * metadata pushed through the REAL scoring engine, so every data condition can
 * be verified at every breakpoint without TMDB or OMDb keys. Not in the sitemap,
 * not linked from the app, 404 unless the harness flag is set.
 */
export const dynamic = 'force-dynamic';

const GENERATED_AT = '2026-07-20T12:00:00.000Z';

export default function VerdictEvidenceHarness({
  searchParams,
}: {
  searchParams: { scenario?: string };
}) {
  if (process.env.MOBILE_HARNESS !== '1') notFound();

  const only = searchParams.scenario ? scenarioById(searchParams.scenario) : undefined;
  const shown = only ? [only] : SCENARIOS;

  return (
    <div className="min-h-dvh">
      <Nav personalLabel="Scott Match" pro avatarLabel="🍿" />
      <main className="container-page space-y-6 py-6" data-testid="evidence-harness">
        <header>
          <h1 className="text-xl font-bold text-white">Verdict evidence — data conditions</h1>
          <p className="mt-1 text-sm text-slate-400">
            Fixture metadata through the real scoring engine. Every panel below is the component
            that ships on the title page.
          </p>
        </header>

        {shown.map((s) => {
          const general = computeGeneralScore(s.meta, null);
          const evidence = buildEvidence({
            sources: general.sources,
            breakdown: general.breakdown,
            voteCount: s.meta.voteCount,
            hasAudienceRating: s.meta.voteAverage != null && s.meta.voteCount > 0,
            hasPopularity: s.meta.popularity != null && s.meta.popularity > 0,
            hasProviders: false,
            mediaType: s.meta.mediaType,
          });

          return (
            <section
              key={s.id}
              className="card p-5 sm:p-6"
              data-testid={`scenario-${s.id}`}
              data-strength={evidence.strength}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-lg font-semibold text-white">
                  {s.id}. {s.label}
                </h2>
                <span className="text-xs text-slate-500">{s.intent}</span>
              </div>
              <div className="mt-1 break-words text-sm text-slate-400" data-testid="scenario-title">
                {s.meta.title} · {s.meta.genres.join(' · ')}
              </div>
              <div className="mt-1 text-sm text-slate-400">
                Watchability score <span className="tabular-nums text-white">{general.score}</span>
              </div>

              <div className="mt-4 grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:gap-6">
                <div className="space-y-3.5" data-testid="score-factors">
                  {evidence.factors.map((f) => (
                    <FactorBar key={f.key} factor={f} />
                  ))}
                </div>
                <SourceConfidenceCard evidence={evidence} retrievedAt={GENERATED_AT} />
              </div>

              {/* The real page keeps Your Match adjustments in the same section,
                  under a divider. Mirrored here so the harness proves the
                  association, not just the two columns. */}
              <div className="mt-5 border-t border-white/10 pt-5" data-testid="match-adjustments">
                <div className="text-sm font-semibold text-white">Scott Match adjustments</div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Applied to the score above, after the evidence was blended.
                </p>
                <ul className="mt-2 space-y-2">
                  <li className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
                    <span className="mt-0.5 rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-bold tabular-nums text-emerald-200">
                      +6
                    </span>
                    <div>
                      <div className="text-sm font-medium text-white">Detective mystery</div>
                      <div className="text-xs text-slate-400">A defining trait you rate highly.</div>
                    </div>
                  </li>
                </ul>
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
