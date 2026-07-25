'use client';

import { useState, useTransition } from 'react';
import { runLab, type LabInput, type LabResult, type LabSlot } from '@/lib/actions/recoLab';

/**
 * The runner is injectable so the SAME component can be driven in a browser
 * test without a Supabase session. The founder route always passes the
 * authorization-checked server action; the dev harness passes an in-browser
 * runner over the same engine.
 */
export type LabRunner = (input: LabInput) => Promise<LabResult>;

/**
 * FOUNDER RECOMMENDATION LAB — drives the real funnel and shows every stage.
 *
 * Two things this screen must never do: imply the fixture vectors are semantic,
 * or imply the synthetic catalog is real. Both are stated permanently at the
 * top rather than in a footnote, because a diagnostic that flatters itself is
 * worse than none.
 */

const SIZES = [5000, 10000, 50000] as const;
const COURTS = [
  { k: 'quick', label: 'Quick · 8 (4+4)' },
  { k: 'standard', label: 'Standard · 12 (6+6)' },
  { k: 'deep', label: 'Deep · 16 (8+8)' },
] as const;
const METHODS = [
  { k: 'min_protected', label: 'Minimum-satisfaction protection' },
  { k: 'weighted_mean', label: 'Weighted mean' },
  { k: 'disagreement_penalty', label: 'Disagreement penalty' },
  { k: 'nash', label: 'Nash compromise' },
] as const;

const EXAMPLE = 'A gritty science-fiction movie with a strong female lead, under two hours, on Netflix.';

interface MemberForm { name: string; confidence: number; exclusions: string; isHost: boolean; hasProfile: boolean }

