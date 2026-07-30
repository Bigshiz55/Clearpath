'use client';

import { useState } from 'react';
import { VETO_TOKENS_PER_MEMBER, type VoteAction } from '@/lib/court/voting';

/**
 * THE VOTING FLOOR — the moment after "Build our court".
 *
 * One large primary candidate card plus a compact poster rail holding all six
 * active options, so the tray stays usable one-handed on a phone without ever
 * showing six full cards at once.
 *
 * Ballots are hidden until you vote: the tally simply is not rendered, and the
 * server refuses to send it, so the UI cannot leak what it does not have.
 */

export interface FloorCandidate {
  key: string;
  title: string;
  posterUrl: string | null;
  genre: string | null;
  runtimeMinutes: number | null;
  availableOn: string[];
  reason: string | null;
  youVoted: boolean;
  yourAction: VoteAction | null;
  tally: Partial<Record<VoteAction, number>> | null;
  votedBy: string[];
}

const ACTIONS: { action: VoteAction; label: string; className: string }[] = [
  { action: 'watch_it', label: 'Watch it', className: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25' },
  { action: 'maybe', label: 'Maybe', className: 'border-amber-400/50 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25' },
  { action: 'veto', label: 'Veto', className: 'border-red-400/50 bg-red-500/15 text-red-100 hover:bg-red-500/25' },
  { action: 'seen_it', label: 'Seen it', className: 'border-white/20 bg-white/[0.06] text-slate-200 hover:bg-white/[0.12]' },
];

export function VotingFloor({
  candidates,
  memberCount,
  vetoTokensLeft,
  reserveCount,
  onVote,
}: {
  candidates: FloorCandidate[];
  memberCount: number;
  vetoTokensLeft: number;
  reserveCount: number;
  onVote: (key: string, action: VoteAction) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [index, setIndex] = useState(0);
  const [pendingVeto, setPendingVeto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = candidates[Math.min(index, candidates.length - 1)];

  if (!current) {
    return (
      <div data-testid="floor-empty" className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <p className="font-semibold text-white">No candidates left</p>
        <p className="mt-1 text-sm text-slate-400">
          Every title has been vetoed or seen. Loosen a constraint, or reopen the shortlist.
        </p>
      </div>
    );
  }

  async function cast(action: VoteAction) {
    if (!current) return;
    // Veto is destructive for the whole room: confirm once before spending.
    if (action === 'veto' && pendingVeto !== current.key) {
      setPendingVeto(current.key);
      return;
    }
    setPendingVeto(null);
    setBusy(true);
    setError(null);
    const res = await onVote(current.key, action);
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'Could not record that vote.');
  }

  const totalVotes = current.tally ? Object.values(current.tally).reduce((a, b) => a + (b ?? 0), 0) : 0;

  return (
    <div data-testid="voting-floor" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span data-testid="veto-tokens" className="rounded-lg border border-red-400/40 bg-red-500/10 px-2.5 py-1 font-bold text-red-100">
          {vetoTokensLeft} of {VETO_TOKENS_PER_MEMBER} vetoes left
        </span>
        <span className="text-slate-400">
          {candidates.length} in play · {reserveCount} held in reserve
        </span>
      </div>

      <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="flex gap-4 p-4">
          {current.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.posterUrl} alt={`Poster for ${current.title}`} className="h-40 w-28 flex-none rounded-xl border border-white/10 object-cover" />
          ) : (
            <div className="grid h-40 w-28 flex-none place-items-center rounded-xl border border-white/10 bg-white/5 text-[11px] text-slate-500">
              No artwork
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 data-testid="candidate-title" className="text-lg font-black leading-tight text-white">{current.title}</h2>
            <p className="mt-1 text-xs text-slate-400">
              {[current.genre, current.runtimeMinutes ? `${current.runtimeMinutes} min` : null].filter(Boolean).join(' · ')}
            </p>
            {current.availableOn.length > 0 ? (
              <p data-testid="candidate-availability" className="mt-2 text-xs text-slate-300">📺 {current.availableOn.join(', ')}</p>
            ) : (
              <p data-testid="candidate-availability" className="mt-2 text-xs text-amber-200">Availability unconfirmed</p>
            )}
            {current.reason && <p data-testid="candidate-reason" className="mt-2 text-sm text-slate-300">{current.reason}</p>}
          </div>
        </div>

        <div className="border-t border-white/10 p-3">
          {pendingVeto === current.key && (
            <p data-testid="veto-confirm" className="mb-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
              Veto removes this for everyone and spends a token. Tap Veto again to confirm.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ACTIONS.map((a) => (
              <button
                key={a.action}
                data-testid={`vote-${a.action}`}
                disabled={busy || current.youVoted}
                onClick={() => cast(a.action)}
                aria-pressed={current.yourAction === a.action}
                className={`min-h-[48px] rounded-xl border px-3 py-2 text-sm font-bold transition disabled:opacity-40 ${a.className}`}
              >
                {a.action === 'veto' && pendingVeto === current.key ? 'Confirm veto' : a.label}
              </button>
            ))}
          </div>
          {error && <p data-testid="vote-error" role="alert" className="mt-2 text-xs text-red-300">{error}</p>}

          <div className="mt-3 text-xs" data-testid="ballot-state">
            {current.youVoted && current.tally ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-300">
                <span className="font-bold text-white">Room so far:</span>
                {ACTIONS.map((a) => (
                  <span key={a.action}>{a.label} <b className="tabular-nums">{current.tally?.[a.action] ?? 0}</b></span>
                ))}
                <span className="text-slate-500">{totalVotes} of {memberCount} voted</span>
              </div>
            ) : (
              <p className="text-slate-400">
                {current.votedBy.length} of {memberCount} have voted — choices stay hidden until you cast yours.
              </p>
            )}
          </div>
        </div>
      </article>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">In play</p>
        <ul data-testid="candidate-tray" className="flex gap-2 overflow-x-auto pb-1">
          {candidates.map((c, i) => (
            <li key={c.key} className="flex-none">
              <button
                data-testid="tray-item"
                onClick={() => setIndex(i)}
                aria-current={i === index}
                className={`w-20 rounded-lg border p-1.5 text-left transition ${i === index ? 'border-brand-400/70 bg-brand-500/15' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'}`}
              >
                <span className="block truncate text-[11px] font-semibold text-white">{c.title}</span>
                <span className={`mt-0.5 block text-[10px] ${c.youVoted ? 'text-emerald-300' : 'text-slate-500'}`}>
                  {c.youVoted ? 'voted' : 'not yet'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
