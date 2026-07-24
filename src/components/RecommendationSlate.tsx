'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { buildRecommendationSlate, recordRecommendationOutcome, type SlateItem } from '@/lib/actions/recommendations';

/**
 * A refreshable, self-validating recommendation slate.
 *   • "Refresh Recommendations" re-ranks from the SAME DNA (never resets it),
 *     excludes everything already shown this run (no duplicates), and records
 *     each surfaced title as an impression with the DNA snapshot + algo version.
 *   • Each reaction ("I'd Watch This" / "Not For Me" / "Save") is recorded as an
 *     outcome — feeding recommendation accuracy AND DNA Confidence.
 */
export function RecommendationSlate({
  surface = 'refresh',
  sessionId,
  initial,
  initialAlgo,
}: {
  surface?: string;
  sessionId?: string;
  initial?: SlateItem[];
  initialAlgo?: string;
}) {
  const [items, setItems] = useState<SlateItem[]>(initial ?? []);
  const [algo, setAlgo] = useState(initialAlgo ?? '');
  const [reacted, setReacted] = useState<Record<string, 'up' | 'down' | 'saved'>>({});
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const shown = useRef<Set<string>>(new Set((initial ?? []).map((i) => `${i.mediaType}:${i.id}`)));

  const refresh = useCallback(
    (isFirst = false) => {
      setMsg(null);
      start(async () => {
        const r = await buildRecommendationSlate({
          surface,
          sessionId,
          excludeKeys: isFirst ? [] : Array.from(shown.current),
          limit: 12,
        });
        if (!r.ok) { setMsg(r.error ?? 'Could not refresh.'); return; }
        r.items.forEach((it) => shown.current.add(`${it.mediaType}:${it.id}`));
        setItems(r.items);
        setAlgo(r.algoVersion);
        setReacted({});
        if (r.items.length === 0) setMsg('No fresh picks right now — rate a few more titles to widen your slate.');
      });
    },
    [surface, sessionId],
  );

  // Cold start: fetch a first slate if none was server-provided.
  useEffect(() => {
    if (!initial) refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const react = (it: SlateItem, kind: 'rated_up' | 'dismissed' | 'saved') => {
    const key = `${it.mediaType}:${it.id}`;
    setReacted((m) => ({ ...m, [key]: kind === 'rated_up' ? 'up' : kind === 'saved' ? 'saved' : 'down' }));
    void recordRecommendationOutcome({
      tmdbId: it.id,
      mediaType: it.mediaType,
      kind,
      predicted: it.predicted,
      confidence: it.confidence,
      sessionId,
    });
  };

  return (
    <section data-testid="reco-slate">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">🧬 Recommended for you</h2>
          {algo && <p className="text-[11px] text-slate-500">Algorithm {algo} · every pick is logged for accuracy tracking</p>}
        </div>
        <button
          type="button"
          onClick={() => refresh(false)}
          disabled={pending}
          className="btn-secondary text-sm disabled:opacity-50"
          data-testid="reco-refresh"
        >
          {pending ? 'Refreshing…' : '↻ Refresh Recommendations'}
        </button>
      </div>

      {msg && <p className="mt-3 text-sm text-slate-300">{msg}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((it) => {
          const key = `${it.mediaType}:${it.id}`;
          const r = reacted[key];
          return (
            <div key={key} className="card overflow-hidden p-0" data-testid="reco-item">
              <div className="relative aspect-[2/3] bg-black/30">
                {it.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.posterUrl} alt={it.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center p-2 text-center text-xs font-bold text-white">{it.title}</div>
                )}
                <span className="absolute right-1 top-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-black text-white">{it.predicted}</span>
              </div>
              <div className="p-2">
                <div className="line-clamp-1 text-xs font-bold text-white">{it.title}</div>
                {it.matchReason && <div className="mt-0.5 line-clamp-1 text-[10px] text-slate-400" title={it.matchReason}>{it.matchReason}</div>}
                <div className="mt-1.5 flex gap-1">
                  <button type="button" onClick={() => react(it, 'rated_up')} className={`flex-1 rounded-md border px-1 py-1 text-[11px] font-bold ${r === 'up' ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200' : 'border-white/15 text-slate-200'}`} data-testid="reco-up" aria-label="I'd watch this">👍</button>
                  <button type="button" onClick={() => react(it, 'saved')} className={`flex-1 rounded-md border px-1 py-1 text-[11px] font-bold ${r === 'saved' ? 'border-amber-400 bg-amber-500/20 text-amber-200' : 'border-white/15 text-slate-200'}`} data-testid="reco-save" aria-label="Save">📌</button>
                  <button type="button" onClick={() => react(it, 'dismissed')} className={`flex-1 rounded-md border px-1 py-1 text-[11px] font-bold ${r === 'down' ? 'border-rose-400 bg-rose-500/20 text-rose-200' : 'border-white/15 text-slate-200'}`} data-testid="reco-down" aria-label="Not for me">✕</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
