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

export function Top10Slate({ surface = 'top10', sessionId }: { surface?: string; sessionId?: string }) {
  const [items, setItems] = useState<RailItem[] | null>(null);
  const loadedWork = useRef<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await buildRecommendationSlate({
        surface,
        ...(sessionId ? { sessionId } : {}),
        excludeKeys: [],
        limit: 10,
      });
      if (!live) return;
      setItems(
        r.ok
          ? r.items.map((i) => ({
              id: i.id,
              mediaType: i.mediaType,
              title: i.title,
              year: i.year,
              posterUrl: i.posterUrl,
              score: i.predicted,
            }))
          : [],
      );
    })();
    return () => {
      live = false;
    };
  }, [surface, sessionId]);

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
