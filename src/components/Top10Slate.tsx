'use client';

/**
 * THE TOP 10, WIRED.
 *
 * Ranks from the same slate builder every other recommendation surface uses —
 * there is no second ranking here — and fetches each title's WORKING lazily,
 * because pulling ten breakdowns nobody has asked to see is ten requests spent
 * on a panel that stays closed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildRecommendationSlate } from '@/lib/actions/recommendations';
import { Top10Rail, type RailItem } from '@/components/Top10Rail';
import type { StandardContribution } from '@/lib/scoring/standardScore';
import { reportReliabilityEvent } from '@/lib/monitoringClient';

// buildRecommendationSlate is a server action with no AbortController of
// its own — race it against a timer so a stalled call can't leave the
// skeleton spinning forever (see HomeRecommendations.tsx for the same fix).
const SLATE_TIMEOUT_MS = 8000;

export function Top10Slate({ surface = 'top10', sessionId }: { surface?: string; sessionId?: string }) {
  const [items, setItems] = useState<RailItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const loadedWork = useRef<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    setItems(null);
    setFailed(false);
    void (async () => {
      try {
        const r = await Promise.race([
          buildRecommendationSlate({ surface, ...(sessionId ? { sessionId } : {}), excludeKeys: [], limit: 10 }),
          new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), SLATE_TIMEOUT_MS)),
        ]);
        if (!live) return;
        if (!r.ok) {
          setFailed(true);
          reportReliabilityEvent('page_load_failure', { surface });
          return;
        }
        setItems(
          r.items.map((i) => ({
            id: i.id,
            mediaType: i.mediaType,
            title: i.title,
            year: i.year,
            posterUrl: i.posterUrl,
            score: i.predicted,
          })),
        );
      } catch {
        if (live) {
          setFailed(true);
          reportReliabilityEvent('page_load_failure', { surface });
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [surface, sessionId, attempt]);

  // Fill in the working for a title the moment someone asks to see it.
  const loadWork = useCallback(async (item: RailItem) => {
    const key = `${item.mediaType}:${item.id}`;
    if (loadedWork.current.has(key)) return;
    loadedWork.current.add(key);
    try {
      const res = await fetch(`/api/quicklook/${item.mediaType}/${item.id}`);
      if (!res.ok) return;
      const d = (await res.json()) as {
        standardScore?: number;
        standardContributions?: StandardContribution[];
      };
      const contributions = d.standardContributions ?? [];
      if (contributions.length === 0) return;
      const base = typeof d.standardScore === 'number' ? d.standardScore : item.score;
      setItems((prev) =>
        (prev ?? []).map((x) =>
          `${x.mediaType}:${x.id}` === key
            ? {
                ...x,
                // The personal number IS the general blend plus the taste move,
                // so the difference between them is the taste line — not a
                // second figure invented for the panel.
                work: { contributions, score: base, personalDelta: x.score - base },
              }
            : x,
        ),
      );
    } catch {
      /* the rail already says so when there is no working to show */
    }
  }, []);

  if (failed) {
    return (
      <div className="rounded-2xl border border-white/12 bg-white/[0.03] p-5 text-center" data-testid="top10-error">
        <p className="text-sm text-slate-300">Couldn’t load your Top 10 right now.</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="btn-secondary mt-3">
          Try again
        </button>
      </div>
    );
  }

  if (items === null) {
    return <div className="h-48 animate-pulse rounded-xl bg-white/5" data-testid="top10-loading" />;
  }
  if (items.length === 0) return null;

  return (
    <Top10Rail
      title="Your Top 10 right now"
      eyebrow="ranked by your Watch DNA · tap a score to see the maths"
      items={items}
      onExpand={loadWork}
    />
  );
}
