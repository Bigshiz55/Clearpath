import type { DnaConfidenceResult } from '@/lib/preference/dnaConfidence';

/**
 * "What WatchVerd1ct learned" — the DNA Confidence number WITH its evidence, so
 * there are no unexplained numbers. Shows the overall confidence, its tier, and
 * a per-signal breakdown (each source, how many, and how many points it added).
 */
export function DnaConfidencePanel({ result }: { result: DnaConfidenceResult }) {
  const tierLabel = { new: 'New', forming: 'Forming', sharp: 'Sharp', elite: 'Elite' }[result.tier];
  const evidence = result.contributions.filter((c) => c.count > 0);

  return (
    <section className="card p-5 sm:p-6" data-testid="dna-confidence-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Watch DNA Confidence</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            How well we understand your taste — grown from real signals, never from a quiz question just appearing.
          </p>
        </div>
        <div className="flex-none text-center">
          <div className="text-3xl font-black tabular-nums text-emerald-300" data-testid="dna-confidence-value">{result.percent}%</div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-300/80">{tierLabel}</div>
        </div>
      </div>
      <div className="wv-dna-bar mt-3"><span style={{ width: `${result.percent}%` }} /></div>

      {evidence.length > 0 ? (
        <div className="mt-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Evidence behind the score</div>
          <ul className="mt-2 space-y-1.5" data-testid="dna-evidence">
            {evidence.map((c) => (
              <li key={c.key} className="flex items-center gap-3">
                <span className="w-40 flex-none truncate text-xs text-slate-200">{c.label}</span>
                <span className="w-10 flex-none text-right text-xs tabular-nums text-slate-400">×{c.count}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-emerald-400/70" style={{ width: `${Math.min(100, (c.points / 64) * 100)}%` }} />
                </span>
                <span className="w-12 flex-none text-right text-[11px] tabular-nums text-emerald-300">+{Math.round(c.points)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-slate-500">
            {result.breadth} signal type{result.breadth === 1 ? '' : 's'} so far. Confidence rises fastest when you engage in
            different ways — rating, saving, completing, and reacting to recommendations — not just by answering more.
          </p>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-slate-300">
          No signals yet. Complete the calibration and rate a few titles — each real signal is listed here with exactly how
          much it contributed.
        </p>
      )}
    </section>
  );
}
