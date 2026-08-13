'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store/StoreProvider';
import { Button } from '@/components/ui/Button';

// The Reading Appeal — after a meaningful reading point, reassess. Captures the
// struggle, gives an honest spoiler-safe decision, and feeds Reader DNA.

const RESPONSES: { value: string; label: string }[] = [
  { value: 'hooked', label: 'I’m hooked' },
  { value: 'unsure', label: 'Interested but unsure' },
  { value: 'dragging', label: 'It is dragging' },
  { value: 'confused', label: 'I am confused' },
  { value: 'characters', label: 'I dislike the characters' },
  { value: 'writing', label: 'The writing isn’t working' },
  { value: 'may_quit', label: 'I may quit' },
  { value: 'finished', label: 'I finished it' },
];

function decide(reason: string): { decision: string; text: string; likely: string } {
  switch (reason) {
    case 'hooked':
      return { decision: 'continue', text: 'CONTINUE', likely: 'The case is going your way — keep reading.' };
    case 'unsure':
      return { decision: 'checkpoint', text: 'CONTINUE TO A CHECKPOINT', likely: 'Give it to the next natural break, then reassess.' };
    case 'dragging':
      return { decision: 'continue', text: 'THE PROBLEM MAY IMPROVE', likely: 'Pacing complaints sometimes ease after the setup — but we can’t promise it.' };
    case 'confused':
      return { decision: 'continue', text: 'CONTINUE TO A CHECKPOINT', likely: 'Complex openings often cohere later; give it a bit more.' };
    case 'characters':
    case 'writing':
      return { decision: 'dismiss', text: 'THE PROBLEM IS UNLIKELY TO CHANGE', likely: 'Prose and character voice rarely shift — dismissing without guilt is fair.' };
    case 'may_quit':
      return { decision: 'dismiss', text: 'DISMISS WITHOUT GUILT', likely: 'Life’s too short for a book fighting you. Your DNA will remember why.' };
    case 'finished':
      return { decision: 'finished', text: 'CASE CLOSED', likely: 'Nicely done — mark it finished and tell us if the verdict was right.' };
    default:
      return { decision: 'continue', text: 'CONTINUE', likely: '' };
  }
}

export function AppealDialog({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const store = useStore();
  const [page, setPage] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const outcome = reason ? decide(reason) : null;

  const submit = () => {
    if (!reason || !outcome) return;
    const now = new Date().toISOString();
    store.recordAppeal({
      entryId,
      page: page ? Number(page) : undefined,
      reason,
      decision: outcome.decision,
    });
    store.track('appeal_filed', { reason, decision: outcome.decision });

    // Feed Reader DNA with a modest signal from the struggle.
    if (reason === 'dragging') store.applyObservations([{ key: 'slow_burn_tolerance', observed: 0.2, weight: 0.4, at: now }]);
    if (reason === 'finished') store.setStatus(entryId, 'finished');
    if (reason === 'may_quit') store.markDnf(entryId, 'lost_interest');

    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="File a reading appeal"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl font-semibold text-ivory-50">File a reading appeal</h2>
        <p className="mt-1 text-sm text-ivory-300">Has the defendant changed your mind?</p>

        <label className="mt-4 block text-sm text-ivory-200">
          Where are you? (page, optional)
          <input
            type="number"
            value={page}
            onChange={(e) => setPage(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-600 bg-ink-850 px-3 py-2 text-ivory-100 focus:border-copper-500 focus:outline-none"
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          {RESPONSES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setReason(r.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                reason === r.value
                  ? 'border-copper-500/60 bg-copper-500/10 text-copper-200'
                  : 'border-ink-600 bg-ink-850 text-ivory-200 hover:border-ink-500'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {outcome && (
          <div className="mt-4 rounded-xl border border-copper-500/30 bg-copper-500/5 p-4">
            <span className="file-stamp">{outcome.text}</span>
            <p className="mt-2 text-sm text-ivory-200">{outcome.likely}</p>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!reason} onClick={submit}>Record appeal</Button>
        </div>
      </div>
    </div>
  );
}