export function RecommendationLab({ runner }: { runner?: LabRunner } = {}) {
  const execute: LabRunner = runner ?? ((input) => runLab(input));
  const [catalogSize, setCatalogSize] = useState<number>(5000);
  const [request, setRequest] = useState(EXAMPLE);
  const [courtSize, setCourtSize] = useState<'quick' | 'standard' | 'deep'>('standard');
  const [groupMethod, setGroupMethod] = useState<typeof METHODS[number]['k']>('min_protected');
  const [members, setMembers] = useState<MemberForm[]>([
    { name: 'Scott', confidence: 0.8, exclusions: '', isHost: true, hasProfile: true },
    { name: 'Heather', confidence: 0.7, exclusions: 'horror', isHost: false, hasProfile: true },
  ]);
  const [removals, setRemovals] = useState<{ id: string; reason: 'veto' | 'seen_it' | 'unavailable' | 'duplicate' }[]>([]);
  const [result, setResult] = useState<LabResult | null>(null);
  const [pending, start] = useTransition();

  function run(extraRemovals = removals) {
    start(async () => {
      const r = await execute({
        catalogSize: catalogSize as LabInput['catalogSize'], request,
        courtSize, groupMethod,
        members: members.map((m) => ({
          name: m.name, confidence: m.confidence, isHost: m.isHost, hasProfile: m.hasProfile,
          exclusions: m.exclusions.split(',').map((s) => s.trim()).filter(Boolean),
        })),
        removals: extraRemovals,
      }).catch((e: unknown) => ({ ...emptyish(), error: e instanceof Error ? e.message : 'Failed' } as LabResult));
      setResult(r);
    });
  }

  function remove(id: string, reason: 'veto' | 'seen_it') {
    const next = [...removals, { id, reason }];
    setRemovals(next);
    run(next);
  }

  return (
    <main
      // The global build badge floats across the top of every screen, so the
      // page reserves clearance for it — without this it sat on top of the
      // fixture-data warning, hiding the most important sentence here.
      className="min-h-dvh bg-slate-950 px-4 pb-8 pt-[calc(env(safe-area-inset-top)+3.5rem)] text-white"
      data-testid="reco-lab"
    >
      <div className="mx-auto max-w-6xl">
        <h1 className="text-xl font-black">Recommendation lab</h1>
        <p className="mt-1 text-sm text-slate-400">
          Founder diagnostic for the hybrid funnel. Not wired to the public app.
        </p>

        {/* Permanent honesty banner — not a footnote. */}
        <div data-testid="fixture-warning" className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-[13px] text-amber-100">
          <strong>Synthetic catalog, fixture vectors.</strong> Titles are generated, not real. Embeddings are
          deterministic test vectors and carry <em>no semantic meaning</em>. Stage counts and timings are real;
          recommendation <em>quality</em> cannot be judged from this screen.
        </div>

        {/* ------------------------------------------------------ controls -- */}
        <section className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Catalog size</span>
            <select
              data-testid="catalog-size" value={catalogSize}
              onChange={(e) => setCatalogSize(Number(e.target.value))}
              className="input mt-1 w-full"
            >
              {SIZES.map((s) => <option key={s} value={s}>{s.toLocaleString()} titles</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Court size</span>
            <select
              data-testid="court-size" value={courtSize}
              onChange={(e) => setCourtSize(e.target.value as typeof courtSize)}
              className="input mt-1 w-full"
            >
              {COURTS.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Request</span>
            <textarea
              data-testid="request-input" value={request} rows={2}
              onChange={(e) => setRequest(e.target.value)}
              className="input mt-1 w-full"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Group method</span>
            <select
              data-testid="group-method" value={groupMethod}
              onChange={(e) => setGroupMethod(e.target.value as typeof groupMethod)}
              className="input mt-1 w-full"
            >
              {METHODS.map((m) => <option key={m.k} value={m.k}>{m.label}</option>)}
            </select>
          </label>

          <div className="sm:col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Members</span>
            <ul className="mt-1 space-y-2">
              {members.map((m, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 p-2">
                  <input
                    aria-label={`Member ${i + 1} name`} value={m.name}
                    onChange={(e) => setMembers(members.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    className="input w-28"
                  />
                  <label className="text-xs text-slate-400">
                    conf
                    <input
                      type="number" step="0.1" min="0" max="1" value={m.confidence}
                      aria-label={`Member ${i + 1} confidence`}
                      onChange={(e) => setMembers(members.map((x, j) => (j === i ? { ...x, confidence: Number(e.target.value) } : x)))}
                      className="input ml-1 w-20"
                    />
                  </label>
                  <input
                    aria-label={`Member ${i + 1} exclusions`} value={m.exclusions} placeholder="exclusions"
                    onChange={(e) => setMembers(members.map((x, j) => (j === i ? { ...x, exclusions: e.target.value } : x)))}
                    className="input w-40"
                  />
                  <label className="text-xs text-slate-400">
                    <input
                      type="checkbox" checked={m.hasProfile}
                      onChange={(e) => setMembers(members.map((x, j) => (j === i ? { ...x, hasProfile: e.target.checked } : x)))}
                      className="mr-1"
                    />
                    has DNA
                  </label>
                  {m.isHost && <span className="rounded bg-brand-500/20 px-1.5 text-[10px] font-black text-brand-200">HOST</span>}
                  {members.length > 1 && (
                    <button onClick={() => setMembers(members.filter((_, j) => j !== i))} className="ml-auto text-xs text-red-300">remove</button>
                  )}
                </li>
              ))}
            </ul>
            <button
              data-testid="add-member"
              onClick={() => setMembers([...members, { name: `Member ${members.length + 1}`, confidence: 0.6, exclusions: '', isHost: false, hasProfile: true }])}
              className="btn-secondary mt-2 text-xs"
            >Add member</button>
          </div>

          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <button data-testid="run-funnel" onClick={() => { setRemovals([]); run([]); }} disabled={pending} className="btn-primary">
              {pending ? 'Running…' : 'Run funnel'}
            </button>
            {removals.length > 0 && (
              <button onClick={() => { setRemovals([]); run([]); }} className="btn-secondary text-sm">Reset replacements</button>
            )}
          </div>
        </section>

        {result?.error && <p role="alert" data-testid="lab-error" className="mt-4 text-sm text-red-300">{result.error}</p>}

        {result?.ok && (
          <div data-testid="lab-results" className="mt-6 space-y-5">
            {/* -------------------------------------------------- stages -- */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-300">Funnel</h2>
              <p className="mt-1 text-xs text-slate-500">
                Catalog {result.catalogSize.toLocaleString()} · {result.catalogCached ? 'cached' : `generated in ${result.catalogGenerationMs}ms`}
                {' · '}ranking {result.rankingVersion} · total {result.totalMs}ms
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="text-slate-500">
                    <tr><th className="py-1">Stage</th><th>In</th><th>Out</th><th>ms</th></tr>
                  </thead>
                  <tbody data-testid="stage-table">
                    {result.stages.map((s) => (
                      <tr key={s.stage} className="border-t border-white/5" data-testid={`stage-${s.stage}`}>
                        <td className="py-1 font-semibold text-white">{s.stage}</td>
                        <td className="tabular-nums text-slate-300">{s.countIn.toLocaleString()}</td>
                        <td className="tabular-nums text-brand-200">{s.countOut.toLocaleString()}</td>
                        <td className="tabular-nums text-slate-400">{s.ms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Channels: {Object.entries(result.channelCounts).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}
              </p>
              <p className="mt-1 text-xs text-slate-400" data-testid="removals">
                Removed: {Object.entries(result.filterRemovals).map(([k, v]) => `${k} ${v}`).join(' · ') || 'nothing'}
                {result.limitingConstraint && <> · <strong className="text-amber-200">limiting: {result.limitingConstraint}</strong></>}
              </p>
            </section>

            {/* --------------------------------------------------- parse -- */}
            <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <summary className="cursor-pointer text-sm font-black uppercase tracking-wide text-slate-300">
                Parsed request · confidence {result.parserConfidence.toFixed(2)}
              </summary>
              <pre data-testid="parsed-json" className="mt-3 max-h-72 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] text-slate-300">
                {JSON.stringify(result.parsed, null, 2)}
              </pre>
              <p className="mt-2 text-[11px] text-slate-500">Fingerprint {result.fingerprint}</p>
            </details>

            {result.shortfall > 0 && (
              <p data-testid="shortfall" className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                {result.shortfallReason}
              </p>
            )}

            {result.replacementLog.length > 0 && (
              <section data-testid="replacement-log" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <h2 className="text-sm font-black uppercase tracking-wide text-slate-300">Replacements</h2>
                <ul className="mt-2 space-y-1 text-xs text-slate-300">
                  {result.replacementLog.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              </section>
            )}

            <Pool title="Active" testid="active-pool" slots={result.active} onRemove={remove} />
            <Pool title="Reserve" testid="reserve-pool" slots={result.reserve} />
          </div>
        )}
      </div>
    </main>
  );
}

function Pool({ title, testid, slots, onRemove }: {
  title: string; testid: string; slots: LabSlot[];
  onRemove?: (id: string, reason: 'veto' | 'seen_it') => void;
}) {
  return (
    <section data-testid={testid} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-sm font-black uppercase tracking-wide text-slate-300">
        {title} <span data-testid={`${testid}-count`} className="text-brand-200">{slots.length}</span>
      </h2>
      <ul className="mt-3 space-y-2">
        {slots.map((s) => (
          <li key={s.id} data-testid="lab-slot" className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-bold text-white">{s.title}</span>
              <span className="text-[11px] text-slate-500">{s.genres.join('/')} · {s.year ?? 'year unknown'} · {s.runtime ? `${s.runtime}m` : 'runtime unknown'}</span>
              <span className="ml-auto text-xs font-bold tabular-nums text-brand-200">{s.score.toFixed(3)}</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">{s.reason}{s.addsDimension.length > 0 && ` — ${s.addsDimension.join(', ')}`}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {s.availability.length > 0
                ? `On ${s.availability.join(', ')}`
                : s.availabilityStale
                  ? 'Availability last checked over 14 days ago — unconfirmed'
                  : 'No confirmed availability'}
            </p>
            <details className="mt-1">
              <summary className="cursor-pointer text-[11px] text-brand-300">Diagnostics</summary>
              <div className="mt-1 space-y-1 text-[11px] text-slate-400">
                <p>Members: {Object.entries(s.memberScores).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ') || '—'}</p>
                <p>Group mean {s.groupMean.toFixed(3)} · lowest {s.lowestMemberScore.toFixed(3)} · disagreement {s.disagreement.toFixed(3)}</p>
                <p>Retrieved via {s.retrievalChannels.map((c) => `${c.channel}#${c.rank}`).join(', ') || '—'}</p>
                <p>Components: {Object.entries(s.fastComponents).map(([k, v]) => `${k} ${v == null ? 'n/a' : v.toFixed(2)}`).join(' · ')}</p>
                <p>Priority {s.replacementPriority} · tags {s.tags.join(', ')}</p>
              </div>
            </details>
            {onRemove && (
              <div className="mt-2 flex gap-2">
                <button data-testid={`veto-${s.id}`} onClick={() => onRemove(s.id, 'veto')} className="rounded-lg border border-red-400/40 px-2 py-1 text-[11px] text-red-200">Veto</button>
                <button data-testid={`seen-${s.id}`} onClick={() => onRemove(s.id, 'seen_it')} className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-slate-300">Seen it</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function emptyish(): LabResult {
  return {
    ok: false, catalogSize: 0, catalogCached: false, catalogGenerationMs: 0, catalogMix: {},
    parsed: null, parserConfidence: 0, fingerprint: '', stages: [], channelCounts: {},
    filterRemovals: {}, limitingConstraint: null, totals: {}, semanticEmbeddings: false,
    rankingVersion: '', active: [], reserve: [], shortfall: 0, shortfallReason: null,
    replacementLog: [], totalMs: 0,
  };
}
