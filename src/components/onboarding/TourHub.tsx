'use client';

/**
 * THE TOUR — a topic picker, not a script.
 *
 * The old version marched everyone through the same six slides in the same
 * order, whether they cared about the Verdict Room or had already found it
 * on their own. This is a small help-center home instead: pick what you want
 * to learn about, read it, go back and pick something else — or don't, and
 * every topic has its own way back to the app. Still explicit, opt-in, never
 * auto-shown (see TourHint.tsx) — reachable from the nav's "How it works"
 * entry at any time.
 *
 * Content lives in tourTopics.ts, kept separate from this shell so the copy
 * is one plain array, not JSX buried in component logic.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { TOUR_TOPICS, type TourTopic } from './tourTopics';
import { CardControlsExplainer } from '@/components/landing/HowYouRule';

const SEEN_KEY = 'wv.tour.seen.v1';

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode — the hint just shows again next session, harmless */
  }
}

export function TourHub() {
  const [selected, setSelected] = useState<string | null>(null);

  // Arriving here at all is "taking the tour" — TourHint's own CTA says
  // exactly that — so there is no separate finish/skip action left to mark
  // it seen with.
  useEffect(() => {
    markSeen();
  }, []);

  const topic = selected ? TOUR_TOPICS.find((t) => t.id === selected) : null;

  if (!topic) {
    return <TopicGrid onSelect={setSelected} />;
  }
  return <TopicDetail topic={topic} onBack={() => setSelected(null)} onSelect={setSelected} />;
}

function TopicGrid({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="text-center">
        <span aria-hidden className="text-5xl">
          🏛️
        </span>
        <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">How WatchVerd1ct works</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Pick what you want to learn about — no set order, nothing forced.</p>
      </div>

      <div className="mx-auto mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="tour-topics">
        {TOUR_TOPICS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            data-testid={`tour-topic-${t.id}`}
            className="card flex flex-col items-start gap-1.5 border border-white/10 p-4 text-left transition hover:border-[#ff1493]/50 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff1493]/60"
          >
            <span aria-hidden className="text-3xl">
              {t.icon}
            </span>
            <span className="text-sm font-black text-white">{t.title}</span>
            <span className="text-xs leading-snug text-slate-400">{t.teaser}</span>
          </button>
        ))}
      </div>

      <div className="mt-8 text-center">
        <Link href="/app" data-testid="tour-done" className="btn-secondary inline-flex">
          Done — take me to the app
        </Link>
      </div>
    </div>
  );
}

function TopicDetail({
  topic,
  onBack,
  onSelect,
}: {
  topic: TourTopic;
  onBack: () => void;
  onSelect: (id: string) => void;
}) {
  const index = TOUR_TOPICS.findIndex((t) => t.id === topic.id);
  const isFirst = index === 0;
  const isLast = index === TOUR_TOPICS.length - 1;

  return (
    <div className="mx-auto w-full max-w-lg">
      <button
        type="button"
        onClick={onBack}
        data-testid="tour-back-to-topics"
        className="mb-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl text-sm font-semibold text-slate-400 transition hover:bg-white/5 hover:text-white"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" /> All topics
      </button>

      <div className="card wv-tile p-6 text-center sm:p-8" data-testid={`tour-topic-detail-${topic.id}`}>
        <span aria-hidden className="text-5xl">
          {topic.icon}
        </span>
        <h1 className="mt-4 text-2xl font-black text-white sm:text-3xl">{topic.title}</h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-slate-300">{topic.body}</p>

        {topic.id === 'controls' && <CardControlsExplainer className="mx-auto mt-5 max-w-md" />}

        {topic.bullets && topic.bullets.length > 0 && (
          <ul className="mx-auto mt-4 max-w-md space-y-2 text-left">
            {topic.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-slate-300">
                <span aria-hidden className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-[#ff1493]" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}

        {topic.actions && topic.actions.length > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {topic.actions.map((a, i) => (
              <Link
                key={a.href + a.label}
                href={a.href}
                data-testid={`tour-action-${topic.id}`}
                className={i === 0 ? 'btn-primary px-4 py-2 text-sm' : 'btn-ghost px-4 py-2 text-sm'}
              >
                {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onSelect(TOUR_TOPICS[index - 1]!.id)}
          disabled={isFirst}
          data-testid="tour-prev-topic"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" /> Prev
        </button>

        <span className="text-xs font-semibold text-slate-500">
          {index + 1} of {TOUR_TOPICS.length}
        </span>

        <button
          type="button"
          onClick={() => onSelect(TOUR_TOPICS[index + 1]!.id)}
          disabled={isLast}
          data-testid="tour-next-topic"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
        >
          Next <ArrowRight aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export { SEEN_KEY };
