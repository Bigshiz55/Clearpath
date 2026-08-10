'use client';

/**
 * THE RESULT — what eighty seconds bought.
 *
 * Two layers, and the second is the one that makes this feel different from a
 * survey. The bars are the strongest individual traits, for recognition. The
 * chips are the COMPARATIVE claims — "Grounded > supernatural", "Investigation
 * first" — which is the shape of an actual insight and the thing a list of
 * genre scores can never say.
 *
 * No speech, no congratulation, no paragraph explaining what just happened.
 */

import { insightChips, dnaBars } from '@/lib/voice/quickdna/synthesis';
import type { TraitProfile } from '@/lib/voice/quickdna/traits';
import type { QuickSignal } from '@/lib/voice/quickdna/run';

export function QuickDnaSummary({
  profile,
  signals,
  elapsedMs,
  saving,
  error,
  onShowPicks,
  onDeepDna,
}: {
  profile: TraitProfile;
  signals: QuickSignal[];
  elapsedMs: number;
  saving: boolean;
  error: string | null;
  onShowPicks: () => void;
  onDeepDna: () => void;
}) {
  const bars = dnaBars(profile);
  const chips = insightChips(profile);
  const meaningful = signals.filter((s) => !(s.kind === 'title' && s.value === 'pass')).length;

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col justify-center gap-7 px-5">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight text-white sm:text-4xl">
          Your Verd1ct DNA
        </h1>
        <p
          className="mt-1 text-sm text-slate-400"
          data-testid="quickdna-elapsed"
          data-ms={elapsedMs}
          data-signals={meaningful}
        >
          {meaningful} signals in {Math.round(elapsedMs / 1000)} seconds
        </p>
      </div>

      <ul className="flex flex-col gap-2" data-testid="quickdna-bars">
        {bars.map((b) => (
          <li key={b.key} className="flex items-center gap-3" data-testid="dna-bar">
            <span className="w-44 shrink-0 truncate text-sm text-slate-300 sm:w-56">{b.label}</span>
            <span className="h-2 grow overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${b.score * 10}%` }} />
            </span>
            <span className="w-7 shrink-0 text-right font-bold tabular-nums text-white">{b.score}</span>
          </li>
        ))}
      </ul>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="quickdna-chips">
          {chips.map((c) => (
            <span
              key={c.id}
              data-testid="dna-chip"
              className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200"
            >
              {c.text}
            </span>
          ))}
        </div>
      )}

      <p className="text-slate-200" data-testid="quickdna-done">
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
          data-testid="deep-dna"
          onClick={onDeepDna}
          className="rounded-lg py-3 text-sm text-slate-300 hover:bg-white/10"
        >
          Fine-tune my DNA
        </button>
      </div>
    </div>
  );
}
