import { getCachedDimensions } from '@/lib/titleDimensions';
import { readTitleKnowledge } from '@/lib/knowledge/store';
import { getCardAvailability } from '@/lib/watchmode/cardAvailability';
import type { MediaType } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * FOUNDER TITLE-EVIDENCE INSPECTOR — Phase 9. Everything the system KNOWS
 * about one title, with per-source provenance, in one place:
 *
 *   - the 18-axis content fingerprint (title_dimensions, cache-only)
 *   - the compiled knowledge layer (title_knowledge / title_subject_facts —
 *     centrality verdicts with confidence, decided_by, disputed flags)
 *   - cached availability with its as-of (the Slice A provenance)
 *
 * Admin-gated by the Growth OS layout (non-admins 404 before this renders).
 * Every absent source is NAMED as absent — "no fingerprint yet", "knowledge
 * tables unreadable", "never availability-checked" — never rendered as an
 * empty section that could be misread as "nothing to know".
 */
export default async function TitleEvidencePage({
  searchParams,
}: {
  searchParams?: { type?: string; id?: string };
}) {
  const mediaType: MediaType = searchParams?.type === 'tv' ? 'tv' : 'movie';
  const id = Number(searchParams?.id);
  const valid = Number.isFinite(id) && id > 0;

  const [dims, knowledge, availability] = valid
    ? await Promise.all([
        getCachedDimensions([{ tmdb_id: id, media_type: mediaType }]).catch(() => new Map()),
        readTitleKnowledge(id, mediaType),
        getCardAvailability(mediaType, id).catch(() => null),
      ])
    : [new Map(), { header: null, facts: [], absent: true }, null];

  const fingerprint = valid ? dims.get(`${mediaType}:${id}`) ?? dims.get(`${mediaType}-${id}`) ?? null : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-lg font-black text-white">Title evidence</h1>
      <p className="mt-1 text-sm text-slate-400">
        Everything the system knows about one title, with provenance. Query with{' '}
        <code className="rounded bg-white/10 px-1">?type=movie&id=1366</code>.
      </p>

      {!valid ? (
        <p className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          Pass a TMDB id to inspect.
        </p>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-300">
              Content fingerprint (title_dimensions)
            </h2>
            {!fingerprint ? (
              <p className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-400">
                No cached fingerprint — the classifier has not reached this title. Absence of
                evidence, not evidence of absence.
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm sm:grid-cols-3">
                {Object.entries(fingerprint as Record<string, number>).map(([axis, v]) => (
                  <div key={axis} className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-slate-400">{axis}</span>
                    <span className="tabular-nums text-white">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-300">
              Compiled knowledge (title_subject_facts)
            </h2>
            {knowledge.absent ? (
              <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                Knowledge tables unreadable from this deployment — unreported, not empty.
              </p>
            ) : knowledge.facts.length === 0 ? (
              <p className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-400">
                No compiled subject facts for this title yet.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-white/10 rounded-xl border border-white/10 bg-white/[0.03]">
                {knowledge.facts.map((f) => (
                  <li key={f.subject} className="flex items-baseline gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-white">{f.subject}</span>
                    <span className="flex-none font-black text-slate-200">{f.centrality}</span>
                    <span className="flex-none tabular-nums text-slate-400">
                      conf {f.confidence} · {f.sourceCount} src
                    </span>
                    <span className="flex-none rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                      {f.decidedBy}
                    </span>
                    {f.disputed && (
                      <span className="flex-none rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-200">
                        disputed
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {knowledge.header != null && (
              <p className="mt-2 text-[11px] text-slate-500">
                Header: status {String((knowledge.header as { status?: unknown }).status ?? '—')} · compiled{' '}
                {String((knowledge.header as { compiled_at?: unknown }).compiled_at ?? '—').slice(0, 10)}
              </p>
            )}
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-300">
              Cached availability (with its as-of)
            </h2>
            {!availability || availability.status === 'unconfirmed' ? (
              <p className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-400">
                Never availability-checked by the sync — unknown, not unavailable.
              </p>
            ) : (
              <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                <p className="text-slate-300">
                  {availability.sources.length === 0
                    ? 'Checked: nothing found.'
                    : availability.sources.map((s) => s.name).join(' · ')}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  as of {availability.checkedAt ? availability.checkedAt.slice(0, 10) : 'unknown'} · source: watchmode cache
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
