'use client';

/**
 * THE SAMPLE RUN.
 *
 * Rapid Fire is meaningless without somebody's viewing history, which makes it
 * impossible to evaluate before handing over an export. This is the way in: a
 * realistic stand-in library you can actually play against.
 *
 * THE ONE HARD RULE: nothing here is written anywhere. `onAnswer` deliberately
 * does not persist — it only moves the local tally. A demo that quietly trained
 * the recommender on invented viewing would corrupt the exact thing this product
 * claims to protect, and the sample includes titles ("Cocomelon", "Love Is
 * Blind") chosen to be obviously not yours, so the damage would be visible.
 *
 * It says it is fake, at the top, permanently — not in a dismissible toast.
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { RapidFire } from '@/components/RapidFire';
import { buildQueue, summarise, type AnswerKey, type RapidFireItem } from '@/lib/import/rapidFire';
import { sampleObservations, sampleStats } from '@/lib/import/sampleLibrary';

export function RapidFireDemo() {
  // A fixed clock for the session so the queue does not reorder mid-play.
  const [now] = useState(() => Date.now());
  const queue = useMemo(() => buildQueue(sampleObservations(now), { now }), [now]);
  const [answers, setAnswers] = useState<AnswerKey[]>([]);
  const stats = sampleStats();
  const summary = summarise(answers, queue.length);

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl border-2 border-amber-400/50 bg-amber-500/10 p-4"
        data-testid="rapid-demo-notice"
      >
        <div className="text-sm font-black uppercase tracking-wide text-amber-200">Sample data</div>
        <p className="mt-1 text-sm leading-relaxed text-amber-100/90">
          This is an invented viewing history so you can try the game before importing anything.{' '}
          <strong className="font-bold">Nothing you tap here is saved</strong> — it does not touch your Watch DNA.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="rapid-demo-stats">
        <Stat label="Titles" value={stats.titles} />
        <Stat label="Abandoned" value={stats.abandoned} hint="asked first" />
        <Stat label="Rewatched" value={stats.rewatched} />
        <Stat label="Just “played”" value={stats.bareHistory} hint="worth almost nothing" />
      </div>

      <p className="text-sm leading-relaxed text-slate-400">
        That last number is the point. {stats.bareHistory} of these {stats.titles} only tell us you pressed play,
        which is worth a fifth of a thumbs-up. Answering turns them into something real — and the {stats.abandoned}{' '}
        you gave up on are the most valuable questions here, because no other service asks them.
      </p>

      <RapidFire
        queue={queue}
        // Nothing here reaches the DNA, so the finish screen must not offer to
        // show you what it changed. The honest next step is the import link
        // below, and that is the only one this screen makes.
        savesToDna={false}
        // Deliberately local-only. See the note at the top of this file.
        onAnswer={(_item: RapidFireItem, key: AnswerKey) => setAnswers((prev) => [...prev, key])}
      />

      {summary.taught > 0 && (
        <p className="text-xs text-slate-500" data-testid="rapid-demo-tally">
          In a real run, that would be {summary.taught} explicit opinion{summary.taught === 1 ? '' : 's'} in your DNA.
          Here it is nothing at all —{' '}
          <Link href="/import-taste" className="font-semibold text-brand-300 underline underline-offset-2">
            import your real history
          </Link>{' '}
          to make it count.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card p-3">
      <div className="text-2xl font-black tabular-nums text-white">{value}</div>
      <div className="text-xs font-semibold text-slate-400">{label}</div>
      {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}
