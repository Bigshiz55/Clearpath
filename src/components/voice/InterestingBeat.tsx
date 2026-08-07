'use client';

/**
 * THE "INTERESTING…" BEAT.
 *
 * The little human punctuation the interviewer makes when something lands — an
 * insight, a theory, a gentle challenge, the wrap. The engine already tags these
 * moments on the transcript (`TranscriptEntry.beat`); this surfaces the matching
 * one as a brief, tasteful floating cue. Purely presentational: give it a `beat`
 * and a `nonce` (bump the nonce to replay the same beat), and it animates in and
 * settles. The blanket `prefers-reduced-motion` rule in globals.css neutralises
 * the entrance for anyone who has asked for less motion.
 */
import type { TranscriptEntry } from '@/lib/voice/interview';

type Beat = NonNullable<TranscriptEntry['beat']>;

const BEATS: Record<Beat, { label: string; tone: string }> = {
  insight: { label: 'Interesting…', tone: 'text-brand-200 border-brand-400/40 bg-brand-500/10' },
  theory: { label: "Let's test a theory…", tone: 'text-gold-300 border-gold-400/40 bg-gold-500/10' },
  challenge: { label: 'Hold on…', tone: 'text-rose-200 border-rose-400/40 bg-rose-500/10' },
  wrap: { label: 'One more for you…', tone: 'text-emerald-200 border-emerald-400/40 bg-emerald-500/10' },
};

export function InterestingBeat({ beat, nonce = 0 }: { beat: Beat | null; nonce?: number }) {
  if (!beat) return null;
  const meta = BEATS[beat];
  return (
    <div
      // The key forces a fresh mount so the entrance animation replays each beat.
      key={`${beat}-${nonce}`}
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold shadow-glow ${meta.tone}`}
      style={{ animation: 'wv-pop 420ms cubic-bezier(0.22,1,0.36,1)' }}
      data-testid="interesting-beat"
      data-beat={beat}
      role="status"
      aria-live="polite"
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </div>
  );
}
