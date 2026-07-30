import type { EvidenceSummary, EvidenceSource, FactorBasis } from '@/lib/verdict/evidence';

/**
 * The evidence half of "How this score was built".
 *
 * The old panel listed all nine rating sources as equal rows, so a title with
 * one real rating showed one number under eight "Not available" lines. This
 * replaces that with a compact trust summary: only what contributed is on
 * screen by default, and the full accounting — including what was missing and
 * what was deliberately not counted — sits one click away.
 */

const STRENGTH_STYLE: Record<EvidenceSummary['strength'], string> = {
  strong: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100',
  moderate: 'border-amber-400/40 bg-amber-500/10 text-amber-100',
  limited: 'border-slate-400/30 bg-white/5 text-slate-200',
};

const DOT: Record<EvidenceSummary['strength'], string> = {
  strong: 'bg-emerald-400',
  moderate: 'bg-amber-400',
  limited: 'bg-slate-400',
};

/** One score factor: the bar, plus what the number is actually made of. */
export function FactorBar({ factor }: { factor: FactorBasis }) {
  return (
    <div data-testid={`factor-${factor.key}`}>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
        <span className="min-w-0 text-slate-300">{factor.label}</span>
        <span className="flex flex-none items-center gap-1.5">
          {factor.neutralBaseline && (
            <span
              className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-300"
              data-testid={`baseline-${factor.key}`}
            >
              baseline
            </span>
          )}
          <span className="tabular-nums text-slate-200">{factor.value}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full ${
            factor.neutralBaseline
              ? 'bg-white/20'
              : 'bg-gradient-to-r from-brand-500 to-brand-300'
          }`}
          style={{ width: `${factor.value}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] leading-snug text-slate-500" data-testid={`basis-${factor.key}`}>
        {factor.basis}
      </p>
    </div>
  );
}

function SourceRow({ s }: { s: EvidenceSource }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
      <span className="min-w-0 break-words text-slate-300">{s.name}</span>
      <span className={`flex-none tabular-nums ${s.available ? 'text-slate-100' : 'text-slate-500'}`}>
        {s.raw ?? 'No data'}
      </span>
      <span className="w-full text-[11px] leading-snug text-slate-500">{s.note}</span>
    </li>
  );
}

export function SourceConfidenceCard({
  evidence,
  retrievedAt,
}: {
  evidence: EvidenceSummary;
  /** ISO timestamp the report was assembled. */
  retrievedAt?: string | null;
}) {
  const { counted, contextOnly, unavailable } = evidence;
  const stamp = retrievedAt ? new Date(retrievedAt) : null;
  const stampText =
    stamp && !Number.isNaN(stamp.getTime())
      ? stamp.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : null;

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-4"
      data-testid="source-confidence"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${STRENGTH_STYLE[evidence.strength]}`}
          data-testid="evidence-strength"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[evidence.strength]}`} aria-hidden />
          {evidence.strengthLabel} evidence
        </span>
        {evidence.qualifier && (
          <span
            className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-100"
            data-testid="score-qualifier"
          >
            {evidence.qualifier}
          </span>
        )}
      </div>

      <p className="mt-3 text-sm text-slate-300" data-testid="evidence-headline">
        {evidence.headline}
      </p>

      {counted.length > 0 && (
        <ul className="mt-2 space-y-1" data-testid="contributing-sources">
          {counted.map((s) => (
            <li key={s.name} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="min-w-0 break-words text-slate-400">{s.name}</span>
              <span className="flex-none font-semibold tabular-nums text-white">{s.raw}</span>
            </li>
          ))}
        </ul>
      )}

      {evidence.unavailableNote && (
        <p className="mt-3 text-xs leading-snug text-slate-500" data-testid="unavailable-note">
          {evidence.unavailableNote}
        </p>
      )}

      <details className="group mt-3 border-t border-white/10 pt-3" data-testid="source-details">
        <summary
          className="-m-1 cursor-pointer list-none rounded p-1 text-xs font-semibold text-slate-300 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-brand-400"
          data-testid="source-details-toggle"
        >
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="transition group-open:rotate-90">›</span>
            View source details
          </span>
        </summary>

        <div className="mt-3 space-y-4 text-sm" data-testid="source-details-body">
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Counted toward the score ({counted.length})
            </h4>
            {counted.length > 0 ? (
              <ul className="mt-1 divide-y divide-white/5" data-testid="detail-counted">
                {counted.map((s) => <SourceRow key={s.name} s={s} />)}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                None. The quality figure sits at its neutral baseline rather than being estimated.
              </p>
            )}
          </section>

          {contextOnly.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Shown for context, not counted ({contextOnly.length})
              </h4>
              <ul className="mt-1 divide-y divide-white/5" data-testid="detail-context">
                {contextOnly.map((s) => <SourceRow key={s.name} s={s} />)}
              </ul>
            </section>
          )}

          {unavailable.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Unavailable ({unavailable.length})
              </h4>
              <ul className="mt-1 divide-y divide-white/5" data-testid="detail-unavailable">
                {unavailable.map((s) => <SourceRow key={s.name} s={s} />)}
              </ul>
            </section>
          )}

          <p className="text-[11px] leading-snug text-slate-500" data-testid="detail-footnote">
            {stampText ? `Ratings retrieved ${stampText}. ` : ''}
            These providers do not publish a per-source timestamp, so no age is claimed for any
            individual rating. A source with no data is left out of the blend entirely — it is never
            counted as zero, averaged in as neutral, or reconstructed from another source.
          </p>
        </div>
      </details>
    </div>
  );
}
