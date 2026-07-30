'use client';

import { useState } from 'react';
import { setTvReminder, removeTvReminder } from '@/lib/actions/tvReminders';

/**
 * The transmitter and its two arcs. Exported so the On TV guide — which has its
 * own button chrome — shows the same mark rather than a second idea of what a
 * reminder looks like.
 */
export function SignalIcon({ on, className = 'h-4 w-4' }: { on: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`wv-act-icon flex-none ${className}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none" />
      <path className={on ? 'wv-signal-arc-1' : ''} d="M5 13.5a5.5 5.5 0 0 1 5.5 5.5" />
      <path className={on ? 'wv-signal-arc-2' : ''} d="M5 8a11 11 0 0 1 11 11" />
    </svg>
  );
}

/**
 * "TELL ME WHEN IT'S ON."
 *
 * Was a 🔔 emoji. A bell is the same glyph every notification setting in every
 * app has used for fifteen years — it says "notifications exist", not "this
 * show, at this time, on this channel".
 *
 * So: a broadcast signal. A dot with two arcs leaving it, which is what a
 * transmitter looks like and what this button actually promises. The arcs
 * ANIMATE ONLY WHEN THE REMINDER IS SET — motion that means "this is live and
 * counting down", rather than decoration on a control nobody has used.
 *
 * The reminder is real: a row the server sends on, timed to the airing. It is
 * not a client-side timer that dies when the tab closes.
 */
export function RemindButton({
  airingId,
  showName,
  network,
  airstamp,
  url = '/app/tv',
  initialOn = false,
  onError,
  compact = false,
}: {
  airingId: number;
  showName: string;
  network: string | null;
  airstamp: string;
  url?: string;
  initialOn?: boolean;
  onError?: (message: string) => void;
  /** Icon-only, for a tight row. */
  compact?: boolean;
}) {
  const [on, setOn] = useState(initialOn);
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const next = !on;
    setOn(next); // optimistic — the button must answer the tap
    try {
      if (!next) {
        await removeTvReminder(airingId);
      } else {
        const r = await setTvReminder({ airingId, showName, network, airstamp, url });
        if (!r.ok) {
          setOn(false);
          onError?.(r.error ?? 'Could not set the reminder.');
        }
      }
    } catch {
      setOn(!next);
      onError?.('Could not set the reminder.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      data-testid="remind-button"
      data-on={on ? 'true' : 'false'}
      aria-label={on ? `Reminder set for ${showName}. Tap to cancel.` : `Remind me before ${showName} starts`}
      title={on ? 'Reminder set — tap to cancel' : 'Get a notification shortly before it airs'}
      className={`wv-act flex w-full items-center justify-center gap-1.5 rounded-xl border-2 font-bold transition disabled:opacity-60 ${
        on
          ? 'border-[#ff62b6] bg-gradient-to-b from-[#ff62b6] to-[#ff1493] text-white'
          : 'border-brand-400/60 bg-brand-500/15 text-brand-100 hover:bg-brand-500/30 hover:text-white'
      }`}
    >
      <SignalIcon on={on} />
      {!compact && (
        <span className="wv-act-label whitespace-nowrap font-black uppercase tracking-wide">
          {on ? 'Reminder on' : 'Remind me'}
        </span>
      )}
    </button>
  );
}
