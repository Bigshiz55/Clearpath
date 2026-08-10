'use client';

/**
 * THE END — no speech, no summary paragraph, no congratulation.
 *
 * Two things happen here, in order. First, the at-most-two questions that the
 * ratings raised (see `ambiguity.ts`) — this is the only place an LLM-shaped
 * problem appears in the whole flow, and it is answered with two buttons, not a
 * conversation. Then the DNA itself: the numbers the user just gave, biggest
 * first, so the thing they spent a minute on is visible as a result rather than
 * described back to them.
 *
 * The primary action is deliberately not "do it again" — it is the payoff.
 */

import { CALIBRATION_ITEMS, itemById } from '@/lib/voice/calibration/items';
import type { AmbiguityQuestion } from '@/lib/voice/calibration/ambiguity';

function Row({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center gap-3" data-testid="dna-row">
      <span className="w-40 shrink-0 truncate text-sm text-slate-300 sm:w-52">{label}</span>
      <span className="h-2 grow overflow-hidden rounded-full bg-white/10">
        <span
          className="block h-full rounded-full bg-emerald-400"
          style={{ width: `${value * 10}%` }}
        />
      </span>
      <span className="w-7 shrink-0 text-right font-bold tabular-nums text-white">{value}</span>
    </li>
  );
}

export function CalibrationSummary({
  ratings,
  elapsedMs,
  saving,
  error,
  followups,
  followupIndex,
  onAnswerFollowup,
  onShowPicks,
  onFineTune,
}: {
  ratings: Record<string, number>;
  elapsedMs: number | null;
  saving: boolean;
  error: string | null;
  followups: AmbiguityQuestion[];
  followupIndex: number;
  onAnswerFollowup: (question: AmbiguityQuestion, positive: boolean) => void;
  onShowPicks: () => void;
  onFineTune: () => void;
}) {
  const pending = followups[followupIndex];

  if (pending) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col justify-center gap-8 px-5">
        <p className="text-sm text-slate-400">
          Last thing{followups.length > 1 ? ` — ${followupIndex + 1} of ${followups.length}` : ''}
        </p>
        <h2 data-testid="followup-question" className="text-2xl font-bold text-white sm:text-3xl">
          {pending.question}
        </h2>
        <div className="flex gap-3">
          <button
            type="button"
            data-testid="followup-positive"
            onClick={() => onAnswerFollowup(pending, true)}
            className="btn-primary grow py-4 text-lg"
          >
            {pending.positiveLabel}
          </button>
          <button
            type="button"
            data-testid="followup-negative"
            onClick={() => onAnswerFollowup(pending, false)}
            className="grow rounded-lg bg-white/10 py-4 text-lg font-semibold text-white hover:bg-white/20"
          >
            {pending.negativeLabel}
          </button>
        </div>
      </div>
    );
  }

  const rows = CALIBRATION_ITEMS.map((i) => ({ id: i.id, label: itemById(i.id)?.label ?? i.id, value: ratings[i.id] }))
    .filter((r): r is { id: string; label: string; value: number } => typeof r.value === 'number')
    .sort((a, b) => b.value - a.value);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col justify-center gap-7 px-5">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight text-white sm:text-4xl">
          Your Verd1ct DNA
        </h1>
        {elapsedMs !== null && (
          <p className="mt-1 text-sm text-slate-400" data-testid="calibration-elapsed" data-ms={elapsedMs}>
            {Math.round(elapsedMs / 1000)} seconds
          </p>
        )}
      </div>

      <ul className="flex flex-col gap-2" data-testid="dna-summary">
        {rows.map((r) => (
          <Row key={r.id} label={r.label} value={r.value} />
        ))}
      </ul>

      <p className="text-slate-200" data-testid="calibration-done">
        Got it. WatchVerd1ct knows you a lot better now.
      </p>

      {error && <p className="text-sm text-amber-200">{error}</p>}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          data-testid="show-picks"
          disabled={saving}
          onClick={onShowPicks}
          className="btn-primary py-4 text-lg disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Show me what I should watch'}
        </button>
        <button
          type="button"
          data-testid="fine-tune"
          onClick={onFineTune}
          className="rounded-lg py-3 text-sm text-slate-300 hover:bg-white/10"
        >
          Fine-tune my DNA
        </button>
      </div>
    </div>
  );
}
