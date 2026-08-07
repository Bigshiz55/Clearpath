'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { buildRecommendationSlate, recordRecommendationOutcome, type SlateItem } from '@/lib/actions/recommendations';
import { WCheck } from '@/components/WCheck';
import { AlgorithmScore } from '@/components/AlgorithmScore';
import { TrailerMedia } from '@/components/trailer/TrailerMedia';

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
  /** Where a refresh puts you: the top of the new slate, not the bottom of the old one. */
  const top = useRef<HTMLDivElement>(null);

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
        // A REFRESH REPLACES THE SLATE, SO IT HAS TO REPLACE YOUR POSITION TOO.
        // Pressing Refresh from the bottom of the old set left the viewport
        // where it was — which is now the bottom of a completely different set,
        // with twelve titles you have never seen scrolled off above you and a
        // long scroll back up to reach them. Not on the first, server-seeded
        // load: nobody asked for that one, so nobody should be moved by it.
        if (!isFirst) top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
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
      {/* The anchor a refresh scrolls you back to. `scroll-mt` clears the
          sticky header so the heading is not tucked underneath it. */}
      <div ref={top} className="scroll-mt-20" aria-hidden />
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
            <div key={key} className="card wv-tile overflow-hidden p-0" data-testid="reco-item">
              <div className="relative aspect-[2/3] bg-black/30">
                {/* The W goes upper-RIGHT, where it is on every other card, so
                    putting a pick on the docket is one gesture everywhere. The
                    predicted score moves left to make room — it is this
                    surface's own number (logged for accuracy tracking) and is
                    not the same thing as the Verd1ct below. */}
                <WCheck tmdbId={it.id} mediaType={it.mediaType} title={it.title} year={it.year} posterUrl={it.posterUrl} />
                <TrailerMedia tmdbId={it.id} mediaType={it.mediaType} title={it.title}>
                  {it.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.posterUrl} alt={it.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center p-2 text-center text-xs font-bold text-white">{it.title}</div>
                  )}
                </TrailerMedia>
                <span className="absolute left-1 top-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-black text-white" title="Predicted match for you">{it.predicted}</span>
              </div>
              <div className="p-2">
                <div className="line-clamp-1 text-xs font-bold text-white">{it.title}</div>
                {it.matchReason && <div className="mt-0.5 line-clamp-1 text-[10px] text-slate-400" title={it.matchReason}>{it.matchReason}</div>}
                {/* The same ratings box every other card carries — Rotten
                    Tomatoes, the audience score and IMDb. This surface showed a
                    bare number in the poster corner and nothing else, so the
                    one grid built to be judged on accuracy was the one with no
                    evidence on it. */}
                <AlgorithmScore compact mediaType={it.mediaType} tmdbId={it.id} title={it.title} year={it.year} className="mt-1.5" />
                {/* WORDS, NOT EMOJI. This row was 👍 📌 ✕ — three glyphs with
                    no shared vocabulary: the thumb could mean "watched", the
                    pin could mean "pinned to top", and a bare ✕ reads as
                    "close" far more often than "not for me". They now say what
                    they do, in the same three words every other card in the
                    app uses, with the same colours. */}
                <div className="mt-1.5 flex gap-1">
                  <button type="button" onClick={() => react(it, 'rated_up')} className={`wv-act flex flex-1 items-center justify-center rounded-md border-2 px-1 ${r === 'up' ? 'border-emerald-300 bg-emerald-500/60 text-white' : 'border-emerald-400/70 bg-emerald-500/20 text-emerald-100'}`} data-testid="reco-up" aria-label="For it — more like this"><span className="wv-act-label font-black uppercase tracking-wide">For</span></button>
                  <button type="button" onClick={() => react(it, 'dismissed')} className={`wv-act flex flex-1 items-center justify-center rounded-md border-2 px-1 ${r === 'down' ? 'border-red-300 bg-red-500/60 text-white' : 'border-red-400/70 bg-red-500/20 text-red-100'}`} data-testid="reco-down" aria-label="Not for me — teaches your Viewer DNA"><span className="wv-act-label font-black uppercase tracking-wide">Against</span></button>
                  <button type="button" onClick={() => react(it, 'saved')} className={`wv-act flex flex-1 items-center justify-center rounded-md border-2 px-1 ${r === 'saved' ? 'border-pink-200/70 bg-gradient-to-b from-[#ff62b6] to-[#ff1493] text-white' : 'border-[#ff1493]/70 bg-[#ff1493]/25 text-pink-50'}`} data-testid="reco-save" aria-label="Save to your list"><span className="wv-act-label font-black uppercase tracking-wide">{r === 'saved' ? 'Saved' : 'Save'}</span></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
