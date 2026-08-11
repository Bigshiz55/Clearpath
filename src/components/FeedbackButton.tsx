'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { submitFeedbackReport } from '@/lib/actions/feedbackReport';

type Severity = 'low' | 'medium' | 'high';

/**
 * A small, unobtrusive feedback trigger reachable from every page — mounted
 * once in the root layout. Bottom-LEFT so it never collides with the
 * bottom-right DocketTray or the top-right QuickSearch trigger inside /app.
 *
 * HIDDEN ON THE PUBLIC MARKETING HOMEPAGE. Every other page in the app is a
 * scrolling list of cards with real gutters around them; the homepage is a
 * tight, mostly-centered single column, and being fixed to one spot on the
 * screen means this sits on top of whatever the page has scrolled to there —
 * verified to land on the hero's own icon, the CTA's trust line, and the
 * rule-grid's captions at different scroll depths, not a one-off. "Report a
 * bug in the app" also isn't very meaningful to a visitor who hasn't signed
 * in yet. Every other route is unaffected.
 */
export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function reset() {
    setDescription('');
    setSeverity(null);
    setError(null);
    setSent(false);
  }

  async function submit() {
    if (!description.trim()) {
      setError('Say what happened.');
      return;
    }
    setLoading(true);
    setError(null);
    const result = await submitFeedbackReport({
      description: description.trim(),
      severity,
      url: window.location.href,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not send that. Try again.');
      return;
    }
    setSent(true);
  }

  // Hooks above run unconditionally; the route check is the only thing that
  // decides whether this renders anything at all.
  if (pathname === '/') return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        data-testid="feedback-fab"
        // Global chrome, so it is hidden by any surface that declares itself
        // immersive (see `body[data-wv-immersive]` in globals.css). Marking the
        // element rather than listing routes here keeps this component from
        // needing to know which screens exist.
        data-wv-chrome="fab"
        className="fixed left-2 bottom-[calc(var(--wv-bottom-nav-h)+env(safe-area-inset-bottom)+0.75rem)] z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-ink-900/95 text-lg text-slate-200 shadow-lg transition hover:border-brand-400/60 hover:text-white active:scale-95 lg:left-4 lg:bottom-4"
      >
        <span aria-hidden>💬</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onClick={() => {
            setOpen(false);
            reset();
          }}
        >
          <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()} data-testid="feedback-modal">
            {sent ? (
              <div className="text-center">
                <div className="text-3xl">✅</div>
                <h3 className="mt-2 text-lg font-bold text-white">Thanks — sent</h3>
                <p className="mt-1 text-sm text-slate-400">
                  We captured this page, your account, the build, and your screen size along with it.
                </p>
                <button
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                  className="btn-primary mt-5 w-full"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold text-white">Send feedback</h3>
                <p className="mt-1 text-sm text-slate-400">Found a bug, or something feel off? Tell us what happened.</p>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What happened?"
                  rows={4}
                  className="input mt-4 resize-none"
                  autoFocus
                />
                <div className="mt-3 flex gap-2">
                  {(['low', 'medium', 'high'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSeverity(severity === s ? null : s)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-sm font-semibold capitalize transition ${
                        severity === s
                          ? 'border-brand-400/60 bg-brand-500/25 text-brand-100'
                          : 'border-white/15 bg-white/5 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
                <div className="mt-4 flex gap-2">
                  <button onClick={submit} disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Sending…' : 'Send'}
                  </button>
                  <button
                    onClick={() => {
                      setOpen(false);
                      reset();
                    }}
                    className="btn-ghost"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
