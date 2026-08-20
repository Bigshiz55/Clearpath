import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { readDecisionRun } from '@/lib/graph/store';
import { checkRunInvariants } from '@/lib/graph/invariants';
import { hardRequirements } from '@/lib/graph/types';

export const dynamic = 'force-dynamic';

/**
 * ONE DECISION RUN, AS ITS GRAPH. Raw input → classification → constraint
 * edges → per-candidate verdicts (rejections with their stated reasons) →
 * returned results → writes — plus the invariant suite executed live over
 * the stored run, so a violation is visible the moment the page loads.
 * The evidence rendered here is the evidence the route executed; nothing is
 * reconstructed.
 */
export default async function DecisionRunPage({ params }: { params: { runId: string } }) {
  const supabase = createClient();
  const run = await readDecisionRun(supabase, params.runId);
  if (!run) notFound();

  const byPredicate = (p: string) => run.edges.filter((e) => e.predicate === p);
  const required = hardRequirements(run);
  const rejected = byPredicate('rejected');
  const satisfies = byPredicate('satisfies');
  const returned = byPredicate('returned');
  const scored = new Map(byPredicate('scored').map((e) => [e.subject, e.object]));
  const writes = [...byPredicate('wrote_taste'), ...byPredicate('seeded_title')];
  const violations = checkRunInvariants(run);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="mt-5">
      <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{title}</h2>
      <div className="mt-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-200">{children}</div>
    </section>
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/growth-os/decisions" className="text-xs text-slate-400 hover:text-white">← runs</Link>
      <h1 className="mt-2 text-lg font-black text-white">&ldquo;{run.rawText}&rdquo;</h1>
      <p className="mt-1 text-xs text-slate-400">
        {run.entryPoint} · {run.intent.kind} · <span className="font-bold">{run.intent.persistence}</span> · {run.createdAt} · {run.id}
      </p>

      <Section title={`Invariants — ${violations.length === 0 ? 'all hold' : `${violations.length} VIOLATION(S)`}`}>
        {violations.length === 0 ? (
          <p className="text-emerald-300">INV-1 · INV-2 · INV-6 · INV-8 · INV-10 hold over this run.</p>
        ) : (
          <ul className="space-y-1">
            {violations.map((v, i) => (
              <li key={i} className="text-red-300"><span className="font-black">{v.invariant}</span> — {v.message}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Hard requirements">
        {required.length === 0 ? <p className="text-slate-400">None stated.</p> : (
          <ul className="space-y-0.5">
            {required.map((e, i) => (
              <li key={i}><span className="text-slate-400">{e.predicate}</span> → <span className="font-bold text-white">{e.object}</span></li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Returned (${returned.length})`}>
        {returned.length === 0 ? <p className="text-slate-400">No results returned.</p> : (
          <ul className="space-y-0.5">
            {returned.map((e, i) => (
              <li key={i}>
                <span className="font-bold text-white">{String(e.detail?.title ?? e.object)}</span>{' '}
                <span className="text-slate-500">{e.object}</span>
                {scored.has(e.object) && <span className="ml-2 rounded bg-pink-500/20 px-1 text-[11px] font-black text-pink-200">{scored.get(e.object)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Eligibility — satisfied (${satisfies.length}) / rejected (${rejected.length})`}>
        <ul className="space-y-1">
          {satisfies.map((e, i) => (
            <li key={`s${i}`} className="text-emerald-200">
              ✓ {String(e.detail?.title ?? e.subject)} satisfies <span className="font-bold">{e.object}</span>
              {e.provenance && <span className="ml-1 text-[11px] text-slate-500">({e.provenance.source}, conf {e.provenance.confidence ?? '—'})</span>}
            </li>
          ))}
          {rejected.map((e, i) => (
            <li key={`r${i}`} className="text-red-200">
              ✗ {String(e.detail?.title ?? e.subject)} — {e.object}
              {e.provenance && <span className="ml-1 text-[11px] text-slate-500">({e.provenance.source}, conf {e.provenance.confidence ?? '—'})</span>}
            </li>
          ))}
          {satisfies.length === 0 && rejected.length === 0 && <li className="text-slate-400">No per-candidate verdicts (no subject constraint ran).</li>}
        </ul>
      </Section>

      <Section title={`Writes (${writes.length})`}>
        {writes.length === 0 ? <p className="text-slate-400">This run wrote nothing durable.</p> : (
          <ul className="space-y-0.5">
            {writes.map((e, i) => (
              <li key={i}>
                <span className="text-slate-400">{e.predicate}</span> → <span className="font-bold text-white">{e.object}</span>
                {typeof e.detail?.durableEvidence === 'string' && e.detail.durableEvidence !== '' && (
                  <span className="ml-2 text-[11px] text-slate-500">justified by: &ldquo;{e.detail.durableEvidence}&rdquo;</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`All edges (${run.edges.length})`}>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-slate-300">
          {JSON.stringify(run.edges, null, 1)}
        </pre>
      </Section>
    </main>
  );
}
