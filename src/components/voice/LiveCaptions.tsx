'use client';

/**
 * LIVE CAPTIONS.
 *
 * The running two-sided transcript: the interviewer's line (streaming, as it is
 * spoken) and the user's replies. The interviewer's current, still-streaming
 * line lives in an ARIA live region so a screen reader hears it grow; settled
 * lines scroll above it. Deliberately quiet styling — this is a caption track,
 * not a chat app.
 */
export interface CaptionLine {
  id: string;
  role: 'interviewer' | 'user';
  text: string;
}

export function LiveCaptions({
  lines,
  streaming,
  speaking,
}: {
  lines: CaptionLine[];
  /** The interviewer's in-progress line (not yet settled into `lines`). */
  streaming?: string;
  speaking?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="live-captions">
      <div className="max-h-64 overflow-y-auto pr-1" aria-hidden={false}>
        <ul className="flex flex-col gap-2">
          {lines.map((l) => (
            <li
              key={l.id}
              className={
                l.role === 'interviewer'
                  ? 'self-start rounded-2xl rounded-bl-sm bg-white/[0.06] px-3.5 py-2 text-sm text-slate-100'
                  : 'self-end rounded-2xl rounded-br-sm bg-brand-500/20 px-3.5 py-2 text-sm text-brand-50'
              }
            >
              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {l.role === 'interviewer' ? 'Interviewer' : 'You'}
              </span>
              {l.text}
            </li>
          ))}
        </ul>
      </div>

      {/* The streaming interviewer line — announced politely as it grows. */}
      <p
        className="min-h-[1.5rem] text-base font-medium text-white"
        data-testid="caption-streaming"
        aria-live="polite"
        aria-atomic="true"
      >
        {streaming ? (
          <span>
            {streaming}
            {speaking ? <span className="ml-0.5 inline-block animate-pulse text-brand-300">▍</span> : null}
          </span>
        ) : null}
      </p>
    </div>
  );
}
