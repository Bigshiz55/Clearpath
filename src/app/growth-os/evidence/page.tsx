import { createClient } from '@/lib/supabase/server';
import { loadUserEvidence, type EvidenceRecord } from '@/lib/preference/readModel';

export const dynamic = 'force-dynamic';

/**
 * FOUNDER USER-EVIDENCE INSPECTOR — every piece of preference evidence this
 * account holds, in ONE provenance-carrying shape (Phase 3's read model).
 * Admin-gated by the Growth OS layout (non-admins 404 before this renders);
 * RLS additionally scopes every read to the signed-in account, so the
 * founder inspects their own evidence, never anyone else's.
 *
 * This is the page that answers "which evidence, from where, observed when"
 * — the question the four derived taste models flatten away. A store that
 * could not be read is NAMED, never silently an empty contribution.
 */

const KIND_ORDER: EvidenceRecord['kind'][] = [
  'reaction',
  'rating',
  'rule',
  'axis_override',
  'axis_signal',
  'outcome',
];

const KIND_LABEL: Record<EvidenceRecord['kind'], string> = {
  reaction: 'Reactions (preference_events)',
  rating: 'Ratings (watchlist)',
  rule: 'FOR / AGAINST rules',
  axis_override: 'Pinned dials',
  axis_signal: 'Axis aggregates (dimension_signals)',
  outcome: 'Prediction outcomes',
};

export default async function EvidencePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const evidence = user ? await loadUserEvidence(supabase, user.id) : { records: [], unreadable: [] };

  const byKind = new Map<EvidenceRecord['kind'], EvidenceRecord[]>();
  for (const r of evidence.records) {
    const list = byKind.get(r.kind) ?? [];
    list.push(r);
    byKind.set(r.kind, list);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-lg font-black text-white">User evidence</h1>
      <p className="mt-1 text-sm text-slate-400">
        Every preference-evidence record this account holds, with its provenance — source,
        observation time, confidence where the source grades itself. This is the raw material
        the derived Taste DNA folds (and, before this page, flattened).
      </p>

      {evidence.unreadable.length > 0 && (
        <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Could not read: {evidence.unreadable.join(', ')} — those stores are unreported above,
          not empty.
        </p>
      )}

      {evidence.records.length === 0 && evidence.unreadable.length === 0 ? (
        <p className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          No evidence recorded for this account yet.
        </p>
      ) : (
        KIND_ORDER.filter((k) => byKind.has(k)).map((kind) => {
          const rows = byKind.get(kind)!;
          return (
            <section key={kind} className="mt-6">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-300">
                {KIND_LABEL[kind]} <span className="font-normal text-slate-500">· {rows.length}</span>
              </h2>
              <ul className="mt-2 divide-y divide-white/10 rounded-xl border border-white/10 bg-white/[0.03]">
                {rows.slice(0, 40).map((r, i) => (
                  <li key={`${r.key}-${i}`} className="flex items-baseline gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-white">{r.key}</span>
                    <span className="flex-none tabular-nums text-slate-300">{r.weight}</span>
                    <span className="flex-none rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                      {r.provenance.source}
                    </span>
                    {r.provenance.confidence != null && (
                      <span className="flex-none text-[11px] tabular-nums text-slate-400">
                        conf {r.provenance.confidence}
                      </span>
                    )}
                    {r.detail?.aggregated === true && (
                      <span
                        className="flex-none rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-200"
                        title="A running aggregate — the individual contributions were not kept"
                      >
                        aggregate
                      </span>
                    )}
                    <span className="flex-none text-[11px] tabular-nums text-slate-500">
                      {r.provenance.observedAt.slice(0, 10)}
                    </span>
                  </li>
                ))}
                {rows.length > 40 && (
                  <li className="px-4 py-2 text-[11px] text-slate-500">… and {rows.length - 40} more</li>
                )}
              </ul>
            </section>
          );
        })
      )}
    </main>
  );
}
