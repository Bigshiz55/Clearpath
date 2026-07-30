'use client';

/**
 * HOME'S RANKED SLATE, ONE FETCH.
 *
 * The Top 10 rail and the "Recommended for you" grid used to each call the
 * ranker independently — same profile, same pool, so both started with Joker,
 * The Godfather, Gangs of London… the same titles printed twice on one screen.
 *
 * One fetch now supplies both: the first 10 (numbered, tap-for-the-maths) go
 * to the rail, and the grid picks up at #11 — never a repeat.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { buildRecommendationSlate, type SlateItem } from '@/lib/actions/recommendations';
import { Top10Rail, type RailItem } from '@/components/Top10Rail';
import { PosterCard } from '@/components/PosterCard';
import { SaveButton } from '@/components/SaveButton';
import type { StandardContribution } from '@/lib/scoring/standardScore';

const TOP_COUNT = 10;
const GRID_COUNT = 10;

/** A slate item, plus the score's arithmetic once it's been fetched on demand. */
type Item = SlateItem & { work?: RailItem['work'] };

export function HomeRecommendations({ label }: { label?: string | null }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const loadedWork = useRef<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await buildRecommendationSlate({
        surface: 'home',
        excludeKeys: [],
        limit: TOP_COUNT + GRID_COUNT,
      });
      if (!live) return;
      if (!r.ok) setFailed(true);
      setItems(r.items);
    })();
    return () => {
      live = false;
    };
  }, []);

  // Fill in the working for a top-10 score the moment someone asks to see it.
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
          `${x.mediaType}:${x.id}` === key ? { ...x, work: { contributions, score: base, personalDelta: x.predicted - base } } : x,
        ),
      );
    } catch {
      /* the rail already says so when there is no working to show */
    }
  }, []);

  if (failed) return null;

  if (items && items.length === 0) {
    return (
      <section className="rounded-2xl border border-brand-400/30 bg-brand-500/10 p-5 text-center">
        <div className="text-2xl">🧬</div>
        <h2 className="mt-1 text-lg font-bold text-white">Your recommendations unlock fast</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-300">Rate a handful of titles and we’ll read your taste — then this fills with picks scored just for you, each with the reason it’s here.</p>
        <Link href="/app/quiz" className="btn-primary mt-4 inline-flex">Build my VERD1CT DNA →</Link>
      </section>
    );
  }

  if (items === null) {
    return <div className="h-48 animate-pulse rounded-xl bg-white/5" data-testid="top10-loading" />;
  }

  const top10: RailItem[] = items.slice(0, TOP_COUNT).map((i) => ({
    id: i.id,
    mediaType: i.mediaType,
    title: i.title,
    year: i.year,
    posterUrl: i.posterUrl,
    score: i.predicted,
    work: i.work,
  }));
  const rest = items.slice(TOP_COUNT);
  // Cold start = we have picks but none are seeded from something rated
  // ("because you liked …") — honest heading rather than a faked personal one.
  const cold = items.length > 0 && items.every((i) => !i.because);

  return (
    <>
      <Top10Rail title="Your Top 10 right now" eyebrow="ranked by your Watch DNA · tap a score to see the maths" items={top10} onExpand={loadWork} />

      {rest.length > 0 && (
        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-white">{cold ? 'More popular picks' : 'Recommended for you'}</h2>
            {cold ? (
              <p className="text-xs text-amber-200/90">
                We’re still getting to know you — these are well-loved, not yet personalized.{' '}
                <Link href="/app/quiz" className="font-semibold underline">Rate a few</Link> and this becomes truly yours.
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                Because of what you&apos;ve watched and rated · scored for {label ?? 'your match'}
              </p>
            )}
          </div>

          <div className="poster-grid">
            {rest.map((r) => (
              <PosterCard
                key={`${r.mediaType}-${r.id}`}
                href={`/app/title/${r.mediaType}/${r.id}`}
                title={r.title}
                year={r.year}
                mediaType={r.mediaType}
                posterUrl={r.posterUrl}
                overlay={
                  <SaveButton
                    wide
                    tmdbId={r.id}
                    mediaType={r.mediaType}
                    title={r.title}
                    year={r.year}
                    posterPath={r.posterPath}
                  />
                }
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
